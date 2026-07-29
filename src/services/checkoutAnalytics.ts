import { supabase } from '../lib/supabase'

export type FunnelRange = 'today' | '7d' | '30d'

export type CheckoutFunnelSummary = {
  sessionsStarted: number
  detailsStarted: number
  checkoutViewed: number
  completed: number
  abandoned: number
  cartToOrderConversionRate: number
  checkoutToOrderConversionRate: number
  estimatedAbandonedCartValue: number
}

export type AbandonedCheckoutSession = {
  sessionId: string
  status: string
  currentStep: string
  lastActivityAt: string
  itemsQuantity: number
  cartSubtotal: number
  customerName: string | null
  customerPhone: string | null
}

function getRangeDates(range: FunnelRange) {
  const end = new Date()
  const start = new Date(end)
  if (range === 'today') start.setHours(0, 0, 0, 0)
  if (range === '7d') start.setDate(start.getDate() - 7)
  if (range === '30d') start.setDate(start.getDate() - 30)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function fetchCheckoutFunnelSummary(range: FunnelRange) {
  const { start, end } = getRangeDates(range)
  const { data, error } = await supabase.rpc('get_checkout_funnel_summary', { start_date: start, end_date: end })
  if (error) throw new Error(`Falha ao carregar funil: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    sessionsStarted: Number(row?.sessions_started ?? 0),
    detailsStarted: Number(row?.details_started ?? 0),
    checkoutViewed: Number(row?.checkout_viewed ?? 0),
    completed: Number(row?.completed ?? 0),
    abandoned: Number(row?.abandoned ?? 0),
    cartToOrderConversionRate: Number(row?.cart_to_order_conversion_rate ?? 0),
    checkoutToOrderConversionRate: Number(row?.checkout_to_order_conversion_rate ?? 0),
    estimatedAbandonedCartValue: Number(row?.estimated_abandoned_cart_value ?? 0),
  } satisfies CheckoutFunnelSummary
}

export async function fetchRecentAbandonedCheckoutSessions(range: FunnelRange) {
  const { start, end } = getRangeDates(range)
  const { data, error } = await supabase.rpc('get_recent_abandoned_checkout_sessions', { start_date: start, end_date: end })
  if (error) throw new Error(`Falha ao carregar carrinhos abandonados: ${error.message}`)
  return (data ?? []).map((row: any) => ({
    sessionId: String(row.session_id),
    status: String(row.status),
    currentStep: String(row.current_step),
    lastActivityAt: String(row.last_activity_at),
    itemsQuantity: Number(row.items_quantity),
    cartSubtotal: Number(row.cart_subtotal),
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
  })) satisfies AbandonedCheckoutSession[]
}
