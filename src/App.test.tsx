import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AnnouncementsData } from './types/announcements'
import type {
  Catalog,
  GroupAvailability,
  ShopProduct,
  ShopSnapshot,
} from './types/catalog'

const shopMocks = vi.hoisted(() => ({
  fetchShopProducts: vi.fn(),
  resolveGroupAvailability: vi.fn<
    (
      groups: Catalog['groups'],
      products: ShopProduct[],
    ) => Record<string, GroupAvailability>
  >(
    (groups: Catalog['groups'], products: ShopProduct[]) => {
      const hasBundle = products.some((product) => product.isBundle)

      return Object.fromEntries(
        groups.map((group) => {
          const isOlderDrop = group.slug === 'older-drop'

          return [
            group.slug,
            {
              nonfoil:
                hasBundle && !isOlderDrop ? 'bundle-only' : 'out-of-stock',
              foil: 'out-of-stock',
              nonfoilPurchaseUrl: isOlderDrop
                ? 'https://secretlair.wizards.com/us/shopall'
                : 'https://secretlair.wizards.com/us/product/bundle-1/',
              foilPurchaseUrl:
                'https://secretlair.wizards.com/us/product/stale-product/',
            },
          ]
        }),
      )
    },
  ),
}))

vi.mock('./data/shop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./data/shop')>()),
  ...shopMocks,
}))

const firstOracleId = '11111111-1111-4111-8111-111111111111'
const secondOracleId = '22222222-2222-4222-8222-222222222222'

const catalog: Catalog = {
  schemaVersion: 4,
  generatedAt: '2026-09-15T16:00:00.000Z',
  scryfallUpdatedAt: '2026-09-15T15:00:00.000Z',
  groupCount: 2,
  cardCount: 3,
  groups: [
    {
      slug: 'new-drop',
      title: 'New Drop',
      nonfoilValue: { total: 12.5, pricedCardCount: 1, cardCount: 2 },
      foilValue: { total: 25, pricedCardCount: 2, cardCount: 2 },
      nonfoilMarketValue: { total: 30, pricedCardCount: 1, cardCount: 2 },
      foilMarketValue: { total: 41, pricedCardCount: 2, cardCount: 2 },
      nonfoilBlendedValue: { total: 42.5, pricedCardCount: 2, cardCount: 2 },
      foilBlendedValue: { total: 41, pricedCardCount: 2, cardCount: 2 },
      cards: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          oracleId: firstOracleId,
          name: 'First Card',
          collectorNumber: '101',
          scryfallUri: 'https://scryfall.com/card/sld/101',
          nonfoilMarketPrice: 30,
          foilMarketPrice: null,
          nonfoilFloor: {
            price: 12.5,
            printingId: '44444444-4444-4444-8444-444444444444',
          },
          foilFloor: {
            price: 8,
            printingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
          },
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          oracleId: secondOracleId,
          name: 'Second Card',
          collectorNumber: '102',
          scryfallUri: 'https://scryfall.com/card/sld/102',
          nonfoilMarketPrice: null,
          foilMarketPrice: 41,
          nonfoilFloor: {
            price: 12.5,
            printingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
          foilFloor: {
            price: 25,
            printingId: '66666666-6666-4666-8666-666666666666',
          },
        },
      ],
    },
    {
      slug: 'older-drop',
      title: 'Older Drop',
      nonfoilValue: { total: 4, pricedCardCount: 1, cardCount: 1 },
      foilValue: { total: 6, pricedCardCount: 1, cardCount: 1 },
      nonfoilMarketValue: { total: 9, pricedCardCount: 1, cardCount: 1 },
      foilMarketValue: { total: 0, pricedCardCount: 0, cardCount: 1 },
      nonfoilBlendedValue: { total: 9, pricedCardCount: 1, cardCount: 1 },
      foilBlendedValue: { total: 6, pricedCardCount: 1, cardCount: 1 },
      cards: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          oracleId: '88888888-8888-4888-8888-888888888888',
          name: 'Older Card',
          collectorNumber: '12',
          scryfallUri: 'https://scryfall.com/card/sld/12',
          nonfoilMarketPrice: 9,
          foilMarketPrice: null,
          nonfoilFloor: {
            price: 4,
            printingId: '99999999-9999-4999-8999-999999999999',
          },
          foilFloor: {
            price: 6,
            printingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        },
      ],
    },
  ],
}

