import { z } from 'zod'

export const finishSchema = z.enum(['nonfoil', 'foil', 'etched'])
export type Finish = z.infer<typeof finishSchema>

export const imageUrisSchema = z.object({
  small: z.string().url().optional(),
  normal: z.string().url().optional(),
  large: z.string().url().optional(),
  png: z.string().url().optional(),
  artCrop: z.string().url().optional(),
  borderCrop: z.string().url().optional(),
})
export type ImageUris = z.infer<typeof imageUrisSchema>

export const cardFaceSchema = z.object({
  name: z.string(),
  imageUris: imageUrisSchema.optional(),
})
export type CardFace = z.infer<typeof cardFaceSchema>

export const priceFloorSchema = z.object({
  price: z.number().nonnegative().nullable(),
  printingId: z.string().uuid().nullable(),
})
export type PriceFloor = z.infer<typeof priceFloorSchema>

export const valueSummarySchema = z.object({
  total: z.number().nonnegative(),
  pricedCardCount: z.number().int().nonnegative(),
  cardCount: z.number().int().positive(),
})
export type ValueSummary = z.infer<typeof valueSummarySchema>

export const cardSummarySchema = z.object({
  id: z.string().uuid(),
  oracleId: z.string().uuid(),
  name: z.string(),
  collectorNumber: z.string(),
  imageUris: imageUrisSchema.optional(),
  cardFaces: z.array(cardFaceSchema).optional(),
  scryfallUri: z.string().url(),
  nonfoilMarketPrice: z.number().nonnegative().nullable(),
  foilMarketPrice: z.number().nonnegative().nullable(),
  nonfoilFloor: priceFloorSchema,
  foilFloor: priceFloorSchema,
})
export type CardSummary = z.infer<typeof cardSummarySchema>

export const secretLairGroupSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  cards: z.array(cardSummarySchema).min(1),
  nonfoilValue: valueSummarySchema,
  foilValue: valueSummarySchema,
  nonfoilMarketValue: valueSummarySchema,
  foilMarketValue: valueSummarySchema,
  nonfoilBlendedValue: valueSummarySchema,
  foilBlendedValue: valueSummarySchema,
})
export type SecretLairGroup = z.infer<typeof secretLairGroupSchema>

export const catalogSchema = z.object({
  schemaVersion: z.literal(4),
  generatedAt: z.string().datetime(),
  scryfallUpdatedAt: z.string().datetime(),
  groupCount: z.number().int().positive(),
  cardCount: z.number().int().positive(),
  groups: z.array(secretLairGroupSchema).min(1),
})
export type Catalog = z.infer<typeof catalogSchema>

export const printingSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  setCode: z.string(),
  setName: z.string(),
  collectorNumber: z.string(),
  releasedAt: z.string(),
  finishes: z.array(finishSchema),
  prices: z.object({
    nonfoil: z.number().nonnegative().nullable(),
    foil: z.number().nonnegative().nullable(),
    etched: z.number().nonnegative().nullable(),
  }),
  imageUris: imageUrisSchema.optional(),
  cardFaces: z.array(cardFaceSchema).optional(),
  scryfallUri: z.string().url(),
})
export type Printing = z.infer<typeof printingSchema>

export const printingDetailsSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  oracleId: z.string().uuid(),
  name: z.string(),
  printings: z.array(printingSchema),
})
export type PrintingDetails = z.infer<typeof printingDetailsSchema>

export const shopFinishSchema = z.enum(['nonfoil', 'foil', 'mixed'])
export type ShopFinish = z.infer<typeof shopFinishSchema>

export const shopProductSchema = z.object({
  productId: z.string(),
  title: z.string(),
  normalizedTitle: z.string(),
  price: z.number().nonnegative().nullable(),
  finish: shopFinishSchema.nullable(),
  isBundle: z.boolean(),
  purchasable: z.boolean(),
  componentProductIds: z.array(z.string()),
  category: z.string().nullable(),
})
export type ShopProduct = z.infer<typeof shopProductSchema>

export const shopSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  products: z.array(shopProductSchema),
})
export type ShopSnapshot = z.infer<typeof shopSnapshotSchema>

export const availabilitySchema = z.enum([
  'available',
  'bundle-only',
  'not-yet-available',
  'out-of-stock',
])
export type Availability = z.infer<typeof availabilitySchema>

export interface GroupProductAvailability {
  productId: string
  title: string
  finish: ShopFinish | null
  status: Availability
  purchaseUrl: string
  price: number | null
}

export interface GroupAvailability {
  nonfoil: Availability
  foil: Availability
  nonfoilPurchaseUrl?: string
  foilPurchaseUrl?: string
  products?: GroupProductAvailability[]
}
