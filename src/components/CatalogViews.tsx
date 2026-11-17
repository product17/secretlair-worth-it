import { useEffect, useState } from 'react'
import type { GroupAnnouncementMetadata } from '../data/announcements'
import type { SecretLairBundle } from '../data/bundles'
import type {
  Availability,
  GroupAvailability,
  GroupProductAvailability,
  SecretLairGroup,
  ValueSummary,
} from '../types/catalog'
import { CardImage } from './CardImage'
import { formatPrice } from './formatters'

interface CatalogListProps {
  groups: SecretLairGroup[]
  availabilityBySlug: Record<string, GroupAvailability>
  announcementMetadataBySlug: Record<string, GroupAnnouncementMetadata>
  bundles: SecretLairBundle[]
  bundlesByGroupSlug: Record<string, SecretLairBundle[]>
}

interface GroupDetailProps {
  group: SecretLairGroup
  availability: GroupAvailability
  announcementMetadata?: GroupAnnouncementMetadata
  bundles: SecretLairBundle[]
}

const availabilityLabels: Record<Availability, string> = {
  available: 'Available',
  'bundle-only': 'Bundle only',
  'not-yet-available': 'Not yet available',
  'out-of-stock': 'Out of stock',
}

const AvailabilityTag = ({ availability }: { availability: Availability }) => (
  <span className={`availability-tag availability-${availability}`}>
    {availabilityLabels[availability]}
  </span>
)

const BundleLinks = ({
  bundles,
}: {
  bundles: readonly SecretLairBundle[]
}) =>
  bundles.length > 0 ? (
    <div className="group-bundle-links">
      {bundles.map((bundle) => (
        <div className="group-bundle-link" key={bundle.productId}>
          <a
            href={`#/bundle/${encodeURIComponent(bundle.productId)}`}
          >
            Bundle {bundle.cardCount} cards{' '}
            {bundle.price === null
              ? 'Price unavailable'
              : formatPrice(bundle.price)}
          </a>
          {bundle.cheapestPricedCardCount > 0 && (
            <small>
              {bundle.purchasable ? 'Available' : 'Out of stock'} ·
              cheapest {formatPrice(bundle.cheapestPrintingTotal)}
            </small>
          )}
        </div>
      ))}
    </div>
  ) : null

const SaleCountdown = ({ saleEndsAt }: { saleEndsAt: string }) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const remainingMilliseconds = new Date(saleEndsAt).getTime() - now
  if (remainingMilliseconds <= 0) {
    return <span className="sale-countdown">Order window ended</span>
  }

  const totalSeconds = Math.floor(remainingMilliseconds / 1_000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const countdown = [
    days > 0 ? `${days}d` : null,
    `${hours}h`,
    `${minutes}m`,
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className="sale-countdown">
      Order window ends in {countdown}
    </span>
  )
}

