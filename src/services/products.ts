import type {
  AppConfig,
  Flavor,
  ProductKey,
  PromotionProductKey,
  PuddingType,
  Size,
} from '../data/prices'
import { supabase } from '../lib/supabase'

export type SupabaseProduct = {
  id: string | number
  product_key: string
  name: string
  flavor: string
  variant: 'normal' | 'zero_lactose' | string
  size_ml: number | null
  weight_grams: number | null
  price: number
  promotional_price: number | null
  promotional_minimum_quantity: number | null
  is_active: boolean
  is_featured: boolean
  is_on_promotion: boolean
  available_for_ready_delivery: boolean
  available_for_scheduled_order: boolean
  sort_order: number | null
}

type SupabaseProductRow = Omit<
  SupabaseProduct,
  'size_ml' | 'weight_grams' | 'price' | 'promotional_price' | 'promotional_minimum_quantity' | 'sort_order'
> & {
  size_ml: number | string | null
  weight_grams: number | string | null
  price: number | string
  promotional_price: number | string | null
  promotional_minimum_quantity: number | string | null
  sort_order: number | string | null
}

type PromotionProductConfig = AppConfig['promotion']['products'][PromotionProductKey]

const productColumns = [
  'id',
  'product_key',
  'name',
  'flavor',
  'variant',
  'size_ml',
  'weight_grams',
  'price',
  'promotional_price',
  'promotional_minimum_quantity',
  'is_active',
  'is_featured',
  'is_on_promotion',
  'available_for_ready_delivery',
  'available_for_scheduled_order',
  'sort_order',
].join(',')

function toNumber(value: number | string | null, field: string, productKey: string) {
  if (value === null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Produto ${productKey} possui ${field} inválido.`)
  return parsed
}

function cloneConfig(config: AppConfig) {
  return JSON.parse(JSON.stringify(config)) as AppConfig
}

function mapVariant(variant: string, productKey: string): PuddingType {
  if (variant === 'normal') return 'normal'
  if (variant === 'zero_lactose') return 'zero'
  throw new Error(`Produto ${productKey} possui variante inválida: ${variant}.`)
}

function mapFlavor(flavor: string, productKey: string): Flavor {
  if (flavor === 'tradicional' || flavor === 'cafe') return flavor
  throw new Error(`Produto ${productKey} possui sabor inválido: ${flavor}.`)
}

function mapSize(product: SupabaseProduct): Size {
  if (product.size_ml === 180) return '180ml'
  if (product.size_ml === 500) return '500ml'
  if (product.weight_grams === 1000) return '1kg'
  throw new Error(`Produto ${product.product_key} possui tamanho inválido.`)
}

function normalizeProductKey(product: SupabaseProduct, type: PuddingType, flavor: Flavor, size: Size): ProductKey {
  const normalized = product.product_key.replace('zero_lactose', 'zero')
  const expected = `${type}_${flavor}_${size}` as ProductKey
  return normalized === expected ? (normalized as ProductKey) : expected
}

function isPromotionProductKey(key: ProductKey): key is PromotionProductKey {
  return key in ({
    normal_tradicional_180ml: true,
    normal_tradicional_500ml: true,
    normal_cafe_180ml: true,
    normal_cafe_500ml: true,
    zero_tradicional_180ml: true,
    zero_tradicional_500ml: true,
    zero_cafe_180ml: true,
    zero_cafe_500ml: true,
  } satisfies Record<PromotionProductKey, true>)
}

function normalizeProduct(row: SupabaseProductRow): SupabaseProduct {
  return {
    ...row,
    size_ml: toNumber(row.size_ml, 'size_ml', row.product_key),
    weight_grams: toNumber(row.weight_grams, 'weight_grams', row.product_key),
    price: toNumber(row.price, 'price', row.product_key) ?? 0,
    promotional_price: toNumber(row.promotional_price, 'promotional_price', row.product_key),
    promotional_minimum_quantity: toNumber(
      row.promotional_minimum_quantity,
      'promotional_minimum_quantity',
      row.product_key,
    ),
    sort_order: toNumber(row.sort_order, 'sort_order', row.product_key),
  }
}

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(productColumns)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Falha ao carregar produtos do Supabase: ${error.message}`)
  if (!data) return []

  return (data as unknown as SupabaseProductRow[]).map(normalizeProduct)
}

export function applyProductsToConfig(products: SupabaseProduct[], currentConfig: AppConfig) {
  const nextConfig = cloneConfig(currentConfig)
  nextConfig.promotion.active = products.some((product) => product.is_on_promotion)

  for (const product of products) {
    const type = mapVariant(product.variant, product.product_key)
    const flavor = mapFlavor(product.flavor, product.product_key)
    const size = mapSize(product)
    const productKey = normalizeProductKey(product, type, flavor, size)

    nextConfig.prices[type][flavor][size] = product.price
    nextConfig.productAvailability[productKey] = product.is_active
    nextConfig.productOrderModes[productKey] = {
      ready: product.available_for_ready_delivery,
      scheduled: product.available_for_scheduled_order,
    }

    if (product.promotional_price !== null && isPromotionProductKey(productKey)) {
      const promotionProducts = nextConfig.promotion.products as Record<PromotionProductKey, PromotionProductConfig>
      const promotionSize = size as PromotionProductConfig['size']
      promotionProducts[productKey] = {
        ...promotionProducts[productKey],
        flavor,
        size: promotionSize,
        type,
        originalPrice: product.price,
        promotionalPrice: product.promotional_price,
        minimumDeliveryQuantity: product.promotional_minimum_quantity ?? 1,
      }
    }
  }

  return nextConfig
}


export async function saveProductsToSupabase(currentConfig: AppConfig) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    throw new Error(`Não foi possível verificar a autenticação do admin: ${sessionError.message}`)
  }

  if (!sessionData.session) {
    throw new Error('Para salvar produtos no Supabase, entre novamente com uma conta administradora.')
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin')
  if (adminError) throw new Error(`Não foi possível verificar permissão administrativa: ${adminError.message}`)
  if (!isAdmin) throw new Error('Você não possui permissão administrativa para salvar produtos no Supabase.')

  const products = await fetchProducts()

  for (const product of products) {
    const type = mapVariant(product.variant, product.product_key)
    const flavor = mapFlavor(product.flavor, product.product_key)
    const size = mapSize(product)
    const productKey = normalizeProductKey(product, type, flavor, size)
    const promotionProduct = isPromotionProductKey(productKey) ? currentConfig.promotion.products[productKey] : null

    const { error } = await supabase
      .from('products')
      .update({
        price: currentConfig.prices[type][flavor][size],
        promotional_price: promotionProduct?.promotionalPrice ?? null,
        promotional_minimum_quantity: promotionProduct?.minimumDeliveryQuantity ?? 1,
        is_active: currentConfig.productAvailability[productKey] !== false,
        is_on_promotion: Boolean(currentConfig.promotion.active && promotionProduct),
        available_for_ready_delivery: currentConfig.productOrderModes[productKey]?.ready !== false,
        available_for_scheduled_order: currentConfig.productOrderModes[productKey]?.scheduled !== false,
      })
      .eq('id', product.id)

    if (error) throw new Error(`Falha ao salvar produto ${product.product_key} no Supabase: ${error.message}`)
  }

  return products.length
}
