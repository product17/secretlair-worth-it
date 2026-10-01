import { load } from 'cheerio'
import type {
  AnnouncementProduct,
  AnnouncementRelease,
} from '../../src/types/announcements.ts'

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}
const DATE_PATTERN =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s+(\d{4}))?\b/gi
const RELEASE_CONTEXT_PATTERN =
  /\b(available|arrives?|coming|comes to|goes live|launch(?:es)?|order window|sale begins?|releases?)\b/i
const SECRET_LAIR_ARTICLE_PATTERN =
  /(secret-lair|superdrop|chaos-vault)/i
const ORDER_END_PATTERN =
  /\band\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2})(?::(\d{2}))?\s+(a\.m\.|p\.m\.)\s+PT\b/i
const PACIFIC_TIME_ZONE = 'America/Los_Angeles'
const pacificDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PACIFIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export interface ParsedAnnouncementArticle {
  title: string
  url: string
  publishedAt: string | null
  releaseDate: string
  products: AnnouncementProduct[]
}

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const normalizeProductName = (value: string): string =>
  normalizeWhitespace(value)
    .replace(/\s+Decklist$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

const toIsoDate = (
  monthName: string,
  dayText: string,
  yearText: string | undefined,
  fallbackYear: number | null,
) => {
  const month = MONTHS[monthName.toLowerCase()]
  const day = Number(dayText)
  const year = yearText ? Number(yearText) : fallbackYear
  if (year === null) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

const findReleaseDate = (
  value: string,
  fallbackYear: number | null,
): string | null => {
  const matches = [...value.matchAll(DATE_PATTERN)]

  for (const match of matches) {
    const matchIndex = match.index ?? 0
    const context = value.slice(Math.max(0, matchIndex - 140), matchIndex + 60)
    if (!RELEASE_CONTEXT_PATTERN.test(context)) {
      continue
    }

    const isoDate = toIsoDate(match[1], match[2], match[3], fallbackYear)
    if (isoDate) {
      return isoDate
    }
  }

  return null
}

const findSaleEndAt = (value: string): string | null => {
  const match = ORDER_END_PATTERN.exec(value)
  if (!match) {
    return null
  }

  const month = MONTHS[match[1].toLowerCase()]
  const day = Number(match[2])
  const year = Number(match[3])
  const minute = Number(match[5] ?? '0')
  const meridiem = match[6].toLowerCase()
  const rawHour = Number(match[4])
  const hour =
    rawHour % 12 + (meridiem.startsWith('p') ? 12 : 0)
  const targetUtcMilliseconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
  )
  const initialDate = new Date(targetUtcMilliseconds)
  const initialParts = Object.fromEntries(
    pacificDateFormatter
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

  return Number.isNaN(parsedDate.getTime())
    ? null
    : parsedDate.toISOString()
}

const findArticleJsonLd = (
  html: string,
): Record<string, unknown> | null => {
  const $ = load(html)

  for (const element of $('script[type="application/ld+json"]').toArray()) {
    const text = $(element).text().trim()
    if (!text) {
      continue
    }

    try {
      const value = JSON.parse(text) as unknown
      const candidates = Array.isArray(value) ? value : [value]
      for (const candidate of candidates) {
        if (
          typeof candidate === 'object' &&
          candidate !== null &&
          '@type' in candidate &&
          candidate['@type'] === 'Article'
        ) {
          return candidate as Record<string, unknown>
        }
      }
    } catch {
      continue
    }
  }

  return null
}

export const parseArchiveArticleLinks = (
  html: string,
  archiveUrl: string,
): { articleUrls: string[]; candidateUrls: string[] } => {
  const $ = load(html)
  const articleUrls = [
    ...new Set(
      $('a[href^="/en/news/announcements/"]')
        .map((_, element) => {
          const href = $(element).attr('href')
          return href ? new URL(href, archiveUrl).toString() : null
        })
        .get()
        .filter((url): url is string => Boolean(url)),
    ),
  ]

  return {
    articleUrls,
    candidateUrls: articleUrls.filter((url) =>
      SECRET_LAIR_ARTICLE_PATTERN.test(url),
    ),
  }
}

export const parseAnnouncementArticle = (
  html: string,
  sourceUrl: string,
): ParsedAnnouncementArticle => {
  const $ = load(html)
  const jsonLd = findArticleJsonLd(html)
  const title =
    (typeof jsonLd?.headline === 'string' && jsonLd.headline) ||
    $('meta[property="og:title"]').attr('content') ||
    normalizeWhitespace($('article h1').first().text())
  const publishedAt =
    typeof jsonLd?.datePublished === 'string' ? jsonLd.datePublished : null
  const publishedYear = publishedAt
    ? new Date(publishedAt).getUTCFullYear()
    : null
  const description =
    $('meta[name="description"]').attr('content') ??
    $('meta[property="og:description"]').attr('content') ??
    ''
  const articleText = normalizeWhitespace($('article').first().text())
  const saleEndsAt = findSaleEndAt(articleText)
  const releaseDate =
    findReleaseDate(description, publishedYear) ??
    findReleaseDate(articleText, publishedYear)

  if (!title) {
    throw new Error('Article title is missing')
  }

  if (!releaseDate) {
    throw new Error('Release date is missing')
  }

  const productNames: string[] = []
  $('article h2').each((_, heading) => {
    const headingTitle = normalizeWhitespace($(heading).text())
    const sectionText = normalizeWhitespace(
      $(heading)
        .nextUntil('h2')
        .map((__, element) => $(element).text())
        .get()
        .join(' '),
    )
    const isProductSection =
      /\bContents\b/i.test(sectionText) && /\bPrice\b/i.test(sectionText)
    const isBundle = /\bBundle\b/i.test(headingTitle)
    const isUtilityHeading =
      /^(?:▲|Meet\b|Even the\b|Magic: The Gathering Footer)/i.test(
        headingTitle,
      )

    if (isProductSection && !isBundle && !isUtilityHeading) {
      productNames.push(normalizeProductName(headingTitle))
    }
  })

  if (productNames.length === 0) {
    const fallbackHeading = $('article h2')
      .map((_, heading) => normalizeWhitespace($(heading).text()))
      .get()
      .find((heading) => /^(?:Secret Lair|Chaos Vault)\b/i.test(heading))

    if (fallbackHeading) {
      productNames.push(normalizeProductName(fallbackHeading))
    }
  }

  const fallbackName = normalizeProductName(title)
  const uniqueProductNames = [
    ...new Set(
      productNames.length > 0
        ? productNames
        : /\bPrice\b/i.test(articleText) && /Secret Lair|Chaos Vault/i.test(title)
          ? [fallbackName]
          : [],
    ),
  ]

  if (uniqueProductNames.length === 0) {
    throw new Error('Secret Lair product names are missing')
  }

  return {
    title: normalizeWhitespace(title),
    url: sourceUrl,
    publishedAt,
    releaseDate,
    products: uniqueProductNames.map((name) => ({
      name,
      sourceUrl,
      ...(saleEndsAt &&
      (uniqueProductNames.length === 1 || /commander deck/i.test(name))
        ? { saleEndsAt }
        : {}),
    })),
  }
}

export const groupAnnouncementReleases = (
  articles: readonly ParsedAnnouncementArticle[],
): AnnouncementRelease[] => {
  const releasesByDate = new Map<
    string,
    {
      products: Map<string, AnnouncementProduct>
      announcementTitles: Set<string>
    }
  >()

  for (const article of articles) {
    const release = releasesByDate.get(article.releaseDate) ?? {
      products: new Map<string, AnnouncementProduct>(),
      announcementTitles: new Set<string>(),
    }

    release.announcementTitles.add(article.title)
    for (const product of article.products) {
      release.products.set(product.name.toLocaleLowerCase('en-US'), product)
    }
    releasesByDate.set(article.releaseDate, release)
  }

  return [...releasesByDate.entries()]
    .sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate))
    .map(([releaseDate, release]) => ({
      releaseDate,
      products: [...release.products.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      announcementTitles: [...release.announcementTitles].sort(),
    }))
}
