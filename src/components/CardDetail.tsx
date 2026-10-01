import { useEffect, useState } from 'react'
import { loadPrintingDetails } from '../data/loaders'
import type {
  CardFace,
  ImageUris,
  Printing,
  PrintingDetails,
  SecretLairGroup,
} from '../types/catalog'
import { CardImage } from './CardImage'
import { formatPrice } from './formatters'

interface CardDetailProps {
  group: SecretLairGroup
  oracleId: string
}

type PrintingState =
  | { status: 'loading'; oracleId: string }
  | { status: 'loaded'; oracleId: string; details: PrintingDetails }
  | { status: 'error'; oracleId: string; message: string }

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const Price = ({
  label,
  price,
}: {
  label: string
  price: number | null
}) => (
  <div>
    <dt>{label}</dt>
    <dd>{price === null ? 'No price' : formatPrice(price)}</dd>
  </div>
)

const PrintingImage = ({
  imageUris,
  cardFaces,
  name,
}: {
  imageUris?: ImageUris
  cardFaces?: CardFace[]
  name: string
}) => {
  if (cardFaces?.some((face) => face.imageUris)) {
    return (
      <div className="printing-faces">
        {cardFaces.map((face, index) => (
          <CardImage
            key={`${face.name}-${index}`}
            imageUris={face.imageUris}
            alt={`${name} — ${face.name} face`}
            className="printing-image"
          />
        ))}
      </div>
    )
  }

  return (
    <CardImage
      imageUris={imageUris}
      alt={`${name} card`}
      className="printing-image"
    />
  )
}

const PrintingCard = ({ printing }: { printing: Printing }) => (
  <article className="printing-card">
    <PrintingImage
      imageUris={printing.imageUris}
      cardFaces={printing.cardFaces}
      name={printing.name}
    />
    <div className="printing-body">
      <div>
        <p className="collector-number">
          {printing.setCode.toUpperCase()} #{printing.collectorNumber}
        </p>
        <h2>{printing.setName}</h2>
        <p className="release-date">
          Released {dateFormatter.format(new Date(printing.releasedAt))}
        </p>
      </div>
      <div className="finish-list" aria-label="Available finishes">
        {printing.finishes.map((finish) => (
          <span key={finish}>{finish}</span>
        ))}
      </div>
      <dl className="printing-prices">
        <Price label="Non-foil USD" price={printing.prices.nonfoil} />
        <Price label="Foil USD" price={printing.prices.foil} />
        <Price label="Etched USD" price={printing.prices.etched} />
      </dl>
      <a
        className="external-link"
        href={printing.scryfallUri}
        target="_blank"
        rel="noreferrer"
      >
        View on Scryfall <span aria-hidden="true">↗</span>
      </a>
    </div>
  </article>
)

export const CardDetail = ({ group, oracleId }: CardDetailProps) => {
  const [state, setState] = useState<PrintingState>({
    status: 'loading',
    oracleId,
  })
  const card = group.cards.find((candidate) => candidate.oracleId === oracleId)
  const displayState: PrintingState =
    state.oracleId === oracleId ? state : { status: 'loading', oracleId }

  useEffect(() => {
    let active = true

    loadPrintingDetails(oracleId)
      .then((details) => {
        if (active) {
          setState({ status: 'loaded', oracleId, details })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            oracleId,
            message:
              error instanceof Error
                ? error.message
                : 'Printing details could not be loaded.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [oracleId])

  return (
    <section className="detail-section" aria-labelledby="card-title">
      <a
        className="back-link"
        href={`#/group/${encodeURIComponent(group.slug)}`}
      >
        ← {group.title}
      </a>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">Printing comparison</p>
          <h1 id="card-title">{card?.name ?? 'Card details'}</h1>
        </div>
      </div>

      {displayState.status === 'loading' && (
        <div className="state-panel" role="status">
          <span className="loader" aria-hidden="true" />
          <h2>Loading retained printings</h2>
          <p>Gathering images, finishes, and USD price floors.</p>
        </div>
      )}

      {displayState.status === 'error' && (
        <div className="state-panel state-error" role="alert">
          <h2>Printing details unavailable</h2>
          <p>{displayState.message}</p>
        </div>
      )}

      {displayState.status === 'loaded' &&
        displayState.details.printings.length === 0 && (
        <div className="state-panel">
          <h2>No retained printings</h2>
          <p>No eligible printings are available for this card.</p>
        </div>
        )}

      {displayState.status === 'loaded' &&
        displayState.details.printings.length > 0 && (
        <>
          <p className="detail-intro">
            {displayState.details.printings.length} retained{' '}
            {displayState.details.printings.length === 1
              ? 'printing'
              : 'printings'}
            . Prices may be absent for finishes without current USD listings.
          </p>
          <div className="printing-grid">
            {displayState.details.printings.map((printing) => (
              <PrintingCard key={printing.id} printing={printing} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