const ValueMetric = ({
  label,
  floorSummary,
  blendedSummary,
  availability,
  purchaseUrl,
  saleEndsAt,
}: {
  label: string
  floorSummary: ValueSummary
  blendedSummary: ValueSummary
  availability: Availability
  purchaseUrl?: string
  saleEndsAt?: string
}) => {
  const isViewOnly =
    availability === 'out-of-stock' ||
    availability === 'not-yet-available'
  const content = (
    <>
      <div className="metric-heading">
        <span>{label}</span>
        <AvailabilityTag availability={availability} />
      </div>
      <strong>{formatPrice(blendedSummary.total)}</strong>
      <span className="metric-comparison">
        Cheapest-printing estimate: {formatPrice(floorSummary.total)}
      </span>
      {saleEndsAt && <SaleCountdown saleEndsAt={saleEndsAt} />}
      {purchaseUrl && (
        <span className="metric-shop-link">
          {isViewOnly ? 'View on Secret Lair' : 'Shop Secret Lair'} ↗
        </span>
      )}
    </>
  )

  return purchaseUrl ? (
    <a
      className="value-metric value-metric-link"
      href={purchaseUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${isViewOnly ? 'View' : 'Shop'} the ${label.toLowerCase()} product on Secret Lair`}
    >
      {content}
    </a>
  ) : (
    <div className="value-metric">{content}</div>
  )
}

const getProductMetric = (
  group: SecretLairGroup,
  product: GroupProductAvailability,
) => {
  const variantName = product.title.startsWith(`${group.title}:`)
    ? product.title
        .slice(group.title.length + 1)
        .replace(/\s+(?:Non-Foil|Foil) Edition$/i, '')
        .trim()
    : null
  const variantCard = variantName
    ? group.cards.find(
        (card) =>
          card.name.toLocaleLowerCase('en-US').replace(/s$/u, '') ===
          variantName.toLocaleLowerCase('en-US').replace(/s$/u, ''),
      )
    : undefined

  if (variantCard && product.finish !== 'mixed') {
    const isFoil = product.finish === 'foil'
    const floorPrice = isFoil
      ? variantCard.foilFloor.price
      : variantCard.nonfoilFloor.price
    const marketPrice = isFoil
      ? variantCard.foilMarketPrice
      : variantCard.nonfoilMarketPrice
    const floorSummary = {
      total: floorPrice ?? 0,
      pricedCardCount: floorPrice === null ? 0 : 1,
      cardCount: 1,
    }

    return {
      label: `${variantName} · ${isFoil ? 'Foil' : 'Non-foil'}`,
      floorSummary,
      blendedSummary: {
        total: marketPrice ?? floorPrice ?? 0,
        pricedCardCount:
          marketPrice !== null || floorPrice !== null ? 1 : 0,
        cardCount: 1,
      },
    }
  }

  if (product.finish === 'nonfoil') {
    return {
      label: 'Non-foil',
      floorSummary: group.nonfoilValue,
      blendedSummary: group.nonfoilBlendedValue,
    }
  }

  if (product.finish === 'foil') {
    return {
      label: 'Foil',
      floorSummary: group.foilValue,
      blendedSummary: group.foilBlendedValue,
    }
  }

  const useFoilValue =
    group.foilMarketValue.pricedCardCount >
      group.nonfoilMarketValue.pricedCardCount ||
    (group.foilMarketValue.pricedCardCount ===
      group.nonfoilMarketValue.pricedCardCount &&
      group.foilBlendedValue.total >= group.nonfoilBlendedValue.total)

  return {
    label: /commander deck/i.test(product.title)
      ? 'Commander Deck'
      : 'Product',
    floorSummary: useFoilValue ? group.foilValue : group.nonfoilValue,
    blendedSummary: useFoilValue
      ? group.foilBlendedValue
      : group.nonfoilBlendedValue,
  }
}

const GroupValueGrid = ({
  group,
  availability,
  className = '',
  saleEndsAt,
}: {
  group: SecretLairGroup
  availability: GroupAvailability
  className?: string
  saleEndsAt?: string
}) => {
  if (availability.products && availability.products.length > 0) {
    return (
      <div className={`value-grid product-value-grid ${className}`.trim()}>
        {availability.products.map((product) => {
          const metric = getProductMetric(group, product)

          return (
            <ValueMetric
              key={product.productId}
              label={metric.label}
              floorSummary={metric.floorSummary}
              blendedSummary={metric.blendedSummary}
              availability={product.status}
              purchaseUrl={product.purchaseUrl}
              saleEndsAt={
                availability.products?.length === 1
                  ? saleEndsAt
                  : undefined
              }
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className={`value-grid ${className}`.trim()}>
      <ValueMetric
        label="Non-foil"
        floorSummary={group.nonfoilValue}
        blendedSummary={group.nonfoilBlendedValue}
        availability={availability.nonfoil}
        purchaseUrl={availability.nonfoilPurchaseUrl}
        saleEndsAt={saleEndsAt}
      />
      <ValueMetric
        label="Foil"
        floorSummary={group.foilValue}
        blendedSummary={group.foilBlendedValue}
        availability={availability.foil}
        purchaseUrl={availability.foilPurchaseUrl}
        saleEndsAt={saleEndsAt}
      />
    </div>
  )
}

export const CatalogList = ({
  groups,
  availabilityBySlug,
  announcementMetadataBySlug,
  bundles,
  bundlesByGroupSlug,
}: CatalogListProps) => {
  const [availableOnly, setAvailableOnly] = useState(false)
  const [showSecretLairs, setShowSecretLairs] = useState(true)
  const [showBundles, setShowBundles] = useState(true)
  const filteredGroups = groups.filter((group) => {
    const availability = availabilityBySlug[group.slug] ?? {
      nonfoil: 'out-of-stock',
      foil: 'out-of-stock',
    }
    const nonfoilAvailable =
      availability.nonfoil === 'available' ||
      availability.nonfoil === 'bundle-only'
    const foilAvailable =
      availability.foil === 'available' ||
      availability.foil === 'bundle-only'

    return !availableOnly || nonfoilAvailable || foilAvailable
  })
  const filteredBundles = bundles.filter(
    (bundle) => !availableOnly || bundle.purchasable,
  )
  const displayedCount =
    (showSecretLairs ? filteredGroups.length : 0) +
    (showBundles ? filteredBundles.length : 0)
  const totalCount = groups.length + bundles.length

  return (
    <section className="catalog-section" aria-labelledby="catalog-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Complete drop index</p>
          <h1 id="catalog-heading">Worth It?</h1>
        </div>
        <p>
          Absolute minimum totals across retained printings. Drops appear in
          newest source order.
        </p>
      </div>
      <div className="catalog-filter-bar">
        <div
          className="availability-filters"
          role="group"
          aria-label="Filter drops by available finish"
        >
          <button
            type="button"
            className={availableOnly ? 'filter-active' : undefined}
            aria-pressed={availableOnly}
            onClick={() => setAvailableOnly((isActive) => !isActive)}
          >
            Show Available Only
          </button>
          <button
            type="button"
            className={showSecretLairs ? 'filter-active' : undefined}
            aria-pressed={showSecretLairs}
            onClick={() => setShowSecretLairs((isActive) => !isActive)}
          >
            Drops
          </button>
          <button
            type="button"
            className={showBundles ? 'filter-active' : undefined}
            aria-pressed={showBundles}
            onClick={() => setShowBundles((isActive) => !isActive)}
          >
            Bundles
          </button>
        </div>
        <span className="filter-count">
          {displayedCount} of {totalCount} products
        </span>
      </div>
      <ol className="group-list">
        {showSecretLairs &&
          filteredGroups.map((group) => {
          const availability = availabilityBySlug[group.slug] ?? {
            nonfoil: 'out-of-stock',
            foil: 'out-of-stock',
          }
          const announcementMetadata =
            announcementMetadataBySlug[group.slug]
          return (
            <li key={group.slug}>
              <article className="group-row">
                <div className="group-identity">
                  <h2>
                    <a href={`#/group/${encodeURIComponent(group.slug)}`}>
                      {group.title}
                    </a>
                  </h2>
                  <span className="card-count">
                    {group.cards.length}{' '}
                    {group.cards.length === 1 ? 'card' : 'cards'}
                  </span>
                  <BundleLinks
                    bundles={bundlesByGroupSlug[group.slug] ?? []}
                  />
                </div>
                <GroupValueGrid
                  group={group}
                  availability={availability}
                  saleEndsAt={announcementMetadata?.saleEndsAt}
                />
              </article>
            </li>
          )
          })}
        {showBundles &&
          filteredBundles.map((bundle) => (
            <li key={`bundle-${bundle.productId}`}>
              <article className="group-row bundle-row">
                <div className="group-identity">
                  <p className="eyebrow">Bundle</p>
                  <h2>
                    <a
                      href={`#/bundle/${encodeURIComponent(bundle.productId)}`}
                    >
                      {bundle.title}
                    </a>
                  </h2>
                  <span className="card-count">
                    {bundle.cardCount} cards
                  </span>
                </div>
                <a
                  className="bundle-list-summary"
                  href={`#/bundle/${encodeURIComponent(bundle.productId)}`}
                >
                  <span>
                    {bundle.price === null
                      ? 'Price unavailable'
                      : formatPrice(bundle.price)}
                  </span>
                  <AvailabilityTag
                    availability={
                      bundle.purchasable ? 'available' : 'out-of-stock'
                    }
                  />
                </a>
              </article>
            </li>
          ))}
      </ol>
      {displayedCount === 0 && (
        <div className="filter-empty" role="status">
          No products match these filters.
        </div>
      )}
    </section>
  )
}

