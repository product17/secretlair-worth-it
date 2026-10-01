import { z } from 'zod'
import type {
  Availability,
  GroupAvailability,
  GroupProductAvailability,
  SecretLairGroup,
  ShopFinish,
  ShopProduct,
} from '../types/catalog.ts'

const STORE_SEARCH_URL =
  'https://storesearch.eu.scalefast.com/StoreSearch?userID=10751401&locale=en_US&currency=USD&crit=ALL&sort=availability_wotc,featured&count=50&env=prod&preference=1789490441FQJbit9zQiGbArOTqma9&aggs=cf_kw_product_type!max_price!min_price&aggs_crit=custom_fields&filters=feedID:72135&offset='
const SECRET_LAIR_SHOP_URL = 'https://secretlair.wizards.com/us/shopall'
const PAGE_SIZE = 50
const STORE_DATE_PATTERN =
  /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/
const STORE_TIME_ZONE = 'Europe/Paris'
const storeDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const identifierSchema = z.union([
  z.string().trim().min(1),
  z.number().finite().nonnegative(),
])
const numericValueSchema = z.union([z.number().finite(), z.string()])
const customFieldsSchema = z.union([
  z.array(z.unknown()).length(0),
  z.record(z.string(), z.unknown()),
])
const priceSchema = z.object({
  currency: z.string().optional(),
  licence: z.string().optional(),
  price: z.union([z.number().finite(), z.string(), z.null()]).optional(),
})
const rawProductSchema = z.object({
  productID: identifierSchema,
  state: z.string(),
  descriptions: z.array(
    z.object({
      lang: z.string(),
      title: z.string(),
    }),
  ),
  stock: z.object({
    stock: numericValueSchema,
    ostock: z.string().optional(),
  }),
  waiting_list: z.boolean().optional().default(false),
  prices: z.array(priceSchema).optional(),
  price_info: z
    .object({
      prices: z.array(priceSchema).optional(),
    })
    .optional(),
  custom_fields: customFieldsSchema,
  categories: z
    .array(
      z.object({
        categoryName: z.string(),
      }),
    )
    .optional(),
  specific: z
    .object({
      elements: z
        .array(
          z.object({
            productID: identifierSchema,
          }),
        )
        .optional(),
    })
    .optional(),
})
const rawShopPageSchema = z.object({
  count: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  products: z.array(rawProductSchema),
})
const rawShopResponseSchema = z.union([
  rawShopPageSchema,
  z.object({
    filters: z.array(rawShopPageSchema).min(1),
  }),
])

export const SECRET_LAIR_TITLE_ALIASES: Record<string, string> = {
  "Secret Lair x Marvel's Hulk: SMASH!": 'Marvel: Hulk SMASH!',
  "Secret Lair x Marvel's Deadpool: I Fixed It (You're Welcome) Pool Party":
    "Marvel's Deadpool: I Fixed It (You're Welcome) Pool Party Edition",
  'Secret Lair x Teenage Mutant Ninja Turtles: The Mighty Mutanimals':
    'Teenage Mutant Ninja Turtles: The Might Mutanimals',
  'Secret Lair x Furby: Doo-ay Noo-lah Confetti':
    'Furby: Doo-ay Noo-lah (Confetti Foil)',
  'Secret Lair x Furby: Furbys: The Gathering': 'Furbys: The Gathering',
  'Secret Lair x Furby: Furbys: The Gathering Confetti':
    'Furbys: The Gathering (Confetti Foil)',
  'Secret Lair x Furby: The Oddbodies Confetti':
    'Furby: The OddBodies (Confetti Foil)',
  'Return to Mystical Archive': 'Return to the Mystical Archive',
  'Secret Lair x The Hobbit: He Who Walks Unseen Out of Sight':
    'The Hobbit: He Who Walks Unseen',
}
export const secretLairTitleAliases = SECRET_LAIR_TITLE_ALIASES

