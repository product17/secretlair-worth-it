import { useState } from 'react'
import type { CardFace, ImageUris } from '../types/catalog'
import { getImageSource } from './formatters'

interface CardImageProps {
  imageUris?: ImageUris
  cardFaces?: CardFace[]
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
}

export const CardImage = ({
  imageUris,
  cardFaces,
  alt,
  className = '',
  loading = 'lazy',
}: CardImageProps) => {
  const source = getImageSource(imageUris, cardFaces)
  const [failedSource, setFailedSource] = useState<string | undefined>()
  const failed = source === failedSource

  if (!source || failed) {
    return (
      <div className={`image-fallback ${className}`} role="img" aria-label={alt}>
        <span>Image unavailable</span>
      </div>
    )
  }

  return (
    <img
      className={className}
      src={source}
      alt={alt}
      loading={loading}
      onError={() => setFailedSource(source)}
    />
  )
}
