import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { announcementsDataSchema } from '../src/types/announcements.ts'
import {
  groupAnnouncementReleases,
  parseAnnouncementArticle,
  parseArchiveArticleLinks,
  type ParsedAnnouncementArticle,
} from './lib/announcements.ts'

const ARCHIVE_URL = 'https://magic.wizards.com/en/news/announcements'
const DEFAULT_PAGE_COUNT = 6
const USER_AGENT =
  'secretlair-worth-it/1.0 (static Secret Lair announcement data generator)'
const REQUEST_DELAY_MS = 150
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))
const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  'public',
  'data',
  'announcements.json',
)

interface Options {
  pages: number
  output: string
}

const parsePositiveInteger = (value: string, optionName: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer`)
  }
  return parsed
}

const parseOptions = (args: string[]): Options => {
  const options: Options = {
    pages: DEFAULT_PAGE_COUNT,
    output: DEFAULT_OUTPUT,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    const value = args[index + 1]

    if (argument === '--pages' && value) {
      options.pages = parsePositiveInteger(value, '--pages')
      index += 1
      continue
    }

    if (argument === '--output' && value) {
      options.output = path.resolve(value)
      index += 1
      continue
    }

    throw new Error(`Unknown or incomplete option: ${argument}`)
  }

  return options
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const fetchHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(
      `Announcement request failed (${response.status} ${response.statusText}): ${url}`,
    )
  }

  return response.text()
}

const generateAnnouncements = async (options: Options): Promise<void> => {
  const archiveArticleUrls = new Set<string>()
  const candidateUrls = new Set<string>()

  for (let page = 1; page <= options.pages; page += 1) {
    const pageUrl = `${ARCHIVE_URL}?page=${page}`
    const parsed = parseArchiveArticleLinks(await fetchHtml(pageUrl), pageUrl)

    for (const url of parsed.articleUrls) {
      archiveArticleUrls.add(url)
    }
    for (const url of parsed.candidateUrls) {
      candidateUrls.add(url)
    }
  }

  if (archiveArticleUrls.size === 0) {
    throw new Error('Announcement archive returned no article links')
  }

  const articles: ParsedAnnouncementArticle[] = []
  const skippedArticles: Array<{ url: string; reason: string }> = []

  for (const url of candidateUrls) {
    if (articles.length + skippedArticles.length > 0) {
      await wait(REQUEST_DELAY_MS)
    }

    try {
      articles.push(parseAnnouncementArticle(await fetchHtml(url), url))
    } catch (error) {
      skippedArticles.push({
        url,
        reason:
          error instanceof Error ? error.message : 'Unknown parsing failure',
      })
    }
  }

  const generated = announcementsDataSchema.parse({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceUrl: ARCHIVE_URL,
    scannedPages: options.pages,
    releases: groupAnnouncementReleases(articles),
    diagnostics: {
      archiveArticlesFound: archiveArticleUrls.size,
      candidateArticlesFound: candidateUrls.size,
      parsedArticles: articles.length,
      skippedArticles,
    },
  })

  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(
    options.output,
    `${JSON.stringify(generated, null, 2)}\n`,
    'utf8',
  )
}

await generateAnnouncements(parseOptions(process.argv.slice(2)))
