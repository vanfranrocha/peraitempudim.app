import { supabase } from '../lib/supabase'

const checkoutSessionStorageKey = 'perai-checkout-session-id'

export type CheckoutTrackingStatus = 'cart_started' | 'details_started' | 'checkout_viewed' | 'completed' | 'abandoned'
export type CheckoutTrackingStep = 'cart' | 'details' | 'checkout' | 'success'
export type CheckoutLastCompletedField =
  | 'delivery_mode_selected'
  | 'cep_started'
  | 'cep_found'
  | 'delivery_calculated'
  | 'delivery_to_confirm'
  | 'number_filled'
  | 'name_filled'
  | 'phone_filled'
  | 'optional_section_opened'
  | 'details_completed'

export type CheckoutTrackingPayload = {
  status: CheckoutTrackingStatus
  current_step: CheckoutTrackingStep
  items_quantity: number
  cart_subtotal: number
  order_mode: string | null
  fulfillment_type: string | null
  customer_name?: string | null
  customer_phone?: string | null
  last_completed_field?: CheckoutLastCompletedField | null
  cart_items: Array<{
    product_id: string
    product_key: string
    quantity: number
  }>
}

export function getOrCreateCheckoutSessionId() {
  const stored = window.sessionStorage.getItem(checkoutSessionStorageKey)
  if (stored) return stored
  const id = crypto.randomUUID()
  window.sessionStorage.setItem(checkoutSessionStorageKey, id)
  return id
}

export function resetCheckoutSession() {
  window.sessionStorage.removeItem(checkoutSessionStorageKey)
}

async function trackCheckoutSession(payload: CheckoutTrackingPayload) {
  const sessionId = getOrCreateCheckoutSessionId()
  const { error } = await supabase.rpc('track_checkout_session', {
    payload: {
      session_id: sessionId,
      ...payload,
    },
  })

  if (error) throw new Error(error.message)
  return sessionId
}

function warnTracking(error: unknown) {
  console.warn('[Peraí, tem pudim!] Tracking de checkout indisponível.', error)
}

export async function trackCartStarted(payload: Omit<CheckoutTrackingPayload, 'status' | 'current_step'>) {
  try {
    return await trackCheckoutSession({ ...payload, status: 'cart_started', current_step: 'cart' })
  } catch (error) {
    warnTracking(error)
    return getOrCreateCheckoutSessionId()
  }
}

export async function trackDetailsStarted(payload: Omit<CheckoutTrackingPayload, 'status' | 'current_step'>) {
  try {
    return await trackCheckoutSession({ ...payload, status: 'details_started', current_step: 'details' })
  } catch (error) {
    warnTracking(error)
    return getOrCreateCheckoutSessionId()
  }
}

export async function trackCheckoutViewed(payload: Omit<CheckoutTrackingPayload, 'status' | 'current_step'>) {
  try {
    return await trackCheckoutSession({ ...payload, status: 'checkout_viewed', current_step: 'checkout' })
  } catch (error) {
    warnTracking(error)
    return getOrCreateCheckoutSessionId()
  }
}
