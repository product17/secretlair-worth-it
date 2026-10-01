import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { z } from 'zod'
import {
  catalogSchema,
  printingDetailsSchema,
  shopSnapshotSchema,
  type CardFace,
  type CardSummary,
  type Catalog,
  type ImageUris,
  type Printing,
  type PrintingDetails,
  type SecretLairGroup,
  type ShopSnapshot,
  type ValueSummary,
} from '../src/types/catalog.ts'
import { fetchShopProducts } from '../src/data/shop.ts'
import {
  fetchDefaultCardsMetadata,
  fetchSldGroups,
  getScryfallDisplayName,
  getScryfallOracleId,
  resolveSldCards,
  streamDefaultCards,
  type ParsedSldGroup,
  type ScryfallCard,
  type ScryfallCardFace,
  type ScryfallImageUris,
} from './lib/scryfall.ts'
import {
  calculateBlendedPrintingValue,
  calculateExactPrintingValue,
  calculateFinishFloor,
  getEligibleUsdPrice,
  getExactPrintingPrice,
  type FloorFinish,
  type UsdFinish,
} from './lib/valuation.ts'

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))
const DATA_DIRECTORY = path.join(PROJECT_ROOT, 'public', 'data')
const PRINTINGS_DIRECTORY = path.join(DATA_DIRECTORY, 'printings')
const GENERATED_FILES = ['catalog.json', 'shop.json', 'diagnostics.json'] as const
const SUPPORTED_FINISHES = ['nonfoil', 'foil', 'etched'] as const

const diagnosticsSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  scryfallUpdatedAt: z.string().datetime(),
  unmatchedSldCardIds: z.array(z.string().uuid()),
  counts: z.object({
    groups: z.number().int().positive(),
    groupedCardReferences: z.number().int().positive(),
    uniqueSldCards: z.number().int().positive(),
    oracleIds: z.number().int().positive(),
    bulkCardsRead: z.number().int().positive(),
    eligiblePrintings: z.number().int().nonnegative(),
    shopProducts: z.number().int().nonnegative(),
  }),
  timestamps: z.object({
    startedAt: z.string().datetime(),
    groupsFetchedAt: z.string().datetime(),
    sldCardsResolvedAt: z.string().datetime(),
    bulkStartedAt: z.string().datetime(),
    bulkCompletedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
  }),
})

type Diagnostics = z.infer<typeof diagnosticsSchema>

const validateSchema = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(`${label} schema validation failed: ${result.error.message}`)
  }

  return result.data
}

const mapImageUris = (
  imageUris: ScryfallImageUris | null | undefined,
): ImageUris | undefined => {
  if (!imageUris) {
    return undefined
  }

  const mappedImageUris: ImageUris = {}
  const mappings: Array<
    [keyof ScryfallImageUris, keyof ImageUris]
  > = [
    ['small', 'small'],
    ['normal', 'normal'],
    ['large', 'large'],
    ['png', 'png'],
    ['art_crop', 'artCrop'],
    ['border_crop', 'borderCrop'],
  ]

  for (const [sourceKey, targetKey] of mappings) {
    const value = imageUris[sourceKey]
    if (typeof value === 'string') {
      mappedImageUris[targetKey] = value
    }
  }

  return Object.keys(mappedImageUris).length > 0 ? mappedImageUris : undefined
}

const mapCardFaces = (
  cardFaces: ScryfallCardFace[] | undefined,
): CardFace[] | undefined => {
  if (!cardFaces || cardFaces.length === 0) {
    return undefined
  }

  return cardFaces.map((face) => {
    const imageUris = mapImageUris(face.image_uris)
    return {
      name: face.name,
      ...(imageUris ? { imageUris } : {}),
    }
  })
}

const getPrintingPrice = (
  card: ScryfallCard,
  finish: UsdFinish,
): number | null => getEligibleUsdPrice(card, finish)