const normalizeTitleText = (title: string) =>
  title
    .replace(/[™®©℠]/gu, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/gu, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .replace(/^secret lair(?: x)?(?: |$)/u, '')
    .replace(/^commander deck\s+/u, '')
    .replace(/\s+(?:non foil|foil)(?: edition)?$/u, '')
    .trim()

export const normalizeSecretLairTitle = (title: string): string => {
  let normalizedTitle = normalizeTitleText(title)
  const visitedTitles = new Set<string>()

  while (!visitedTitles.has(normalizedTitle)) {
    visitedTitles.add(normalizedTitle)
    const alias = Object.entries(SECRET_LAIR_TITLE_ALIASES).find(
      ([sourceTitle]) => normalizeTitleText(sourceTitle) === normalizedTitle,
    )

    if (!alias) {
      break
    }

    normalizedTitle = normalizeTitleText(alias[1])
  }

  return normalizedTitle
}

const getCustomFieldValues = (
  customFields: z.infer<typeof customFieldsSchema>,
  fieldName: string,
): string[] | null => {
  if (Array.isArray(customFields)) {
    return null
  }

  const fieldValue = customFields[fieldName]

  if (fieldValue === undefined) {
    return null
  }

  const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue]

  if (!values.every((value): value is string => typeof value === 'string')) {
    throw new Error(`StoreSearch field ${fieldName} has an invalid schema.`)
  }

  return values
}

const parseStoreDate = (value: string): Date | null => {
  const match = STORE_DATE_PATTERN.exec(value)

  if (!match) {
    return null
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const targetUtcMilliseconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
  )
  const initialDate = new Date(targetUtcMilliseconds)
  const initialParts = Object.fromEntries(
    storeDateFormatter
      .formatToParts(initialDate)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, Number(partValue)]),
  )
  const initialOffset =
    Date.UTC(
      initialParts.year,
      initialParts.month - 1,
      initialParts.day,
      initialParts.hour,
      initialParts.minute,
      initialParts.second,
    ) - initialDate.getTime()
  const parsedDate = new Date(targetUtcMilliseconds - initialOffset)
  const parsedParts = Object.fromEntries(
    storeDateFormatter
      .formatToParts(parsedDate)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, Number(partValue)]),
  )

  if (
    parsedParts.year !== year ||
    parsedParts.month !== month ||
    parsedParts.day !== day ||
    parsedParts.hour !== hour ||
    parsedParts.minute !== minute
  ) {
    return null
  }

  return parsedDate
}

const parseNumericValue = (value: number | string, fieldName: string) => {
  if (typeof value === 'number') {
    return value
  }

  if (value.trim() === '') {
    throw new Error(`StoreSearch field ${fieldName} is not numeric.`)
  }

  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`StoreSearch field ${fieldName} is not numeric.`)
  }

  return parsedValue
}

