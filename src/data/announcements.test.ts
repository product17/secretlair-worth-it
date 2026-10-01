import { describe, expect, it } from 'vitest'
import type { AnnouncementsData } from '../types/announcements'
import type { SecretLairGroup } from '../types/catalog'
import {
  applyAnnouncementSaleWindows,
  resolveGroupAnnouncementMetadata,
  resolveGroupReleaseDates,
} from './announcements'

describe('resolveGroupReleaseDates', () => {
  it('matches Commander announcement names to shorter Scryfall group names', () => {
    const groups = [
      { slug: 'odds-and-ends', title: 'Odds and Ends' },
    ] as SecretLairGroup[]
    const announcements: AnnouncementsData = {
      schemaVersion: 2,
      generatedAt: '2026-09-27T00:00:00.000Z',
      sourceUrl: 'https://magic.wizards.com/en/news/announcements',
      scannedPages: 6,
      releases: [
        {
          releaseDate: '2026-09-28',
          products: [
            {
              name: 'Secret Lair Commander Deck: Odds and Ends',
              sourceUrl:
                'https://magic.wizards.com/en/news/announcements/odds-and-ends',
              saleEndsAt: '2026-09-29T15:59:00.000Z',
            },
          ],
          announcementTitles: [
            'Secret Lair Commander Deck: Odds and Ends Decklist',
          ],
        },
      ],
      diagnostics: {
        archiveArticlesFound: 1,
        candidateArticlesFound: 1,
        parsedArticles: 1,
        skippedArticles: [],
      },
    }

    expect(resolveGroupReleaseDates(groups, announcements)).toEqual({
      'odds-and-ends': '2026-09-28',
    })
    expect(
      resolveGroupAnnouncementMetadata(groups, announcements),
    ).toEqual({
      'odds-and-ends': {
        releaseDate: '2026-09-28',
        saleEndsAt: '2026-09-29T15:59:00.000Z',
      },
    })
  })

  it('overrides stale store availability after the announcement window ends', () => {
    expect(
      applyAnnouncementSaleWindows(
        {
          'odds-and-ends': {
            nonfoil: 'available',
            foil: 'available',
            products: [
              {
                productId: 'deck',
                title: 'Odds and Ends',
                finish: 'mixed',
                status: 'available',
                purchaseUrl: 'https://secretlair.wizards.com/us/product/deck/',
                price: 149.99,
              },
            ],
          },
        },
        {
          'odds-and-ends': {
            releaseDate: '2026-09-28',
            saleEndsAt: '2026-09-29T15:59:00.000Z',
          },
        },
        new Date('2026-09-29T16:00:00.000Z'),
      ),
    ).toMatchObject({
      'odds-and-ends': {
        nonfoil: 'out-of-stock',
        foil: 'out-of-stock',
        products: [{ status: 'out-of-stock' }],
      },
    })
  })
})
