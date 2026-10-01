import { createGunzip } from 'node:zlib'
import { request } from 'node:https'
import { createInterface } from 'node:readline'
import type { IncomingMessage } from 'node:http'
import { load } from 'cheerio'

const SCRYFALL_SET_URL = 'https://scryfall.com/sets/sld'
const SCRYFALL_BULK_DATA_URL =
  'https://api.scryfall.com/bulk-data/default-cards'
const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const SCRYFALL_USER_AGENT =
  'secretlair-worth-it/1.0 (static Secret Lair valuation data generator)'
const COLLECTION_BATCH_SIZE = 75
const COLLECTION_REQUEST_DELAY_MS = 150
const MAX_REDIRECTS = 5
const MAX_FETCH_ATTEMPTS = 6
const BASE_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 30_000

export interface ParsedSldGroup {
  slug: string
  title: string
  cardCount: number
  cardIds: string[]
}

export interface ScryfallImageUris {
  small?: string
  normal?: string
  large?: string
  png?: string
  art_crop?: string
  border_crop?: string
}

export interface ScryfallCardFace {
  name: string
  oracle_id?: string
  image_uris?: ScryfallImageUris | null
}

export interface ScryfallPrices {
  usd?: string | null
  usd_foil?: string | null
  usd_etched?: string | null
}

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  set: string
  set_name: string
  collector_number: string
  released_at: string
  games?: string[]
  oversized?: boolean
  layout?: string
  border_color?: string
  security_stamp?: string | null
  promo_types?: string[]
  finishes?: string[]
  prices?: ScryfallPrices
  image_uris?: ScryfallImageUris | null
  card_faces?: ScryfallCardFace[]
  scryfall_uri: string
}

export interface BulkDataMetadata {
  updatedAt: string
  jsonlDownloadUri: string
}

export interface ResolvedSldCards {
  cardsById: Map<string, ScryfallCard>
  unmatchedCardIds: string[]
}

const requestHeaders = {
  Accept: 'application/json',
  'User-Agent': SCRYFALL_USER_AGENT,
}

export const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const getScryfallOracleId = (card: ScryfallCard): string | null => {
  if (card.oracle_id) {
    return card.oracle_id
  }

  const faceOracleIds = new Set(
    card.card_faces
      ?.map((face) => face.oracle_id)
      .filter((oracleId): oracleId is string => Boolean(oracleId)) ?? [],
  )

  return faceOracleIds.size === 1 ? [...faceOracleIds][0] : null
}

export const getScryfallDisplayName = (card: ScryfallCard): string => {
  const faceNames = new Set(card.card_faces?.map((face) => face.name) ?? [])
  return faceNames.size === 1 ? [...faceNames][0] : card.name
}

export const createStableSlug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const parseCardCount = (value: string): number => {
  const match = normalizeWhitespace(value).match(/(\d[\d,]*)\s+cards?\b/i)

  if (!match) {
    throw new Error(`Unable to parse Scryfall card count from "${value}"`)
  }

  return Number.parseInt(match[1].replaceAll(',', ''), 10)
}

export const parseSldGroups = (html: string): ParsedSldGroup[] => {
  const $ = load(html)
  const groups: ParsedSldGroup[] = []

  $('h2.card-grid-header').each((_, headerElement) => {
    const header = $(headerElement)
    const content = header.find('.card-grid-header-content').first().clone()
    content.find('.card-grid-header-dot, a').remove()

    const title = normalizeWhitespace(content.text())
    const slug = createStableSlug(header.attr('id') ?? title)
    const cardCount = parseCardCount(header.text())
    const cardGrid = header.next()

    if (!title) {
      throw new Error('Encountered an SLD group with an empty title')
    }

    if (!slug) {
      throw new Error(`Unable to create a slug for SLD group "${title}"`)
    }

    if (!cardGrid.hasClass('card-grid')) {
      throw new Error(
        `SLD group "${title}" is not immediately followed by a .card-grid`,
      )
    }

    const cardIds = cardGrid
      .find('[data-card-id]')
      .map((__, cardElement) => $(cardElement).attr('data-card-id'))
      .get()
      .filter((cardId): cardId is string => Boolean(cardId))

    if (cardIds.length === 0) {
      throw new Error(`SLD group "${title}" has no cards`)
    }

    if (cardIds.length !== cardCount) {
      throw new Error(
        `SLD group "${title}" reports ${cardCount} cards but contains ${cardIds.length}`,
      )
    }

    groups.push({ slug, title, cardCount, cardIds })
  })

  if (groups.length === 0) {
    throw new Error('Scryfall returned no SLD groups')
  }

  const seenSlugs = new Set<string>()
  for (const group of groups) {
    if (seenSlugs.has(group.slug)) {
      throw new Error(`Duplicate SLD group slug "${group.slug}"`)
    }
    seenSlugs.add(group.slug)
  }

  return groups
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const getRetryDelay = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get('retry-after')

  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter)
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS)
    }

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_DELAY_MS)
    }
  }

  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS)
}

