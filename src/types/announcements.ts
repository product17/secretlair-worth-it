import { z } from 'zod'

export const announcementProductSchema = z.object({
  name: z.string().min(1),
  sourceUrl: z.string().url(),
  saleEndsAt: z.string().datetime().optional(),
})
export type AnnouncementProduct = z.infer<typeof announcementProductSchema>

export const announcementReleaseSchema = z.object({
  releaseDate: z.string().date(),
  products: z.array(announcementProductSchema).min(1),
  announcementTitles: z.array(z.string().min(1)).min(1),
})
export type AnnouncementRelease = z.infer<typeof announcementReleaseSchema>

export const announcementsDataSchema = z.object({
  schemaVersion: z.literal(2),
  generatedAt: z.string().datetime(),
  sourceUrl: z.string().url(),
  scannedPages: z.number().int().positive(),
  releases: z.array(announcementReleaseSchema),
  diagnostics: z.object({
    archiveArticlesFound: z.number().int().nonnegative(),
    candidateArticlesFound: z.number().int().nonnegative(),
    parsedArticles: z.number().int().nonnegative(),
    skippedArticles: z.array(
      z.object({
        url: z.string().url(),
        reason: z.string().min(1),
      }),
    ),
  }),
})
export type AnnouncementsData = z.infer<typeof announcementsDataSchema>
