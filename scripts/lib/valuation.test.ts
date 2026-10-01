import { describe, expect, it } from 'vitest'
import type { ScryfallCard } from './scryfall.ts'
import {
  calculateBlendedPrintingValue,
  calculateExactPrintingValue,
  calculateFinishFloor,
  getEligibleUsdPrice,
  isEligiblePaperPrinting,
} from './valuation.ts'

const createCard = (
  overrides: Partial<ScryfallCard> = {},
): ScryfallCard => ({
  id: '11111111-1111-4111-8111-111111111111',
  oracle_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Sample Card',
  set: 'tst',
  set_name: 'Test Set',
  collector_number: '1',
  released_at: '2026-01-01',
  games: ['paper'],
  oversized: false,
  layout: 'normal',
  border_color: 'black',
  security_stamp: 'oval',
  promo_types: [],
  finishes: ['nonfoil', 'foil', 'etched'],
  prices: {
    usd: '2.50',
    usd_foil: '8.00',
    usd_etched: '1.00',
  },
  scryfall_uri: 'https://scryfall.com/card/tst/1/sample-card',
  ...overrides,
})

describe('isEligiblePaperPrinting', () => {
  it.each([
    ['digital-only', { games: ['arena'] }],
    ['oversized', { oversized: true }],
    ['token', { layout: 'token' }],
    ['double-faced token', { layout: 'double_faced_token' }],
    ['emblem', { layout: 'emblem' }],
    ['art series', { layout: 'art_series' }],
    ['gold border', { border_color: 'gold' }],
    ['silver border', { border_color: 'silver' }],
    ['acorn stamp', { security_stamp: 'acorn' }],
    ['playtest promo', { promo_types: ['playtest'] }],
  ])('rejects %s printings', (_, overrides) => {
    expect(
      isEligiblePaperPrinting(
        createCard(overrides as Partial<ScryfallCard>),
        'nonfoil',
      ),
    ).toBe(false)
  })

  it('requires a declared finish with a numeric USD price', () => {
    expect(
      isEligiblePaperPrinting(
        createCard({ finishes: ['foil'], prices: { usd: '2.50' } }),
        'nonfoil',
      ),
    ).toBe(false)
    expect(
      isEligiblePaperPrinting(
        createCard({ prices: { usd: 'not-a-number' } }),
        'nonfoil',
      ),
    ).toBe(false)
  })
})

describe('finish prices and floors', () => {
  it('uses usd_foil for traditional foil and never substitutes etched', () => {
    const card = createCard({
      prices: { usd_foil: '8.00', usd_etched: '1.00' },
    })

    expect(getEligibleUsdPrice(card, 'foil')).toBe(8)
    expect(calculateFinishFloor([card], 'foil')).toEqual({
      price: 8,
      printingId: card.id,
    })
  })

  it('filters ineligible cards and chooses a stable lowest printing', () => {
    const higher = createCard({
      id: '33333333-3333-4333-8333-333333333333',
      prices: { usd: '4.00' },
    })
    const tiedLater = createCard({
      id: '22222222-2222-4222-8222-222222222222',
      prices: { usd: '2.00' },
    })
    const tiedEarlier = createCard({
      id: '11111111-1111-4111-8111-111111111111',
      prices: { usd: '2.00' },
    })
    const ineligible = createCard({
      id: '00000000-0000-4000-8000-000000000000',
      border_color: 'silver',
      prices: { usd: '0.25' },
    })

    expect(
      calculateFinishFloor(
        [higher, tiedLater, tiedEarlier, ineligible],
        'nonfoil',
      ),
    ).toEqual({
      price: 2,
      printingId: tiedEarlier.id,
    })
  })

  it('returns a null floor when no eligible price exists', () => {
    expect(
      calculateFinishFloor(
        [createCard({ prices: { usd_foil: null } })],
        'foil',
      ),
    ).toEqual({ price: null, printingId: null })
  })

  it('sums exact printing prices and reports incomplete market coverage', () => {
    const pricedCard = createCard({
      id: '11111111-1111-4111-8111-111111111111',
      prices: { usd: '3.25', usd_foil: '7.50' },
    })
    const unpricedCard = createCard({
      id: '22222222-2222-4222-8222-222222222222',
      prices: { usd: null, usd_foil: '4.00' },
    })

    expect(
      calculateExactPrintingValue([pricedCard, unpricedCard], 'nonfoil'),
    ).toEqual({
      total: 3.25,
      pricedCardCount: 1,
      cardCount: 2,
    })
    expect(
      calculateExactPrintingValue([pricedCard, unpricedCard], 'foil'),
    ).toEqual({
      total: 11.5,
      pricedCardCount: 2,
      cardCount: 2,
    })
  })

  it('uses the cheapest-printing fallback only for cards without exact prices', () => {
    const exactCard = createCard({
      id: '11111111-1111-4111-8111-111111111111',
      prices: { usd: '12.00' },
    })
    const unpricedCard = createCard({
      id: '22222222-2222-4222-8222-222222222222',
      prices: { usd: null },
    })

    expect(
      calculateBlendedPrintingValue(
        [exactCard, unpricedCard],
        'nonfoil',
        [2, 3.5],
      ),
    ).toEqual({
      total: 15.5,
      pricedCardCount: 2,
      cardCount: 2,
    })
  })

  it('rejects fallback lists that do not align with the cards', () => {
    expect(() =>
      calculateBlendedPrintingValue([createCard()], 'nonfoil', []),
    ).toThrow('matching lengths')
  })
})
