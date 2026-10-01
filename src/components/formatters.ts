import type { CardFace, ImageUris } from '../types/catalog'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeZone: 'UTC',
})

export const formatPrice = (price: number) => currencyFormatter.format(price)

export const formatTimestamp = (timestamp: string) =>
  timestampFormatter.format(new Date(timestamp))

export const formatDate = (date: string) =>
  dateFormatter.format(new Date(`${date}T00:00:00Z`))

export const getImageSource = (
  imageUris?: ImageUris,
  cardFaces?: CardFace[],
) => {
  const availableImages = imageUris ?? cardFaces?.[0]?.imageUris
  return (
    availableImages?.normal ??
    availableImages?.large ??
    availableImages?.png ??
    availableImages?.small
  )
}
