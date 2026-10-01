import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { CardDetail } from './components/CardDetail'
import { CatalogList, GroupDetail } from './components/CatalogViews'
import { formatTimestamp } from './components/formatters'
import { SiteFooter, SiteHeader } from './components/SiteChrome'
import {
  applyAnnouncementSaleWindows,
  resolveGroupAnnouncementMetadata,
  type GroupAnnouncementMetadata,
} from './data/announcements'
import {
  loadAnnouncements,
  loadCatalog,
  loadShopData,
} from './data/loaders'
import { resolveGroupAvailability } from './data/shop'
import type { AnnouncementsData } from './types/announcements'
import type { Catalog, GroupAvailability, ShopProduct } from './types/catalog'

type Route =
  | { page: 'catalog' }
  | { page: 'group'; slug: string }
  | { page: 'card'; slug: string; oracleId: string }

type CatalogState =
  | { status: 'loading' }
  | { status: 'loaded'; catalog: Catalog }
  | { status: 'error'; message: string }

type ShopState =
  | { status: 'loading'; products: ShopProduct[] }
  | {
      status: 'loaded'
      products: ShopProduct[]
      source: 'live' | 'cache'
      cachedAt: string | null
    }
  | { status: 'error'; products: ShopProduct[]; message: string }

type AnnouncementsState =
  | { status: 'loading' }
  | { status: 'loaded'; announcements: AnnouncementsData }
  | { status: 'error'; message: string }

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const parseHash = (hash: string): Route => {
  const path = hash.replace(/^#\/?/, '')
  const cardMatch = path.match(/^group\/([^/]+)\/card\/([^/]+)$/)

  if (cardMatch) {
    return {
      page: 'card',
      slug: safeDecode(cardMatch[1]),
      oracleId: safeDecode(cardMatch[2]),
    }
  }

  const groupMatch = path.match(/^group\/([^/]+)$/)
  if (groupMatch) {
    return { page: 'group', slug: safeDecode(groupMatch[1]) }
  }

  return { page: 'catalog' }
}

const useHashRoute = () => {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return route
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function App() {
  const route = useHashRoute()
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: 'loading',
  })
  const [shopState, setShopState] = useState<ShopState>({
    status: 'loading',
    products: [],
  })
  const [announcementsState, setAnnouncementsState] =
    useState<AnnouncementsState>({ status: 'loading' })
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    let active = true

    loadCatalog()
      .then((catalog) => {
        if (active) {
          setCatalogState({ status: 'loaded', catalog })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogState({
            status: 'error',
            message: getErrorMessage(error, 'Catalog could not be loaded.'),
          })
        }
      })

    loadShopData()
      .then((result) => {
        if (active) {
          setShopState({ status: 'loaded', ...result })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setShopState({
            status: 'error',
            products: [],
            message: getErrorMessage(
              error,
              'Live and cached shop availability could not be loaded.',
            ),
          })
        }
      })

    loadAnnouncements()
      .then((announcements) => {
        if (active) {
          setAnnouncementsState({ status: 'loaded', announcements })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setAnnouncementsState({
            status: 'error',
            message: getErrorMessage(
              error,
              'Announcement release dates could not be loaded.',
            ),
          })
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(
      () => setCurrentTime(new Date()),
      1_000,
    )
    return () => window.clearInterval(interval)
  }, [])

  const catalog =
    catalogState.status === 'loaded' ? catalogState.catalog : null
  const selectedGroup = useMemo(() => {
    if (!catalog || route.page === 'catalog') {
      return null
    }

    return catalog.groups.find((group) => group.slug === route.slug) ?? null
  }, [catalog, route])
  const rawAvailabilityBySlug = useMemo<Record<string, GroupAvailability>>(
    () =>
      catalog
        ? resolveGroupAvailability(catalog.groups, shopState.products)
        : {},
    [catalog, shopState.products],
  )
  const announcementMetadataBySlug = useMemo<
    Record<string, GroupAnnouncementMetadata>
  >(
    () =>
      catalog && announcementsState.status === 'loaded'
        ? resolveGroupAnnouncementMetadata(
            catalog.groups,
            announcementsState.announcements,
          )
        : {},
    [announcementsState, catalog],
  )
  const availabilityBySlug = useMemo(
    () =>
      applyAnnouncementSaleWindows(
        rawAvailabilityBySlug,
        announcementMetadataBySlug,
        currentTime,
      ),
    [announcementMetadataBySlug, currentTime, rawAvailabilityBySlug],
  )

  const mainContent = (() => {
    if (catalogState.status === 'loading') {
      return (
        <div className="state-panel page-state" role="status">
          <span className="loader" aria-hidden="true" />
          <h1>Loading the collection</h1>
          <p>Validating catalog and price-floor data.</p>
        </div>
      )
    }

    if (catalogState.status === 'error') {
      return (
        <div className="state-panel state-error page-state" role="alert">
          <p className="eyebrow">Catalog error</p>
          <h1>Collection data unavailable</h1>
          <p>{catalogState.message}</p>
        </div>
      )
    }

    if (route.page !== 'catalog' && !selectedGroup) {
      return (
        <div className="state-panel page-state">
          <p className="eyebrow">Not found</p>
          <h1>That drop is not in the catalog</h1>
          <a className="back-link" href="#/">
            Return to all drops
          </a>
        </div>
      )
    }

    if (route.page === 'card' && selectedGroup) {
      return (
        <CardDetail group={selectedGroup} oracleId={route.oracleId} />
      )
    }

    if (route.page === 'group' && selectedGroup) {
      return (
        <GroupDetail
          group={selectedGroup}
          availability={availabilityBySlug[selectedGroup.slug] ?? {
            nonfoil: 'out-of-stock',
            foil: 'out-of-stock',
          }}
          announcementMetadata={
            announcementMetadataBySlug[selectedGroup.slug]
          }
        />
      )
    }

    return (
      <CatalogList
        groups={catalogState.catalog.groups}
        availabilityBySlug={availabilityBySlug}
        announcementMetadataBySlug={announcementMetadataBySlug}
      />
    )
  })()

  return (
    <div className="app-shell">
      <SiteHeader catalog={catalog} />
      {shopState.status === 'loaded' && shopState.source === 'cache' && (
        <div className="data-notice warning-notice" role="status">
          <strong>Cached shop data</strong>
          <span>
            Live availability could not be reached. Showing the snapshot from{' '}
            {shopState.cachedAt
              ? formatTimestamp(shopState.cachedAt)
              : 'an unknown time'}
            .
          </span>
        </div>
      )}
      {shopState.status === 'error' && (
        <div className="data-notice error-notice" role="alert">
          <strong>Shop availability unavailable</strong>
          <span>{shopState.message}</span>
        </div>
      )}
      {announcementsState.status === 'error' && (
        <div className="data-notice error-notice" role="alert">
          <strong>Announcement dates unavailable</strong>
          <span>{announcementsState.message}</span>
        </div>
      )}
      <main>{mainContent}</main>
      <SiteFooter />
    </div>
  )
}

export default App
