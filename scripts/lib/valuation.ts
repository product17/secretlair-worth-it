import type {
  PriceFloor,
  ValueSummary,
} from '../../src/types/catalog.ts'
import type { ScryfallCard } from './scryfall.ts'

export type UsdFinish = 'nonfoil' | 'foil' | 'etched'
export type FloorFinish = Exclude<UsdFinish, 'etched'>

const excludedLayouts = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
])
const excludedBorders = new Set(['gold', 'silver'])
const priceFields = {
  nonfoil: 'usd',
  foil: 'usd_foil',
  etched: 'usd_etched',
} as const

export const parseUsdPrice = (value: string | null | undefined): number | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }

  const price = Number(value)
  return Number.isFinite(price) && price >= 0 ? price : null
}

export const isEligiblePaperPrinting = (
  card: ScryfallCard,
  finish: UsdFinish,
): boolean => {
  if (!card.games?.includes('paper') || card.oversized) {
    return false
  }

  if (card.layout && excludedLayouts.has(card.layout)) {
    return false
  }

  if (card.border_color && excludedBorders.has(card.border_color)) {
    return false
  }

  if (card.security_stamp === 'acorn') {
    return false
  }

  if (card.promo_types?.includes('playtest')) {
    return false
  }

  if (!card.finishes?.includes(finish)) {
    return false
  }

  return parseUsdPrice(card.prices?.[priceFields[finish]]) !== null
}

export const getEligibleUsdPrice = (
  card: ScryfallCard,
  finish: UsdFinish,
): number | null => {
  if (!isEligiblePaperPrinting(card, finish)) {
    return null
  }

  return parseUsdPrice(card.prices?.[priceFields[finish]])
}

export const getExactPrintingPrice = (
  card: ScryfallCard,
  finish: UsdFinish,
): number | null =>
  card.finishes?.includes(finish)
    ? parseUsdPrice(card.prices?.[priceFields[finish]])
    : null

export const calculateFinishFloor = (
  printings: readonly ScryfallCard[],
  finish: FloorFinish,
): PriceFloor => {
  let floor: PriceFloor = { price: null, printingId: null }

  for (const printing of printings) {
    const price = getEligibleUsdPrice(printing, finish)
    if (price === null) {
      continue
    }

    if (
      floor.price === null ||
      price < floor.price ||
      (price === floor.price &&
        floor.printingId !== null &&
        printing.id.localeCompare(floor.printingId) < 0)
    ) {
      floor = { price, printingId: printing.id }
    }
  }

  return floor
}

export const calculateExactPrintingValue = (
  cards: readonly ScryfallCard[],
  finish: FloorFinish,
): ValueSummary => {
  const prices = cards
    .map((card) => getExactPrintingPrice(card, finish))
    .filter((price): price is number => price !== null)

  return {
    total:
      Math.round(prices.reduce((total, price) => total + price, 0) * 100) /
      100,
    pricedCardCount: prices.length,
    cardCount: cards.length,
  }
}

export const calculateBlendedPrintingValue = (
  cards: readonly ScryfallCard[],
  finish: FloorFinish,
  fallbackPrices: readonly (number | null)[],
): ValueSummary => {
  if (cards.length !== fallbackPrices.length) {
    throw new Error('Cards and fallback prices must have matching lengths')
  }

  const prices = cards
    .map((card, index) => {
      const exactPrice = getExactPrintingPrice(card, finish)

      return exactPrice ?? fallbackPrices[index]
    })
    .filter((price): price is number => price !== null)

  return {
    total:
      Math.round(prices.reduce((total, price) => total + price, 0) * 100) /
      100,
    pricedCardCount: prices.length,
    cardCount: cards.length,
  }
}