const PriceFloor = ({
  label,
  marketPrice,
  price,
}: {
  label: string
  marketPrice: number | null
  price: number | null
}) => (
  <div className="price-floor">
    <span>{label}</span>
    <strong>
      {marketPrice !== null
        ? formatPrice(marketPrice)
        : price === null
          ? 'No price available'
          : formatPrice(price)}
    </strong>
    {marketPrice !== null && price !== null ? (
      <small>Cheapest: {formatPrice(price)}</small>
    ) : (
      marketPrice === null &&
      price !== null && <small>Cheapest estimate</small>
    )}
  </div>
)

export const GroupDetail = ({
  group,
  availability,
  announcementMetadata,
  bundles,
}: GroupDetailProps) => (
  <section className="detail-section" aria-labelledby="group-title">
    <a className="back-link" href="#/">
      ← All drops
    </a>
    <div className="detail-heading">
      <div>
        <p className="eyebrow">Secret Lair drop</p>
        <h1 id="group-title">{group.title}</h1>
      </div>
      <div className="detail-availability" aria-label="Shop availability">
        <span>
          Non-foil <AvailabilityTag availability={availability.nonfoil} />
        </span>
        <span>
          Foil <AvailabilityTag availability={availability.foil} />
        </span>
      </div>
    </div>
    <p className="detail-intro">
      {group.cards.length} cards in source order. Select a card to compare every
      retained printing.
    </p>
    <BundleLinks bundles={bundles} />
    <GroupValueGrid
      group={group}
      availability={availability}
      className="group-value-grid"
      saleEndsAt={announcementMetadata?.saleEndsAt}
    />
    <ol className="card-grid">
      {group.cards.map((card) => (
        <li key={card.id}>
          <article className="card-tile">
            <a
              className="card-image-link"
              href={`#/group/${encodeURIComponent(group.slug)}/card/${encodeURIComponent(card.oracleId)}`}
              aria-label={`View printing details for ${card.name}`}
            >
              <CardImage
                imageUris={card.imageUris}
                cardFaces={card.cardFaces}
                alt={`${card.name} Secret Lair card`}
                className="card-image"
              />
            </a>
            <div className="card-tile-body">
              <p className="collector-number">SLD #{card.collectorNumber}</p>
              <h2>
                <a
                  href={`#/group/${encodeURIComponent(group.slug)}/card/${encodeURIComponent(card.oracleId)}`}
                >
                  {card.name}
                </a>
              </h2>
              <div className="floor-grid">
                <PriceFloor
                  label="Non-foil price"
                  marketPrice={card.nonfoilMarketPrice}
                  price={card.nonfoilFloor.price}
                />
                <PriceFloor
                  label="Foil price"
                  marketPrice={card.foilMarketPrice}
                  price={card.foilFloor.price}
                />
              </div>
            </div>
          </article>
        </li>
      ))}
    </ol>
  </section>
)