const mapPrinting = (card: ScryfallCard): Printing | null => {
  const prices = {
    nonfoil: getPrintingPrice(card, 'nonfoil'),
    foil: getPrintingPrice(card, 'foil'),
    etched: getPrintingPrice(card, 'etched'),
  }

  if (Object.values(prices).every((price) => price === null)) {
    return null
  }

  const finishes = SUPPORTED_FINISHES.filter((finish) =>
    card.finishes?.includes(finish),
  )
  const imageUris = mapImageUris(card.image_uris)
  const cardFaces = mapCardFaces(card.card_faces)

  return {
    id: card.id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    releasedAt: card.released_at,
    finishes: [...finishes],
    prices,
    ...(imageUris ? { imageUris } : {}),
    ...(cardFaces ? { cardFaces } : {}),
    scryfallUri: card.scryfall_uri,
  }
}

const sortPrintings = (printings: Printing[]): Printing[] =>
  printings.sort(
    (left, right) =>
      left.releasedAt.localeCompare(right.releasedAt) ||
      left.setCode.localeCompare(right.setCode) ||
      left.collectorNumber.localeCompare(right.collectorNumber, undefined, {
        numeric: true,
      }) ||
      left.id.localeCompare(right.id),
  )

const createValueSummary = (
  cards: readonly CardSummary[],
  finish: FloorFinish,
): ValueSummary => {
  const floorKey = finish === 'nonfoil' ? 'nonfoilFloor' : 'foilFloor'
  const prices = cards
    .map((card) => card[floorKey].price)
    .filter((price): price is number => price !== null)

  return {
    total: Math.round(prices.reduce((total, price) => total + price, 0) * 100) /
      100,
    pricedCardCount: prices.length,
    cardCount: cards.length,
  }
}

const createCardSummary = (
  card: ScryfallCard,
  oraclePrintings: readonly ScryfallCard[],
): CardSummary => {
  const oracleId = getScryfallOracleId(card)

  if (!oracleId) {
    throw new Error(`SLD card ${card.id} is missing an Oracle ID`)
  }

  const imageUris = mapImageUris(card.image_uris)
  const cardFaces = mapCardFaces(card.card_faces)

  return {
    id: card.id,
    oracleId,
    name: getScryfallDisplayName(card),
    collectorNumber: card.collector_number,
    ...(imageUris ? { imageUris } : {}),
    ...(cardFaces ? { cardFaces } : {}),
    scryfallUri: card.scryfall_uri,
    nonfoilMarketPrice: getExactPrintingPrice(card, 'nonfoil'),
    foilMarketPrice: getExactPrintingPrice(card, 'foil'),
    nonfoilFloor: calculateFinishFloor(oraclePrintings, 'nonfoil'),
    foilFloor: calculateFinishFloor(oraclePrintings, 'foil'),
  }
}

const validateGroups = (groups: readonly ParsedSldGroup[]): void => {
  if (groups.length === 0) {
    throw new Error('Cannot generate data without SLD groups')
  }

  const seenSlugs = new Set<string>()
  const seenTitles = new Set<string>()

  for (const group of groups) {
    if (group.cardIds.length === 0) {
      throw new Error(`SLD group "${group.title}" has no cards`)
    }

    if (seenSlugs.has(group.slug) || seenTitles.has(group.title)) {
      throw new Error(`Duplicate SLD group "${group.title}"`)
    }

    seenSlugs.add(group.slug)
    seenTitles.add(group.title)
  }
}

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const replaceGeneratedData = async (
  catalog: Catalog,
  shopSnapshot: ShopSnapshot,
  diagnostics: Diagnostics,
  printingDetails: readonly PrintingDetails[],
): Promise<void> => {
  await mkdir(DATA_DIRECTORY, { recursive: true })
  await Promise.all([
    ...GENERATED_FILES.map((fileName) =>
      rm(path.join(DATA_DIRECTORY, fileName), { force: true }),
    ),
    rm(PRINTINGS_DIRECTORY, { recursive: true, force: true }),
  ])
  await mkdir(PRINTINGS_DIRECTORY, { recursive: true })

  await Promise.all([
    writeJson(path.join(DATA_DIRECTORY, 'catalog.json'), catalog),
    writeJson(path.join(DATA_DIRECTORY, 'shop.json'), shopSnapshot),
    writeJson(path.join(DATA_DIRECTORY, 'diagnostics.json'), diagnostics),
    ...printingDetails.map((details) =>
      writeJson(
        path.join(PRINTINGS_DIRECTORY, `${details.oracleId}.json`),
        details,
      ),
    ),
  ])
}

