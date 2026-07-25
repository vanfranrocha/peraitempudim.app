export const FREE_SHIPPING_MINIMUM = 60
export const FREE_SHIPPING_MAX_DISTANCE_KM = 6
export const FREE_SHIPPING_NEAR_DISTANCE_KM = 2
export const FREE_SHIPPING_SMALL_ORDER_MINIMUM = 40
export const FREE_SHIPPING_SMALL_ORDER_MAX_DISTANCE_KM = 4

export type FreeShippingDeliveryMode = 'retirada' | 'entrega'

export type FreeShippingState = {
  amountRemainingForFreeShipping: number
  hasMinimumSubtotal: boolean
  isEligibleForFreeShipping: boolean
  isOutsideFreeShippingRadius: boolean
  shouldValidateAddressForFreeShipping: boolean
}

export function getFreeShippingState({
  deliveryMode,
  productsSubtotal,
  deliveryDistanceKm,
  hasLargePudding = false,
}: {
  deliveryMode: FreeShippingDeliveryMode
  productsSubtotal: number
  deliveryDistanceKm: number | null
  hasLargePudding?: boolean
}): FreeShippingState {
  const requiredMinimum = hasLargePudding ? FREE_SHIPPING_MINIMUM : FREE_SHIPPING_SMALL_ORDER_MINIMUM
  const amountRemainingForFreeShipping = Math.max(0, requiredMinimum - productsSubtotal)
  const hasMinimumSubtotal = productsSubtotal >= requiredMinimum
  const hasDeliveryDistance = deliveryDistanceKm !== null
  const isDelivery = deliveryMode === 'entrega'
  const isWithinNearRadius = hasDeliveryDistance && deliveryDistanceKm <= FREE_SHIPPING_NEAR_DISTANCE_KM
  const maxDistanceForMinimumRule = hasLargePudding ? FREE_SHIPPING_MAX_DISTANCE_KM : FREE_SHIPPING_SMALL_ORDER_MAX_DISTANCE_KM
  const isWithinMinimumRuleRadius = hasDeliveryDistance && deliveryDistanceKm <= maxDistanceForMinimumRule
  const isEligibleForFreeShipping = isDelivery && (Boolean(isWithinNearRadius) || (hasMinimumSubtotal && Boolean(isWithinMinimumRuleRadius)))

  return {
    amountRemainingForFreeShipping,
    hasMinimumSubtotal,
    isEligibleForFreeShipping,
    isOutsideFreeShippingRadius: isDelivery && hasMinimumSubtotal && hasDeliveryDistance && !isEligibleForFreeShipping,
    shouldValidateAddressForFreeShipping: isDelivery && hasMinimumSubtotal && !hasDeliveryDistance,
  }
}

export function getDisplayedShippingPrice({
  deliveryMode,
  calculatedDeliveryFee,
  isEligibleForFreeShipping,
}: {
  deliveryMode: FreeShippingDeliveryMode
  calculatedDeliveryFee: number | null
  isEligibleForFreeShipping: boolean
}) {
  if (deliveryMode === 'retirada') return 0
  if (isEligibleForFreeShipping) return 0
  return calculatedDeliveryFee
}

export function getOrderTotal(productsSubtotal: number, displayedShippingPrice: number | null) {
  return productsSubtotal + (displayedShippingPrice ?? 0)
}
