import { describe, expect, it } from 'vitest'
import type { SecretLairGroup, ShopProduct } from '../types/catalog'
import { indexBundlesByGroup, resolveBundles } from './bundles'

const group = {
  slug: 'sample-drop',
  title: 'Sample Drop',
  cards: [
    {
      nonfoilFloor: { price: 1, printingId: null },
      foilFloor: { price: 2, printingId: null },
    },
    {
      nonfoilFloor: { price: 3, printingId: null },
      foilFloor: { price: 4, printingId: null },
    },
    {
      nonfoilFloor: { price: 5, printingId: null },
      foilFloor: { price: 6, printingId: null },
    },
  ],
} as SecretLairGroup

const product = (
  productId: string,
  title: string,
  overrides: Partial<ShopProduct> = {},
): ShopProduct => ({
  productId,
  title,
  normalizedTitle: title.toLowerCase(),
  price: 29.99,
  finish: 'nonfoil',
  isBundle: false,
  purchasable: true,
  componentProductIds: [],
  category: null,
  ...overrides,
})

describe('resolveBundles', () => {
  it('resolves component groups and counts each physical variant', () => {
    const products = [
      product('nonfoil', 'Sample Drop Non-Foil Edition'),
      product('foil', 'Sample Drop Foil Edition', { finish: 'foil' }),
      product('bundle', 'Everything Bundle', {
        price: 69.98,
        finish: 'mixed',
        isBundle: true,
        componentProductIds: ['nonfoil', 'foil'],
      }),
    ]

    const bundles = resolveBundles([group], products)

    expect(bundles).toMatchObject([
      {
        productId: 'bundle',
        cardCount: 6,
        cheapestPrintingTotal: 21,
        cheapestPricedCardCount: 6,
        components: [
          { productId: 'nonfoil', group: { slug: 'sample-drop' } },
          { productId: 'foil', group: { slug: 'sample-drop' } },
        ],
      },
    ])
    expect(indexBundlesByGroup(bundles)).toEqual({
      'sample-drop': bundles,
    })
  })
})
