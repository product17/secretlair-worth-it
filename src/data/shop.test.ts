import { describe, expect, it, vi } from 'vitest'
import type { SecretLairGroup, ShopProduct } from '../types/catalog'
import {
  fetchShopProducts,
  normalizeSecretLairTitle,
  parseShopPage,
  resolveGroupAvailability,
  SECRET_LAIR_TITLE_ALIASES,
} from './shop'

const NOW = new Date('2026-09-15T10:00:00.000Z')

const createRawProduct = (
  productId: string | number,
  overrides: Record<string, unknown> = {},
) => ({
  productID: productId,
  state: 'VALIDATED',
  descriptions: [{ lang: 'EN', title: `Drop ${productId}` }],
  stock: { stock: 1, ostock: 'DENY_PURCHASE' },
  prices: [{ currency: 'USD', price: '39.99' }],
  custom_fields: {
    cf_kw_product_type: ['NON_FOIL'],
  },
  categories: [{ categoryName: 'Secret Lair' }],
  specific: { elements: [] },
  ...overrides,
})

const createPage = (
  products: ReturnType<typeof createRawProduct>[],
  total = products.length,
) => ({
  count: products.length,
  total,
  products,
})

const createFetchMock = (pages: unknown[]) => {
  let pageIndex = 0

  return vi.fn(async () => {
    const page = pages[pageIndex]
    pageIndex += 1

    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

const createProduct = (
  productId: string,
  title: string,
  finish: ShopProduct['finish'],
  overrides: Partial<ShopProduct> = {},
): ShopProduct => ({
  productId,
  title,
  normalizedTitle: normalizeSecretLairTitle(title),
  price: 39.99,
  finish,
  isBundle: false,
  purchasable: false,
  componentProductIds: [],
  category: 'Secret Lair',
  ...overrides,
})

const createGroup = (slug: string, title: string) =>
  ({ slug, title }) as SecretLairGroup

describe('fetchShopProducts', () => {
  it('paginates with the fixed StoreSearch parameters and 50-item offsets', async () => {
    const fetchMock = createFetchMock([
      createPage([createRawProduct(1), createRawProduct('2')], 3),
      createPage([createRawProduct(3)], 3),
    ])

    const products = await fetchShopProducts(fetchMock, NOW)

    expect(products.map(({ productId }) => productId)).toEqual(['1', '2', '3'])
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://storesearch.eu.scalefast.com/StoreSearch?userID=10751401&locale=en_US&currency=USD&crit=ALL&sort=availability_wotc,featured&count=50&env=prod&preference=1789490441FQJbit9zQiGbArOTqma9&aggs=cf_kw_product_type!max_price!min_price&aggs_crit=custom_fields&filters=feedID:72135&offset=0',
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://storesearch.eu.scalefast.com/StoreSearch?userID=10751401&locale=en_US&currency=USD&crit=ALL&sort=availability_wotc,featured&count=50&env=prod&preference=1789490441FQJbit9zQiGbArOTqma9&aggs=cf_kw_product_type!max_price!min_price&aggs_crit=custom_fields&filters=feedID:72135&offset=50',
    )
  })

  it('rejects a duplicate page instead of looping', async () => {
    const duplicatePage = createPage([createRawProduct(1)], 2)
    const fetchMock = createFetchMock([duplicatePage, duplicatePage])

    await expect(fetchShopProducts(fetchMock, NOW)).rejects.toThrow(
      'duplicate page',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 503,
      statusText: 'Unavailable',
    })) as unknown as typeof fetch

    await expect(fetchShopProducts(fetchMock, NOW)).rejects.toThrow(
      '503 Unavailable',
    )
  })
})

