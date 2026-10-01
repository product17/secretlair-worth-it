import type { AnnouncementsData } from '../types/announcements'
import type {
  GroupAvailability,
  SecretLairGroup,
} from '../types/catalog'
import { normalizeSecretLairTitle } from './shop'

const normalizeAnnouncementName = (name: string): string =>
  normalizeSecretLairTitle(name)
    .replace(/^commander deck\s+/u, '')
    .replace(/^presents\s+/u, '')
    .replace(/\s+commander$/u, '')
    .trim()

export interface GroupAnnouncementMetadata {
  releaseDate: string
  saleEndsAt?: string
}

export const resolveGroupAnnouncementMetadata = (
  groups: readonly SecretLairGroup[],
  announcements: AnnouncementsData,
): Record<string, GroupAnnouncementMetadata> => {
  const groupSlugByName = new Map(
    groups.map((group) => [
      normalizeAnnouncementName(group.title),
      group.slug,
    ]),
  )
  const metadataBySlug: Record<string, GroupAnnouncementMetadata> = {}

  for (const release of announcements.releases) {
    for (const product of release.products) {
      const slug = groupSlugByName.get(
        normalizeAnnouncementName(product.name),
      )
      if (slug && metadataBySlug[slug] === undefined) {
        metadataBySlug[slug] = {
          releaseDate: release.releaseDate,
          ...(product.saleEndsAt
            ? { saleEndsAt: product.saleEndsAt }
            : {}),
        }
      }
    }
  }

  return metadataBySlug
}

export const resolveGroupReleaseDates = (
  groups: readonly SecretLairGroup[],
  announcements: AnnouncementsData,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(
      resolveGroupAnnouncementMetadata(groups, announcements),
    ).map(([slug, metadata]) => [slug, metadata.releaseDate]),
  )

export const applyAnnouncementSaleWindows = (
  availabilityBySlug: Record<string, GroupAvailability>,
  metadataBySlug: Record<string, GroupAnnouncementMetadata>,
  now = new Date(),
): Record<string, GroupAvailability> =>
  Object.fromEntries(
    Object.entries(availabilityBySlug).map(([slug, availability]) => {
      const saleEndsAt = metadataBySlug[slug]?.saleEndsAt
      if (!saleEndsAt || now.getTime() < new Date(saleEndsAt).getTime()) {
        return [slug, availability]
      }

      return [
        slug,
        {
          ...availability,
          nonfoil: 'out-of-stock',
          foil: 'out-of-stock',
          products: availability.products?.map((product) => ({
            ...product,
            status: 'out-of-stock',
          })),
        },
      ]
    }),
  )
