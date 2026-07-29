import { supabase } from '../lib/supabase'

export type AdminOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled'

export const adminOrderStatusLabels: Record<AdminOrderStatus, string> = {
  pending: 'Novo pedido',
  confirmed: 'Confirmado',
  preparing: 'Em produção',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para entrega',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
}

export type AdminOrder = {
  id: string
  orderNumber: number
  createdAt: string
  customerName: string
  customerPhone: string
  orderType: string
  fulfillmentType: 'delivery' | 'pickup'
  requestedDate: string | null
  requestedTime: string | null
  subtotal: number
  deliveryFee: number
  total: number
  status: AdminOrderStatus
  paymentStatus: string
  customerNotes: string
  distanceKm: number | null
  items: Array<{
    id: string
    productName: string
    productFlavor: string | null
    productVariant: string | null
    productSizeMl: number | null
    productWeightGrams: number | null
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  deliveryAddress: {
    postalCode: string | null
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
    reference: string | null
  } | null
}

type AdminOrderRow = {
  id: string
  order_number: number
  created_at: string
  customer_name: string
  customer_phone: string
  order_type: string
  fulfillment_type: 'delivery' | 'pickup'
  requested_date: string | null
  requested_time: string | null
  subtotal: number | string
  delivery_fee: number | string
  total: number | string
  status: AdminOrderStatus
  payment_status: string
  customer_notes: string | null
  distance_km: number | string | null
  order_items?: Array<{
    id: string
    product_name: string
    product_flavor: string | null
    product_variant: string | null
    product_size_ml: number | null
    product_weight_grams: number | null
    quantity: number
    unit_price: number | string
    total_price: number | string
  }>
  delivery_addresses?: Array<{
    postal_code: string | null
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
    reference: string | null
  }> | {
    postal_code: string | null
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
    reference: string | null
  } | null
}

function toNumber(value: number | string | null) {
  return value === null ? null : Number(value)
}

function mapOrder(row: AdminOrderRow): AdminOrder {
  const rawAddress = Array.isArray(row.delivery_addresses) ? row.delivery_addresses[0] : row.delivery_addresses
  return {
    id: row.id,
    orderNumber: Number(row.order_number),
    createdAt: row.created_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    orderType: row.order_type,
    fulfillmentType: row.fulfillment_type,
    requestedDate: row.requested_date,
    requestedTime: row.requested_time,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    paymentStatus: row.payment_status,
    customerNotes: row.customer_notes ?? '',
    distanceKm: toNumber(row.distance_km),
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      productName: item.product_name,
      productFlavor: item.product_flavor,
      productVariant: item.product_variant,
      productSizeMl: item.product_size_ml,
      productWeightGrams: item.product_weight_grams,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
    })),
    deliveryAddress: rawAddress ? {
      postalCode: rawAddress.postal_code,
      street: rawAddress.street,
      number: rawAddress.number,
      complement: rawAddress.complement,
      neighborhood: rawAddress.neighborhood,
      city: rawAddress.city,
      state: rawAddress.state,
      reference: rawAddress.reference,
    } : null,
  }
}

export async function fetchAdminOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), delivery_addresses(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Falha ao carregar pedidos: ${error.message}`)
  return ((data ?? []) as unknown as AdminOrderRow[]).map(mapOrder)
}

export async function updateOrderStatus(orderId: string, status: AdminOrderStatus) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)

  if (error) throw new Error(`Falha ao atualizar status: ${error.message}`)
}

export async function deleteOrder(orderId: string) {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) throw new Error(`Falha ao excluir pedido: ${error.message}`)
}