describe('parseShopPage', () => {
  it('parses the filtered envelope returned by the Shop All feed', () => {
    expect(
      parseShopPage({ filters: [createPage([createRawProduct(1)])] }, NOW),
    ).toMatchObject({
      total: 1,
      products: [{ productId: '1' }],
    })
  })

  it('parses identifiers, stock, price, finish, bundle components, and category', () => {
    const page = createPage([
      createRawProduct(101, {
        descriptions: [
          { lang: 'FR', title: 'Titre' },
          { lang: 'EN', title: 'Secret Lair x Example™: Foil Edition' },
        ],
        stock: { stock: '2', ostock: 'DENY_PURCHASE' },
        prices: [{ currency: 'USD', price: '49.99' }],
        custom_fields: {
          cf_kw_product_type: ['FOIL', 'NON_FOIL', 'BUNDLE'],
        },
        categories: [{ categoryName: 'SL Drop' }],
        specific: {
          elements: [{ productID: 201 }, { productID: '202' }],
        },
      }),
    ])

    expect(parseShopPage(page, NOW)).toEqual({
      total: 1,
      products: [
        {
          productId: '101',
          title: 'Secret Lair x Example™: Foil Edition',
          normalizedTitle: 'example',
          price: 49.99,
          finish: 'mixed',
          isBundle: true,
          purchasable: true,
          componentProductIds: ['201', '202'],
          category: 'SL Drop',
        },
      ],
    })
  })

  it.each([
    ['number stock', 1, 'DENY_PURCHASE'],
    ['string stock', '1', 'DENY_PURCHASE'],
    ['BUY policy', '0', 'BUY'],
  ])('allows validated products with %s', (_label, stock, ostock) => {
    const product = parseShopPage(
      createPage([
        createRawProduct(1, {
          stock: { stock, ostock },
        }),
      ]),
      NOW,
    ).products[0]

    expect(product?.purchasable).toBe(true)
  })

  it('does not treat placeholder stock as purchasable for waitlisted products', () => {
    const waitlistedProduct = parseShopPage(
      createPage([
        createRawProduct(1, {
          waiting_list: true,
          stock: { stock: 10, ostock: 'DENY_PURCHASE' },
        }),
      ]),
      NOW,
    ).products[0]
    const explicitlyPurchasableProduct = parseShopPage(
      createPage([
        createRawProduct(2, {
          waiting_list: true,
          stock: { stock: 0, ostock: 'BUY' },
        }),
      ]),
      NOW,
    ).products[0]

    expect(waitlistedProduct?.purchasable).toBe(false)
    expect(explicitlyPurchasableProduct?.purchasable).toBe(true)
  })

  it('enforces inclusive event windows', () => {
    const activeProduct = createRawProduct(1, {
      custom_fields: {
        cf_kw_product_type: ['FOIL'],
        cf_kw_event_start_date: ['2026/09/15 12:00'],
        cf_kw_event_end_date: ['2026/09/15 13:00'],
      },
    })
    const futureProduct = createRawProduct(2, {
      custom_fields: {
        cf_kw_product_type: ['NON_FOIL'],
        cf_kw_event_start_date: ['2026/09/15 12:01'],
      },
    })
    const expiredProduct = createRawProduct(3, {
      custom_fields: {
        cf_kw_product_type: ['NON_FOIL'],
        cf_kw_event_end_date: ['2026/09/15 11:59'],
      },
    })

    expect(
      parseShopPage(
        createPage([activeProduct, futureProduct, expiredProduct]),
        NOW,
      ).products.map(({ purchasable }) => purchasable),
    ).toEqual([true, false, false])
  })

  it('interprets StoreSearch sale windows in the Europe/Paris timezone', () => {
    const product = createRawProduct(1, {
      custom_fields: {
        cf_kw_product_type: ['COMMANDER_DECK'],
        cf_kw_event_start_date: ['2026/09/28 18:00'],
      },
      stock: { stock: 0, ostock: 'BUY' },
    })

    expect(
      parseShopPage(
        createPage([product]),
        new Date('2026-09-28T15:59:00.000Z'),
      ).products[0]?.purchasable,
    ).toBe(false)
    expect(
      parseShopPage(
        createPage([product]),
        new Date('2026-09-28T16:00:00.000Z'),
      ).products[0],
    ).toMatchObject({
      finish: 'mixed',
      purchasable: true,
    })
  })

  it.each(['not-a-date', '2026/02/30 12:00', '2026/09/15 24:00'])(
    'makes a product with invalid date %s non-purchasable',
    (invalidDate) => {
      const product = parseShopPage(
        createPage([
          createRawProduct(1, {
            custom_fields: {
              cf_kw_product_type: ['NON_FOIL'],
              cf_kw_event_start_date: [invalidDate],
            },
          }),
        ]),
        NOW,
      ).products[0]

      expect(product?.purchasable).toBe(false)
    },
  )

  it('rejects invalid response schemas', () => {
    expect(() => parseShopPage({ total: '1', products: [] }, NOW)).toThrow(
      'invalid schema',
    )
  })
})