const parseStockValue = (value: number | string) => {
  if (typeof value === 'number') {
    return value
  }

  if (value.trim() === '') {
    return null
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

const resolveFinish = (productTypes: Set<string>): ShopFinish | null => {
  const hasFoil = productTypes.has('FOIL')
  const hasNonfoil = productTypes.has('NON_FOIL')

  if (hasFoil && hasNonfoil) {
    return 'mixed'
  }

  if (hasFoil) {
    return 'foil'
  }

  if (hasNonfoil) {
    return 'nonfoil'
  }

  if (productTypes.has('COMMANDER_DECK')) {
    return 'mixed'
  }

  return null
}

const isWithinSaleWindow = (
  customFields: z.infer<typeof customFieldsSchema>,
  now: Date,
) => {
  const startValues = getCustomFieldValues(
    customFields,
    'cf_kw_event_start_date',
  )
  const endValues = getCustomFieldValues(customFields, 'cf_kw_event_end_date')
  const startValue = startValues?.[0]
  const endValue = endValues?.[0]
  const startDate =
    startValue === undefined ? undefined : parseStoreDate(startValue)
  const endDate = endValue === undefined ? undefined : parseStoreDate(endValue)

  if (startDate === null || endDate === null) {
    return false
  }

  return (
    (startDate === undefined || now >= startDate) &&
    (endDate === undefined || now <= endDate)
  )
}

const parsePrice = (rawProduct: z.infer<typeof rawProductSchema>) => {
  const prices = [
    ...(rawProduct.prices ?? []),
    ...(rawProduct.price_info?.prices ?? []),
  ]
  const usdPrice = prices.find(
    (price) => price.currency === 'USD' || price.licence === 'USD',
  )

  if (!usdPrice || usdPrice.price === undefined || usdPrice.price === null) {
    return null
  }

  const price = parseNumericValue(usdPrice.price, 'USD price')

  if (price < 0) {
    throw new Error('StoreSearch field USD price must not be negative.')
  }

  return price
}

const parseProduct = (
  rawProduct: z.infer<typeof rawProductSchema>,
  now: Date,
): ShopProduct => {
  const description = rawProduct.descriptions.find(
    ({ lang }) => lang.toUpperCase() === 'EN',
  )

  if (!description) {
    throw new Error('StoreSearch product is missing an English title.')
  }

  const productTypes = new Set(
    (
      getCustomFieldValues(
        rawProduct.custom_fields,
        'cf_kw_product_type',
      ) ?? []
    ).map((productType) => productType.trim().toUpperCase()),
  )
  const stock = parseStockValue(rawProduct.stock.stock)
  const componentProductIds = (rawProduct.specific?.elements ?? []).map(
    ({ productID }) => String(productID),
  )
  const stockAllowsPurchase =
    rawProduct.stock.ostock === 'BUY' ||
    (rawProduct.waiting_list === false && stock !== null && stock > 0)
  const purchasable =
    rawProduct.state === 'VALIDATED' &&
    isWithinSaleWindow(rawProduct.custom_fields, now) &&
    stockAllowsPurchase

  return {
    productId: String(rawProduct.productID),
    title: description.title,
    normalizedTitle: normalizeSecretLairTitle(description.title),
    price: parsePrice(rawProduct),
    finish: resolveFinish(productTypes),
    isBundle: productTypes.has('BUNDLE') || componentProductIds.length > 0,
    purchasable,
    componentProductIds,
    category: rawProduct.categories?.[0]?.categoryName ?? null,
  }
}

export const parseShopPage = (
  input: unknown,
  now = new Date(),
): { products: ShopProduct[]; total: number } => {
  if (Number.isNaN(now.getTime())) {
    throw new Error('StoreSearch parser requires a valid current date.')
  }

  const result = rawShopResponseSchema.safeParse(input)

  if (!result.success) {
    throw new Error('StoreSearch response has an invalid schema.', {
      cause: result.error,
    })
  }

  const page = 'filters' in result.data ? result.data.filters[0] : result.data

  return {
    products: page.products.map((product) => parseProduct(product, now)),
    total: page.total,
  }
}

export const fetchShopProducts = async (
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<ShopProduct[]> => {
  const productsById = new Map<string, ShopProduct>()
  const pageSignatures = new Set<string>()
  let expectedTotal: number | null = null
  let fetchedProductCount = 0
  let offset = 0

  while (expectedTotal === null || fetchedProductCount < expectedTotal) {
    const response = await fetchImpl(`${STORE_SEARCH_URL}${offset}`)

    if (!response.ok) {
      throw new Error(
        `StoreSearch request failed (${response.status} ${response.statusText}).`,
      )
    }

    const page = parseShopPage(await response.json(), now)

    if (expectedTotal === null) {
      expectedTotal = page.total
    } else if (page.total !== expectedTotal) {
      throw new Error('StoreSearch total changed during pagination.')
    }

    const pageSignature = page.products
      .map(({ productId }) => productId)
      .join('\u0000')

    if (pageSignatures.has(pageSignature)) {
      throw new Error('StoreSearch returned a duplicate page.')
    }

    pageSignatures.add(pageSignature)
    const productCountBeforePage = productsById.size
    fetchedProductCount += page.products.length

    for (const product of page.products) {
      productsById.set(product.productId, product)
    }

    if (
      fetchedProductCount < expectedTotal &&
      (page.products.length === 0 ||
        productsById.size === productCountBeforePage)
    ) {
      throw new Error('StoreSearch pagination made no progress.')
    }

    offset += PAGE_SIZE
  }

  return [...productsById.values()]
}

export const getSecretLairProductUrl = (productId: string): string =>
  `https://secretlair.wizards.com/us/product/${encodeURIComponent(productId)}/`

const compareProductPrice = (left: ShopProduct, right: ShopProduct): number =>
  (left.price ?? Number.POSITIVE_INFINITY) -
    (right.price ?? Number.POSITIVE_INFINITY) ||
  left.productId.localeCompare(right.productId)

export const resolveGroupAvailability = (
  groups: SecretLairGroup[],
  products: ShopProduct[],
): Record<string, GroupAvailability> => {
  const standaloneProducts = products.filter(({ isBundle }) => !isBundle)
  const purchasableBundles = products.filter(
    ({ isBundle, purchasable }) => isBundle && purchasable,
  )

  return Object.fromEntries(
    groups.map((group, groupIndex) => {
      const normalizedGroupTitle = normalizeSecretLairTitle(group.title)
      const matchingStandaloneProducts = standaloneProducts.filter(
        (product) => {
          const normalizedProductTitle = normalizeSecretLairTitle(
            product.normalizedTitle,
          )
          return (
            normalizedProductTitle === normalizedGroupTitle ||
            normalizedProductTitle.startsWith(`${normalizedGroupTitle} `)
          )
        },
      )
      const isUpcomingGroup =
        groupIndex === 0 && matchingStandaloneProducts.length === 0

      if (isUpcomingGroup) {
        return [
          group.slug,
          {
            nonfoil: 'not-yet-available',
            foil: 'not-yet-available',
            nonfoilPurchaseUrl: SECRET_LAIR_SHOP_URL,
            foilPurchaseUrl: SECRET_LAIR_SHOP_URL,
            products: [],
          },
        ]
      }

      const resolveProductAvailability = (
        product: ShopProduct,
      ): GroupProductAvailability => {
        if (product.purchasable) {
          return {
            productId: product.productId,
            title: product.title,
            finish: product.finish,
            status: 'available',
            purchaseUrl: getSecretLairProductUrl(product.productId),
            price: product.price,
          }
        }

        const bundle = purchasableBundles
          .filter(({ componentProductIds }) =>
            componentProductIds.includes(product.productId),
          )
          .sort(compareProductPrice)[0]

        return {
          productId: product.productId,
          title: product.title,
          finish: product.finish,
          status: bundle ? 'bundle-only' : 'out-of-stock',
          purchaseUrl: getSecretLairProductUrl(
            bundle?.productId ?? product.productId,
          ),
          price: product.price,
        }
      }

      const productAvailability = matchingStandaloneProducts
        .map(resolveProductAvailability)
        .sort(
          (left, right) =>
            Number(right.status === 'available') -
              Number(left.status === 'available') ||
            left.title.localeCompare(right.title),
        )

      const resolveFinishAvailability = (
        finish: Exclude<ShopFinish, 'mixed'>,
      ): { status: Availability; purchaseUrl: string } => {
        const matchingFinishProducts = productAvailability.filter(
          (product) =>
            product.finish === finish || product.finish === 'mixed',
        )
        const purchasableProduct = matchingFinishProducts.find(
          ({ status }) => status === 'available',
        )

        if (purchasableProduct) {
          return {
            status: 'available' as const,
            purchaseUrl: purchasableProduct.purchaseUrl,
          }
        }

        const bundleProduct = matchingFinishProducts.find(
          ({ status }) => status === 'bundle-only',
        )

        return bundleProduct
          ? {
              status: 'bundle-only' as const,
              purchaseUrl: bundleProduct.purchaseUrl,
            }
          : {
              status: 'out-of-stock' as const,
              purchaseUrl: matchingFinishProducts[0]
                ? matchingFinishProducts[0].purchaseUrl
                : SECRET_LAIR_SHOP_URL,
            }
      }

      const nonfoil = resolveFinishAvailability('nonfoil')
      const foil = resolveFinishAvailability('foil')

      return [
        group.slug,
        {
          nonfoil: nonfoil.status,
          foil: foil.status,
          ...(nonfoil.purchaseUrl
            ? { nonfoilPurchaseUrl: nonfoil.purchaseUrl }
            : {}),
          ...(foil.purchaseUrl ? { foilPurchaseUrl: foil.purchaseUrl } : {}),
          products: productAvailability,
        },
      ]
    }),
  )
}
