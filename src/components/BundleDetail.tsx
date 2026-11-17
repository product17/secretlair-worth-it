import type { SecretLairBundle } from '../data/bundles'
import type { CardSummary, ShopFinish } from '../types/catalog'
import { CardImage } from './CardImage'
import { formatPrice } from './formatters'

const finishLabel = (finish: ShopFinish | null) => {
  if (finish === 'nonfoil') {
    return 'Non-foil'
  }
  if (finish === 'foil') {
    return 'Foil'
  }
  return 'Mixed finishes'
}

const getCardPrice = (card: CardSummary, finish: ShopFinish | null) => {
  if (finish === 'foil') {
    return card.foilMarketPrice ?? card.foilFloor.price
  }

  return card.nonfoilMarketPrice ?? card.nonfoilFloor.price
}

export const BundleDetail = ({
  bundle,
}: {
  bundle: SecretLairBundle
}) => (
  <section className="detail-section" aria-labelledby="bundle-title">
    <a className="back-link" href="#/">
      ← All products
    </a>
    <div className="detail-heading">
      <div>
        <p className="eyebrow">Secret Lair bundle</p>
        <h1 id="bundle-title">{bundle.title}</h1>
      </div>
      <div className="bundle-purchase-summary">
        <strong>
          {bundle.price === null ? 'Price unavailable' : formatPrice(bundle.price)}
        </strong>
        <span>{bundle.cardCount} cards</span>
        {bundle.cheapestPricedCardCount > 0 && (
          <span>
            Cheapest-printing estimate:{' '}
            {formatPrice(bundle.cheapestPrintingTotal)}
          </span>
        )}
        <span
          className={`availability-tag availability-${bundle.purchasable ? 'available' : 'out-of-stock'}`}
        >
          {bundle.purchasable ? 'Available' : 'Out of stock'}
        </span>
      </div>
    </div>
    <a
      className="external-link bundle-store-link"
      href={bundle.purchaseUrl}
      target="_blank"
      rel="noreferrer"
    >
      {bundle.purchasable ? 'Shop' : 'View'} on Secret Lair ↗
    </a>
    <div className="bundle-components">
      {bundle.components.map((component) => (
        <section
          className="bundle-component"
          key={`${component.productId}-${component.group.slug}`}
        >
          <div className="bundle-component-heading">
            <div>
              <p className="eyebrow">{finishLabel(component.finish)}</p>
              <h2>{component.group.title}</h2>
            </div>
            <a href={`#/group/${encodeURIComponent(component.group.slug)}`}>
              View drop →
            </a>
          </div>
          <div className="bundle-card-grid">
            {component.group.cards.map((card) => {
              const price = getCardPrice(card, component.finish)
              return (
                <article className="bundle-card" key={`${component.productId}-${card.id}`}>
                  <CardImage
                    imageUris={card.imageUris}
                    cardFaces={card.cardFaces}
                    alt={`${card.name} card`}
                    className="bundle-card-image"
                  />
                  <div>
                    <strong>{card.name}</strong>
                    <span>
                      {price === null ? 'No price' : formatPrice(price)}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  </section>
)