const generateData = async (): Promise<void> => {
  const startedAt = new Date()
  const [groups, shopProducts] = await Promise.all([
    fetchSldGroups(),
    fetchShopProducts(fetch, startedAt),
  ])
  const groupsFetchedAt = new Date()
  validateGroups(groups)

  const groupedCardIds = groups.flatMap((group) => group.cardIds)
  const uniqueSldCardIds = [...new Set(groupedCardIds)]
  const resolvedSldCards = await resolveSldCards(uniqueSldCardIds)
  const unresolvedCollectionIds = resolvedSldCards.unmatchedCardIds
  const targetOracleIds = new Set<string>()

  for (const cardId of uniqueSldCardIds) {
    const resolvedCard = resolvedSldCards.cardsById.get(cardId)
    const oracleId = resolvedCard
      ? getScryfallOracleId(resolvedCard)
      : null

    if (!oracleId) {
      unresolvedCollectionIds.push(cardId)
      continue
    }
    targetOracleIds.add(oracleId)
  }

  const uniqueUnresolvedCollectionIds = [...new Set(unresolvedCollectionIds)]
    .sort()
  if (uniqueUnresolvedCollectionIds.length > 0) {
    throw new Error(
      `Unable to resolve ${uniqueUnresolvedCollectionIds.length} SLD card IDs: ${uniqueUnresolvedCollectionIds.join(', ')}`,
    )
  }

  const sldCardsResolvedAt = new Date()
  const bulkMetadata = await fetchDefaultCardsMetadata()
  const targetSldCardIds = new Set(uniqueSldCardIds)
  const bulkSldCardsById = new Map<string, ScryfallCard>()
  const oraclePrintings = new Map<string, ScryfallCard[]>()
  const bulkStartedAt = new Date()

  const bulkCardsRead = await streamDefaultCards(
    bulkMetadata.jsonlDownloadUri,
    (card) => {
      if (targetSldCardIds.has(card.id)) {
        bulkSldCardsById.set(card.id, card)
      }

      const oracleId = getScryfallOracleId(card)
      if (!oracleId || !targetOracleIds.has(oracleId)) {
        return
      }

      if (
        SUPPORTED_FINISHES.every(
          (finish) => getEligibleUsdPrice(card, finish) === null,
        )
      ) {
        return
      }

      const printings = oraclePrintings.get(oracleId) ?? []
      printings.push(card)
      oraclePrintings.set(oracleId, printings)
    },
  )

  const bulkCompletedAt = new Date()
  const unmatchedSldCardIds = uniqueSldCardIds
    .filter((cardId) => !bulkSldCardsById.has(cardId))
    .sort()

  if (unmatchedSldCardIds.length > 0) {
    throw new Error(
      `Scryfall bulk data did not contain ${unmatchedSldCardIds.length} SLD card IDs: ${unmatchedSldCardIds.join(', ')}`,
    )
  }

  const catalogGroups: SecretLairGroup[] = groups.map((group) => {
    const sldCards = group.cardIds.map((cardId) => {
      const card = bulkSldCardsById.get(cardId)
      const oracleId = card ? getScryfallOracleId(card) : null
      if (!card || !oracleId) {
        throw new Error(`SLD card ${cardId} is unresolved after bulk ingestion`)
      }

      return card
    })
    const cards = sldCards.map((card) => {
      const oracleId = getScryfallOracleId(card)
      if (!oracleId) {
        throw new Error(`SLD card ${card.id} is missing an Oracle ID`)
      }

      return createCardSummary(
        card,
        oraclePrintings.get(oracleId) ?? [],
      )
    })

    return {
      slug: group.slug,
      title: group.title,
      cards,
      nonfoilValue: createValueSummary(cards, 'nonfoil'),
      foilValue: createValueSummary(cards, 'foil'),
      nonfoilMarketValue: calculateExactPrintingValue(
        sldCards,
        'nonfoil',
      ),
      foilMarketValue: calculateExactPrintingValue(sldCards, 'foil'),
      nonfoilBlendedValue: calculateBlendedPrintingValue(
        sldCards,
        'nonfoil',
        cards.map((card) => card.nonfoilFloor.price),
      ),
      foilBlendedValue: calculateBlendedPrintingValue(
        sldCards,
        'foil',
        cards.map((card) => card.foilFloor.price),
      ),
    }
  })

  const generatedAt = new Date()
  const generatedAtIso = generatedAt.toISOString()
  const catalog = validateSchema(
    catalogSchema,
    {
      schemaVersion: 4,
      generatedAt: generatedAtIso,
      scryfallUpdatedAt: new Date(bulkMetadata.updatedAt).toISOString(),
      groupCount: catalogGroups.length,
      cardCount: groupedCardIds.length,
      groups: catalogGroups,
    },
    'catalog.json',
  )
  const shopSnapshot = validateSchema(
    shopSnapshotSchema,
    {
      schemaVersion: 1,
      generatedAt: generatedAtIso,
      products: shopProducts,
    },
    'shop.json',
  )

  const firstNameByOracleId = new Map<string, string>()
  for (const group of catalogGroups) {
    for (const card of group.cards) {
      if (!firstNameByOracleId.has(card.oracleId)) {
        firstNameByOracleId.set(card.oracleId, card.name)
      }
    }
  }

  const printingDetails = [...targetOracleIds]
    .sort()
    .map((oracleId) => {
      const mappedPrintings = (oraclePrintings.get(oracleId) ?? [])
        .map(mapPrinting)
        .filter((printing): printing is Printing => printing !== null)
      const oracleName = firstNameByOracleId.get(oracleId)

      if (!oracleName) {
        throw new Error(`Unable to determine a name for Oracle ID ${oracleId}`)
      }

      return validateSchema(
        printingDetailsSchema,
        {
          schemaVersion: 1,
          generatedAt: generatedAtIso,
          oracleId,
          name: oracleName,
          printings: sortPrintings(mappedPrintings),
        },
        `printings/${oracleId}.json`,
      )
    })

  const diagnostics = validateSchema(
    diagnosticsSchema,
    {
      schemaVersion: 1,
      generatedAt: generatedAtIso,
      scryfallUpdatedAt: catalog.scryfallUpdatedAt,
      unmatchedSldCardIds,
      counts: {
        groups: groups.length,
        groupedCardReferences: groupedCardIds.length,
        uniqueSldCards: uniqueSldCardIds.length,
        oracleIds: targetOracleIds.size,
        bulkCardsRead,
        eligiblePrintings: printingDetails.reduce(
          (count, details) => count + details.printings.length,
          0,
        ),
        shopProducts: shopProducts.length,
      },
      timestamps: {
        startedAt: startedAt.toISOString(),
        groupsFetchedAt: groupsFetchedAt.toISOString(),
        sldCardsResolvedAt: sldCardsResolvedAt.toISOString(),
        bulkStartedAt: bulkStartedAt.toISOString(),
        bulkCompletedAt: bulkCompletedAt.toISOString(),
        completedAt: generatedAtIso,
      },
    },
    'diagnostics.json',
  )

  await replaceGeneratedData(
    catalog,
    shopSnapshot,
    diagnostics,
    printingDetails,
  )
}

await generateData()