const fetchJson = async (
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> => {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetchImpl(url, init)

    if (response.ok) {
      return response.json()
    }

    const canRetry =
      attempt < MAX_FETCH_ATTEMPTS - 1 &&
      (response.status === 429 || response.status >= 500)

    if (!canRetry) {
      throw new Error(
        `Scryfall request failed (${response.status} ${response.statusText}): ${url}`,
      )
    }

    await response.body?.cancel()
    await wait(getRetryDelay(response, attempt))
  }

  throw new Error(`Scryfall request exhausted retries: ${url}`)
}

export const fetchSldGroups = async (
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedSldGroup[]> => {
  const response = await fetchImpl(SCRYFALL_SET_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': SCRYFALL_USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(
      `Unable to fetch Scryfall SLD set page (${response.status} ${response.statusText})`,
    )
  }

  return parseSldGroups(await response.text())
}

export const fetchDefaultCardsMetadata = async (
  fetchImpl: typeof fetch = fetch,
): Promise<BulkDataMetadata> => {
  const payload = await fetchJson(
    SCRYFALL_BULK_DATA_URL,
    { headers: requestHeaders },
    fetchImpl,
  )

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('updated_at' in payload) ||
    typeof payload.updated_at !== 'string' ||
    !('jsonl_download_uri' in payload) ||
    typeof payload.jsonl_download_uri !== 'string'
  ) {
    throw new Error('Scryfall default-cards metadata is missing required fields')
  }

  return {
    updatedAt: payload.updated_at,
    jsonlDownloadUri: payload.jsonl_download_uri,
  }
}

export const resolveSldCards = async (
  cardIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedSldCards> => {
  const uniqueCardIds = [...new Set(cardIds)]
  const cardsById = new Map<string, ScryfallCard>()
  const unmatchedCardIds = new Set(uniqueCardIds)

  for (
    let batchStart = 0;
    batchStart < uniqueCardIds.length;
    batchStart += COLLECTION_BATCH_SIZE
  ) {
    if (batchStart > 0) {
      await wait(COLLECTION_REQUEST_DELAY_MS)
    }

    const batch = uniqueCardIds.slice(
      batchStart,
      batchStart + COLLECTION_BATCH_SIZE,
    )
    const payload = await fetchJson(
      SCRYFALL_COLLECTION_URL,
      {
        method: 'POST',
        headers: {
          ...requestHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifiers: batch.map((id) => ({ id })),
        }),
      },
      fetchImpl,
    )

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('data' in payload) ||
      !Array.isArray(payload.data)
    ) {
      throw new Error('Scryfall collection response is missing card data')
    }

    for (const card of payload.data as ScryfallCard[]) {
      if (typeof card.id !== 'string') {
        continue
      }
      cardsById.set(card.id, card)
      unmatchedCardIds.delete(card.id)
    }
  }

  return {
    cardsById,
    unmatchedCardIds: [...unmatchedCardIds].sort(),
  }
}

const openGzipResponse = async (
  url: URL,
  redirectsRemaining = MAX_REDIRECTS,
): Promise<IncomingMessage> =>
  new Promise((resolve, reject) => {
    const outgoingRequest = request(
      url,
      {
        headers: {
          Accept: 'application/gzip',
          'User-Agent': SCRYFALL_USER_AGENT,
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers.location

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          location &&
          redirectsRemaining > 0
        ) {
          response.resume()
          openGzipResponse(
            new URL(location, url),
            redirectsRemaining - 1,
          ).then(resolve, reject)
          return
        }

        if (statusCode !== 200) {
          response.resume()
          reject(
            new Error(
              `Scryfall bulk download failed with HTTP status ${statusCode}`,
            ),
          )
          return
        }

        resolve(response)
      },
    )

    outgoingRequest.on('error', reject)
    outgoingRequest.end()
  })

export const parseScryfallJsonlLine = (
  line: string,
): ScryfallCard | null => {
  const trimmedLine = line.trim()
  if (!trimmedLine) {
    return null
  }

  const parsed: unknown = JSON.parse(trimmedLine)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('id' in parsed) ||
    typeof parsed.id !== 'string'
  ) {
    throw new Error('Scryfall JSONL contained an invalid card object')
  }

  return parsed as ScryfallCard
}

export const streamDefaultCards = async (
  jsonlDownloadUri: string,
  handleCard: (card: ScryfallCard) => void | Promise<void>,
): Promise<number> => {
  const response = await openGzipResponse(new URL(jsonlDownloadUri))
  const gunzip = createGunzip()
  response.on('error', (error) => gunzip.destroy(error))
  response.on('aborted', () =>
    gunzip.destroy(new Error('Scryfall bulk download was interrupted')),
  )
  const lines = createInterface({
    input: response.pipe(gunzip),
    crlfDelay: Infinity,
  })
  let cardCount = 0

  for await (const line of lines) {
    const card = parseScryfallJsonlLine(line)
    if (!card) {
      continue
    }

    await handleCard(card)
    cardCount += 1
  }

  return cardCount
}
