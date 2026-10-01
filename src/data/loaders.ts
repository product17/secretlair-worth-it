import type { ZodType } from 'zod'
import {
  announcementsDataSchema,
  type AnnouncementsData,
} from '../types/announcements'
import {
  catalogSchema,
  printingDetailsSchema,
  shopSnapshotSchema,
  type Catalog,
  type PrintingDetails,
  type ShopProduct,
} from '../types/catalog'
import { fetchShopProducts } from './shop'

export interface ShopLoadResult {
  products: ShopProduct[]
  source: 'live' | 'cache'
  cachedAt: string | null
}

const getDataUrl = (relativePath: string) => {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href)
  return new URL(relativePath.replace(/^\.\//, ''), baseUrl).toString()
}

const fetchValidatedJson = async <Value>(
  relativePath: string,
  schema: ZodType<Value>,
  resourceName: string,
): Promise<Value> => {
  const response = await fetch(getDataUrl(relativePath))

  if (!response.ok) {
    throw new Error(
      `${resourceName} request failed (${response.status} ${response.statusText}).`,
    )
  }

  const result = schema.safeParse(await response.json())

  if (!result.success) {
    throw new Error(`${resourceName} has an invalid schema.`)
  }

  return result.data
}

export const loadCatalog = (): Promise<Catalog> =>
  fetchValidatedJson('./data/catalog.json', catalogSchema, 'Catalog')

export const loadAnnouncements = (): Promise<AnnouncementsData> =>
  fetchValidatedJson(
    './data/announcements.json',
    announcementsDataSchema,
    'Announcements',
  )

export const loadShopData = async (): Promise<ShopLoadResult> => {
  try {
    const products = await fetchShopProducts()
    return { products, source: 'live', cachedAt: null }
  } catch {
    const snapshot = await fetchValidatedJson(
      './data/shop.json',
      shopSnapshotSchema,
      'Cached shop data',
    )

    return {
      products: snapshot.products,
      source: 'cache',
      cachedAt: snapshot.generatedAt,
    }
  }
}

export const loadPrintingDetails = (
  oracleId: string,
): Promise<PrintingDetails> =>
  fetchValidatedJson(
    `./data/printings/${encodeURIComponent(oracleId)}.json`,
    printingDetailsSchema,
    'Printing details',
  )
