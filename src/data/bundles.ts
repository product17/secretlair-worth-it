import type {
  SecretLairGroup,
  ShopFinish,
  ShopProduct,
} from '../types/catalog'
import {
  getSecretLairProductUrl,
  normalizeSecretLairTitle,
} from './shop'

export interface BundleComponent {
  productId: string
  productTitle: string
  finish: ShopFinish | null
  group: SecretLairGroup
}

export interface SecretLairBundle {
  productId: string
  title: string
  price: number | null
  purchasable: boolean
  purchaseUrl: string
  cardCount: number
  cheapestPrintingTotal: number
  cheapestPricedCardCount: number
  components: BundleComponent[]
}

const findGroupForProduct = (
  groups: readonly SecretLairGroup[],
  product: ShopProduct,
) => {
  const normalizedProductTitle = normalizeSecretLairTitle(
    product.normalizedTitle,
  )

  return groups.find((group) => {
    const normalizedGroupTitle = normalizeSecretLairTitle(group.title)
    return (
      normalizedProductTitle === normalizedGroupTitle ||
      normalizedProductTitle.startsWith(`${normalizedGroupTitle} `)
    )
  })
}

const getCheapestPrintingPrice = (
  component: BundleComponent,
  cardIndex: number,
) => {
  const card = component.group.cards[cardIndex]
  if (component.finish === 'foil') {
    return card.foilFloor.price
  }
  if (component.finish === 'nonfoil') {
    return card.nonfoilFloor.price
  }

  const prices = [
    card.nonfoilFloor.price,
    card.foilFloor.price,
  ].filter((price): price is number => price !== null)
  return prices.length > 0 ? Math.min(...prices) : null
}

export const resolveBundles = (
  groups: readonly SecretLairGroup[],
  products: readonly ShopProduct[],
): SecretLairBundle[] => {
  const productsById = new Map(
    products.map((product) => [product.productId, product]),
  )

  return products
    .filter((product) => product.isBundle)
    .map((bundle): SecretLairBundle | null => {
      const components = bundle.componentProductIds.flatMap(
        (componentProductId): BundleComponent[] => {
          const componentProduct = productsById.get(componentProductId)
          if (!componentProduct) {
            return []
          }

          const group = findGroupForProduct(groups, componentProduct)
          return group
            ? [
                {
                  productId: componentProduct.productId,
                  productTitle: componentProduct.title,
                  finish: componentProduct.finish,
                  group,
                },
              ]
            : []
        },
      )

      if (components.length === 0) {
        return null
      }

      const cheapestPrices = components.flatMap((component) =>
        component.group.cards
          .map((_, cardIndex) =>
            getCheapestPrintingPrice(component, cardIndex),
          )
          .filter((price): price is number => price !== null),
      )

      return {
        productId: bundle.productId,
        title: bundle.title,
        price: bundle.price,
        purchasable: bundle.purchasable,
        purchaseUrl: getSecretLairProductUrl(bundle.productId),
        cardCount: components.reduce(
          (count, component) => count + component.group.cards.length,
          0,
        ),
        cheapestPrintingTotal:
          Math.round(
            cheapestPrices.reduce((total, price) => total + price, 0) *
              100,
          ) / 100,
        cheapestPricedCardCount: cheapestPrices.length,
        components,
      }
    })
    .filter((bundle): bundle is SecretLairBundle => bundle !== null)
    .sort(
      (left, right) =>
        Number(right.purchasable) - Number(left.purchasable) ||
        left.title.localeCompare(right.title),
    )
}

export const indexBundlesByGroup = (
  bundles: readonly SecretLairBundle[],
): Record<string, SecretLairBundle[]> => {
  const bundlesByGroup: Record<string, SecretLairBundle[]> = {}

  for (const bundle of bundles) {
    for (const slug of new Set(
      bundle.components.map((component) => component.group.slug),
    )) {
      const groupBundles = bundlesByGroup[slug] ?? []
      groupBundles.push(bundle)
      bundlesByGroup[slug] = groupBundles
    }
  }

  return bundlesByGroup
}
