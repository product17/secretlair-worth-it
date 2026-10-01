import { describe, expect, it } from 'vitest'
import {
  groupAnnouncementReleases,
  parseAnnouncementArticle,
  parseArchiveArticleLinks,
} from './announcements.ts'

const articleJsonLd = (headline: string) =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    datePublished: '2026-08-27T09:00-07:00',
  })

describe('announcement archive parsing', () => {
  it('deduplicates article links and selects Secret Lair candidates', () => {
    const html = `
      <a href="/en/news/announcements/secret-lair-new-drop">Drop</a>
      <a href="/en/news/announcements/secret-lair-new-drop">Duplicate</a>
      <a href="/en/news/announcements/rules-update">Rules</a>
      <a href="/en/news/announcements/chaos-vault-example">Vault</a>
    `

    expect(
      parseArchiveArticleLinks(
        html,
        'https://magic.wizards.com/en/news/announcements?page=1',
      ),
    ).toEqual({
      articleUrls: [
        'https://magic.wizards.com/en/news/announcements/secret-lair-new-drop',
        'https://magic.wizards.com/en/news/announcements/rules-update',
        'https://magic.wizards.com/en/news/announcements/chaos-vault-example',
      ],
      candidateUrls: [
        'https://magic.wizards.com/en/news/announcements/secret-lair-new-drop',
        'https://magic.wizards.com/en/news/announcements/chaos-vault-example',
      ],
    })
  })
})

describe('announcement article parsing', () => {
  it('extracts a Superdrop release date and excludes bundle headings', () => {
    const html = `
      <meta name="description" content="Eight drops arrive on August 31, 2026.">
      <script type="application/ld+json">${articleJsonLd('Secret Lair: Test Superdrop')}</script>
      <article>
        <h1>Secret Lair: Test Superdrop</h1>
        <h2>Everything Bundle</h2><p>Contents:</p><p>Price: $100</p>
        <h2>Artist Series: Example</h2><p>Contents:</p><p>1x Card</p><p>Price: $30</p>
        <h2>Secret Lair x Example</h2><p>Contents:</p><p>1x Card</p><p>Price: $30</p>
      </article>
    `

    expect(
      parseAnnouncementArticle(
        html,
        'https://magic.wizards.com/en/news/announcements/test-superdrop',
      ),
    ).toMatchObject({
      title: 'Secret Lair: Test Superdrop',
      publishedAt: '2026-08-27T09:00-07:00',
      releaseDate: '2026-08-31',
      products: [
        { name: 'Artist Series: Example' },
        { name: 'Secret Lair x Example' },
      ],
    })
  })

  it('normalizes a standalone Commander deck heading', () => {
    const html = `
      <meta name="description" content="Available on September 28, 2026.">
      <script type="application/ld+json">${articleJsonLd('Secret Lair Commander Deck: Odds and Ends Decklist')}</script>
      <article>
        <h1>Secret Lair Commander Deck: Odds and Ends Decklist</h1>
        <p>Orders placed between Monday, September 28, 2026, 9 a.m. PT and Tuesday, September 29, 2026, 8:59 a.m. PT will be fulfilled.</p>
        <h2>Secret Lair Commander Deck: Odds and Ends Decklist</h2>
        <p>Contents:</p><p>100 cards</p><p>Price: $149.99</p>
        <h2>Meet the Cards</h2>
      </article>
    `

    expect(
      parseAnnouncementArticle(
        html,
        'https://magic.wizards.com/en/news/announcements/odds-and-ends',
      ),
    ).toMatchObject({
      releaseDate: '2026-09-28',
      products: [
        {
          name: 'Secret Lair Commander Deck: Odds and Ends',
          saleEndsAt: '2026-09-29T15:59:00.000Z',
        },
      ],
    })
  })

  it('infers an omitted release year and accepts a named product heading', () => {
    const html = `
      <meta name="description" content="Secret Lair x Example, available July 20.">
      <script type="application/ld+json">${articleJsonLd('Secret Lair x Example')}</script>
      <article>
        <h1>Secret Lair x Example</h1>
        <h2>Secret Lair x Example</h2>
        <p>Product details without a standard price block.</p>
      </article>
    `

    expect(
      parseAnnouncementArticle(
        html,
        'https://magic.wizards.com/en/news/announcements/example',
      ),
    ).toMatchObject({
      releaseDate: '2026-07-20',
      products: [{ name: 'Secret Lair x Example' }],
    })
  })

  it('rejects articles without a release date', () => {
    expect(() =>
      parseAnnouncementArticle(
        '<article><h1>Secret Lair Update</h1></article>',
        'https://magic.wizards.com/en/news/announcements/update',
      ),
    ).toThrow('Release date is missing')
  })
})

describe('announcement release grouping', () => {
  it('groups products by release date and removes duplicate names', () => {
    const releases = groupAnnouncementReleases([
      {
        title: 'First',
        url: 'https://example.com/first',
        publishedAt: null,
        releaseDate: '2026-09-28',
        products: [
          { name: 'Odds and Ends', sourceUrl: 'https://example.com/first' },
        ],
      },
      {
        title: 'Second',
        url: 'https://example.com/second',
        publishedAt: null,
        releaseDate: '2026-09-28',
        products: [
          { name: 'Odds and Ends', sourceUrl: 'https://example.com/second' },
          { name: 'Other Drop', sourceUrl: 'https://example.com/second' },
        ],
      },
    ])

    expect(releases).toEqual([
      {
        releaseDate: '2026-09-28',
        products: [
          { name: 'Odds and Ends', sourceUrl: 'https://example.com/second' },
          { name: 'Other Drop', sourceUrl: 'https://example.com/second' },
        ],
        announcementTitles: ['First', 'Second'],
      },
    ])
  })
})
