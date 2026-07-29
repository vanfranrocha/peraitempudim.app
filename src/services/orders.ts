import { supabase } from '../lib/supabase'

export type CreateOrderPayload = {
  client_request_id: string
  checkout_session_id?: string
  customer_name: string
  customer_phone: string
  order_type: 'ready_delivery' | 'scheduled'
  fulfillment_type: 'pickup' | 'delivery'
  requested_date: string
  requested_time: string | null
  customer_notes: string
  delivery: {
    postal_code: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
    reference: string
    latitude: number | null
    longitude: number | null
    distance_km: number | null
  } | null
  items: Array<{
    product_id: string
    quantity: number
    promotion_applied?: boolean
  }>
}

export type CreateOrderResult = {
  order_id: string
  order_number: number
  total: number
  status: string
  created_at: string
}

function friendlyOrderError(message: string) {
  const normalized = message.toLocaleLowerCase('pt-BR')
  if (normalized.includes('produto indisponível')) return 'Um dos pudins escolhidos não está disponível no momento.'
  if (normalized.includes('quantidade')) return 'Confira a quantidade dos pudins antes de enviar.'
  if (normalized.includes('endereço') || normalized.includes('distância')) return 'Confira o endereço de entrega antes de enviar.'
  if (normalized.includes('fora da área')) return 'Esse endereço está fora da área automática de entrega.'
  if (normalized.includes('duplicate') || normalized.includes('client_request')) return 'Esse pedido já foi recebido. Confira a tela de confirmação.'
  return message || 'Não foi possível enviar o pedido agora. Tente novamente.'
}

export async function createOrder(payload: CreateOrderPayload) {
  const { data, error } = await supabase.rpc('create_public_order', { payload })

  if (error) throw new Error(friendlyOrderError(error.message))

  const first = Array.isArray(data) ? data[0] : data
  if (!first) throw new Error('O pedido foi enviado, mas não recebemos a confirmação do banco.')

  return {
    order_id: String(first.order_id),
    order_number: Number(first.order_number),
    total: Number(first.total),
    status: String(first.status),
    created_at: String(first.created_at),
  } satisfies CreateOrderResult
}