const bundleProduct: ShopProduct = {
  productId: 'bundle-1',
  title: 'New Drop Bundle',
  normalizedTitle: 'new drop',
  price: 39.99,
  finish: 'mixed',
  isBundle: true,
  purchasable: true,
  componentProductIds: [],
  category: 'bundles',
}

const cachedSnapshot: ShopSnapshot = {
  schemaVersion: 1,
  generatedAt: '2026-09-14T12:00:00.000Z',
  products: [bundleProduct],
}

const announcements: AnnouncementsData = {
  schemaVersion: 2,
  generatedAt: '2026-09-26T12:00:00.000Z',
  sourceUrl: 'https://magic.wizards.com/en/news/announcements',
  scannedPages: 6,
  releases: [
    {
      releaseDate: '2026-09-28',
      products: [
        {
          name: 'Secret Lair Commander Deck: New Drop',
          sourceUrl:
            'https://magic.wizards.com/en/news/announcements/new-drop',
          saleEndsAt: '2099-09-29T15:59:00.000Z',
        },
      ],
      announcementTitles: ['New Drop Decklist'],
    },
  ],
  diagnostics: {
    archiveArticlesFound: 1,
    candidateArticlesFound: 1,
    parsedArticles: 1,
    skippedArticles: [],
  },
}

const jsonResponse = (value: unknown) =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => value,
  }) as Response

