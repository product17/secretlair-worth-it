import type { Catalog } from '../types/catalog'
import { formatTimestamp } from './formatters'

interface SiteHeaderProps {
  catalog: Catalog | null
}

export const SiteHeader = ({ catalog }: SiteHeaderProps) => (
  <header className="site-header">
    <a className="brand" href="#/" aria-label="Secret Lair Value Guide home">
      <span className="brand-mark" aria-hidden="true">
        SL
      </span>
      <span>
        <strong>Secret Lair Value Guide</strong>
        <small>Collector price floors</small>
      </span>
    </a>
    <div className="header-copy">
      <p>
        Compare each drop&apos;s card-market floor with its finish availability.
        Estimates are directional—not a promise of resale value.
      </p>
      <p className="source-line">
        {catalog ? (
          <>
            Prices sourced {formatTimestamp(catalog.scryfallUpdatedAt)} · Catalog
            built {formatTimestamp(catalog.generatedAt)}
          </>
        ) : (
          'Loading source timestamps…'
        )}{' '}
        · Refreshed daily
      </p>
    </div>
  </header>
)

export const SiteFooter = () => (
  <footer className="site-footer">
    <p>
      Card data and imagery provided by{' '}
      <a href="https://scryfall.com" target="_blank" rel="noreferrer">
        Scryfall
      </a>
      . This site is not produced by or endorsed by Scryfall.
    </p>
    <p>
      Prices are observed market floors, exclude fees and shipping, and may be
      incomplete or stale. Not financial advice.
    </p>
  </footer>
)