describe('normalizeSecretLairTitle', () => {
  it('normalizes Unicode, trademarks, whitespace, punctuation, prefixes, and finish suffixes', () => {
    expect(
      normalizeSecretLairTitle(
        '  Secret\u00a0Lair x Café™—Friends: Non-Foil Edition  ',
      ),
    ).toBe('cafe friends')
    expect(normalizeSecretLairTitle('SECRET LAIR: Café & Friends® Foil Edition'))
      .toBe('cafe and friends')
  })

  it('resolves exported title aliases', () => {
    expect(
      normalizeSecretLairTitle(
        "Secret Lair x Marvel's Hulk: SMASH! Foil Edition",
      ),
    ).toBe('marvel hulk smash')

    SECRET_LAIR_TITLE_ALIASES['Store Name'] = 'Scryfall Name'

    try {
      expect(normalizeSecretLairTitle('Store Name')).toBe('scryfall name')
    } finally {
      delete SECRET_LAIR_TITLE_ALIASES['Store Name']
    }
  })

  it('removes a bare finish suffix used by current shop products', () => {
    expect(
      normalizeSecretLairTitle(
        'Secret Lair x Marvel: Spinner Rack Specials Foil',
      ),
    ).toBe('marvel spinner rack specials')
  })

  it('normalizes Commander deck product names to their Scryfall group title', () => {
    expect(
      normalizeSecretLairTitle(
        'Secret Lair Commander Deck: Odds and Ends',
      ),
    ).toBe('odds and ends')
  })
})

describe('resolveGroupAvailability', () => {
  it('prefers purchasable standalone products', () => {
    const groups = [createGroup('drop', 'Secret Lair x Example Drop')]
    const products = [
      createProduct('nonfoil', 'Example Drop Non-Foil Edition', 'nonfoil', {
        purchasable: true,
      }),
      createProduct('foil', 'Example Drop Foil Edition', 'foil'),
    ]

    expect(resolveGroupAvailability(groups, products)).toMatchObject({
      drop: {
        nonfoil: 'available',
        foil: 'out-of-stock',
        nonfoilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/nonfoil/',
        foilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/foil/',
      },
    })
  })

  it('uses structured component IDs for mixed bundle-only availability', () => {
    const groups = [createGroup('drop', 'Example Drop')]
    const products = [
      createProduct('nonfoil', 'Example Drop Non-Foil Edition', 'nonfoil'),
      createProduct('foil', 'Example Drop Foil Edition', 'foil'),
      createProduct('bundle', 'Unrelated Bundle Name', 'mixed', {
        isBundle: true,
        purchasable: true,
        componentProductIds: ['nonfoil', 'foil'],
      }),
    ]

    expect(resolveGroupAvailability(groups, products)).toMatchObject({
      drop: {
        nonfoil: 'bundle-only',
        foil: 'bundle-only',
        nonfoilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/bundle/',
        foilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/bundle/',
      },
    })
  })

  it('recognizes structured bundle components when the bundle tag is absent', () => {
    const product = parseShopPage(
      createPage([
        createRawProduct('bundle', {
          specific: { elements: [{ productID: 'drop' }] },
        }),
      ]),
      NOW,
    ).products[0]

    expect(product?.isBundle).toBe(true)
    expect(product?.componentProductIds).toEqual(['drop'])
  })

  it('does not infer bundle contents from a matching title', () => {
    const groups = [createGroup('drop', 'Example Drop')]
    const products = [
      createProduct('nonfoil', 'Example Drop Non-Foil Edition', 'nonfoil'),
      createProduct('bundle', 'Example Drop Bundle', 'mixed', {
        isBundle: true,
        purchasable: true,
      }),
    ]

    expect(resolveGroupAvailability(groups, products)).toMatchObject({
      drop: {
        nonfoil: 'out-of-stock',
        foil: 'out-of-stock',
        nonfoilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/nonfoil/',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
    })
  })

  it('matches grouped products whose titles extend the Scryfall group name', () => {
    const groups = [createGroup('oddlands', 'The Oddlands')]
    const products = [
      createProduct(
        'plains',
        'The Oddlands: Plains',
        'nonfoil',
        { purchasable: true },
      ),
    ]

    expect(resolveGroupAvailability(groups, products)).toMatchObject({
      oddlands: {
        nonfoil: 'available',
        foil: 'out-of-stock',
        nonfoilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/plains/',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
    })
  })

  it('marks the newest unmatched Scryfall group as not yet available', () => {
    const groups = [createGroup('drop', 'Missing Drop')]

    expect(resolveGroupAvailability(groups, [])).toMatchObject({
      drop: {
        nonfoil: 'not-yet-available',
        foil: 'not-yet-available',
        nonfoilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
    })
  })

  it('treats older unmatched Scryfall groups as out of stock', () => {
    const groups = [
      createGroup('new-drop', 'New Drop'),
      createGroup('old-drop', 'Old Drop'),
    ]

    expect(resolveGroupAvailability(groups, [])).toMatchObject({
      'new-drop': {
        nonfoil: 'not-yet-available',
        foil: 'not-yet-available',
        nonfoilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
      'old-drop': {
        nonfoil: 'out-of-stock',
        foil: 'out-of-stock',
        nonfoilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
    })
  })
})