beforeEach(() => {
  window.location.hash = '#/'
  shopMocks.fetchShopProducts.mockReset()
  shopMocks.resolveGroupAvailability.mockClear()
  shopMocks.fetchShopProducts.mockResolvedValue([bundleProduct])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) =>
      jsonResponse(
        String(input).endsWith('/data/announcements.json')
          ? announcements
          : catalog,
      ),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders every group in source order with pricing coverage', async () => {
    render(<App />)

    const list = await screen.findByRole('list')
    const groupLinks = within(list)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#/group/'))

    expect(groupLinks.map((link) => link.textContent)).toEqual([
      'New Drop',
      'Older Drop',
    ])
    const firstGroupHeading = screen.getByRole('heading', {
      level: 2,
      name: 'New Drop',
    })
    expect(firstGroupHeading.nextElementSibling).toHaveTextContent('2 cards')
    expect(screen.getByText('$42.50')).toBeInTheDocument()
    expect(
      screen.getByText('Cheapest-printing estimate: $12.50'),
    ).toBeInTheDocument()
    expect(screen.getByText('$41.00')).toBeInTheDocument()
    expect(
      screen.getByText('Cheapest-printing estimate: $25.00'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Cheapest-printing estimate: $4.00'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Cheapest-printing estimate: $6.00'),
    ).toBeInTheDocument()
  })

  it('shows bundle-only availability from resolved shop products', async () => {
    render(<App />)

    expect(await screen.findAllByText('Bundle only')).toHaveLength(1)
    const purchaseLinks = screen.getAllByRole('link', {
      name: 'Shop the non-foil product on Secret Lair',
    })
    expect(purchaseLinks).toHaveLength(1)
    expect(purchaseLinks[0]).toHaveAttribute(
      'href',
      'https://secretlair.wizards.com/us/product/bundle-1/',
    )
    expect(
      screen.getAllByRole('link', {
        name: 'View the foil product on Secret Lair',
      }),
    ).toHaveLength(2)
    expect(shopMocks.resolveGroupAvailability).toHaveBeenCalledWith(
      catalog.groups,
      [bundleProduct],
    )
  })

  it('filters to drops with at least one available finish', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { name: 'New Drop' })
    await user.click(
      screen.getByRole('button', { name: 'Show Available Only' }),
    )

    expect(
      screen.getByRole('heading', { name: 'New Drop' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Older Drop' }),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Show Available Only' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the announcement date for a not-yet-available group', async () => {
    shopMocks.resolveGroupAvailability.mockReturnValueOnce({
      'new-drop': {
        nonfoil: 'not-yet-available',
        foil: 'not-yet-available',
        nonfoilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
      'older-drop': {
        nonfoil: 'out-of-stock',
        foil: 'out-of-stock',
        nonfoilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
        foilPurchaseUrl: 'https://secretlair.wizards.com/us/shopall',
      },
    })

    render(<App />)

    expect(
      await screen.findByText('Available September 28, 2026'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Order window ends in/),
    ).toBeInTheDocument()
  })

  it('shows one product box for a single mixed-finish product', async () => {
    shopMocks.resolveGroupAvailability.mockReturnValueOnce({
      'new-drop': {
        nonfoil: 'available',
        foil: 'available',
        nonfoilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/commander/',
        foilPurchaseUrl:
          'https://secretlair.wizards.com/us/product/commander/',
        products: [
          {
            productId: 'commander',
            title: 'Secret Lair Commander Deck: New Drop',
            finish: 'mixed',
            status: 'available',
            purchaseUrl:
              'https://secretlair.wizards.com/us/product/commander/',
            price: 149.99,
          },
        ],
      },
      'older-drop': {
        nonfoil: 'out-of-stock',
        foil: 'out-of-stock',
        products: [],
      },
    })

    render(<App />)

    const groupRow = (await screen.findByRole('heading', {
      name: 'New Drop',
    })).closest('article')

    expect(groupRow).not.toBeNull()
    expect(within(groupRow!).getByText('Commander Deck')).toBeInTheDocument()
    expect(
      within(groupRow!).getByText(/Order window ends in/),
    ).toBeInTheDocument()
    expect(within(groupRow!).queryByText('Non-foil')).not.toBeInTheDocument()
    expect(within(groupRow!).queryByText('Foil')).not.toBeInTheDocument()
  })

  it('navigates by hash to a group and labels missing prices', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'New Drop' }))

    await waitFor(() => {
      expect(window.location.hash).toBe('#/group/new-drop')
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'New Drop' }),
    ).toBeInTheDocument()
    expect(screen.getByText('$42.50')).toBeInTheDocument()
    expect(
      screen.getByText('Cheapest-printing estimate: $12.50'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('$41.00')).toHaveLength(2)
    expect(
      screen.getByText('Cheapest-printing estimate: $25.00'),
    ).toBeInTheDocument()
    const firstCard = screen
      .getByRole('heading', { name: 'First Card' })
      .closest('article')
    const secondCard = screen
      .getByRole('heading', { name: 'Second Card' })
      .closest('article')

    expect(firstCard).not.toBeNull()
    expect(secondCard).not.toBeNull()
    expect(within(firstCard!).getByText('$30.00')).toBeInTheDocument()
    expect(within(firstCard!).getByText('Cheapest: $12.50')).toBeInTheDocument()
    expect(within(firstCard!).getByText('$8.00')).toBeInTheDocument()
    expect(within(firstCard!).getByText('Cheapest estimate')).toBeInTheDocument()
    expect(within(secondCard!).getByText('$41.00')).toBeInTheDocument()
    expect(within(secondCard!).getByText('Cheapest: $25.00')).toBeInTheDocument()
    expect(within(secondCard!).getByText('$12.50')).toBeInTheDocument()
    expect(within(secondCard!).getByText('Cheapest estimate')).toBeInTheDocument()
  })

  it('warns when live shop loading falls back to a cached snapshot', async () => {
    shopMocks.fetchShopProducts.mockRejectedValue(new Error('offline'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/data/shop.json')) {
          return jsonResponse(cachedSnapshot)
        }
        return jsonResponse(
          url.endsWith('/data/announcements.json')
            ? announcements
            : catalog,
        )
      }),
    )

    render(<App />)

    const warningLabel = await screen.findByText('Cached shop data')
    const warning = warningLabel.closest('[role="status"]')

    expect(warning).not.toBeNull()
    expect(warning).toHaveTextContent('Showing the snapshot from')
  })
})
