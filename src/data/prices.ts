export type PuddingType = 'normal' | 'zero'
export type Flavor = 'tradicional' | 'cafe'
export type Size = '180ml' | '500ml' | '1kg'
export type DeliveryMode = 'retirada' | 'entrega'
export type ProductOrderMode = 'ready' | 'scheduled'
export type DeliveryRange = { maxDistance: number; price: number }
export type DeliveryTimeSurcharge = { label: string; active: boolean; start: string; end: string; extraPrice: number }
export type DeliveryPricingConfig = { enabled: boolean; ranges: DeliveryRange[]; timeSurcharges: DeliveryTimeSurcharge[] }
export type ProductKey = `${PuddingType}_${Flavor}_${Size}`

export const prices: Record<PuddingType, Record<Flavor, Record<Size, number>>> = {
  normal: {
    tradicional: {
      '180ml': 12,
      '500ml': 28,
      '1kg': 50,
    },
    cafe: {
      '180ml': 14,
      '500ml': 32,
      '1kg': 55,
    },
  },
  zero: {
    tradicional: {
      '180ml': 14,
      '500ml': 32,
      '1kg': 60,
    },
    cafe: {
      '180ml': 16,
      '500ml': 35,
      '1kg': 65,
    },
  },
}


export type PromotionProductKey = 'normal_tradicional_180ml' | 'normal_tradicional_500ml' | 'normal_cafe_180ml' | 'normal_cafe_500ml' | 'zero_tradicional_180ml' | 'zero_tradicional_500ml' | 'zero_cafe_180ml' | 'zero_cafe_500ml'

export const promotion = {
  active: true,
  title: 'Pudins a partir de R$ 7,99',
  subtitle: 'Pronta entrega em Goiânia',
  badge: 'PRONTA ENTREGA',
  urgency: 'Promoção por tempo limitado ou enquanto durar o estoque.',
  products: {
    normal_tradicional_180ml: {
      flavor: 'tradicional' as const,
      size: '180ml' as const,
      type: 'normal' as const,
      originalPrice: 12,
      promotionalPrice: 7.99,
      minimumDeliveryQuantity: 4,
    },
    normal_tradicional_500ml: {
      flavor: 'tradicional' as const,
      size: '500ml' as const,
      type: 'normal' as const,
      originalPrice: 30,
      promotionalPrice: 19.99,
      minimumDeliveryQuantity: 2,
    },
    normal_cafe_180ml: {
      flavor: 'cafe' as const,
      size: '180ml' as const,
      type: 'normal' as const,
      originalPrice: 14,
      promotionalPrice: 9.99,
      minimumDeliveryQuantity: 4,
    },
    normal_cafe_500ml: {
      flavor: 'cafe' as const,
      size: '500ml' as const,
      type: 'normal' as const,
      originalPrice: 32,
      promotionalPrice: 22.99,
      minimumDeliveryQuantity: 2,
    },
    zero_tradicional_180ml: {
      flavor: 'tradicional' as const,
      size: '180ml' as const,
      type: 'zero' as const,
      originalPrice: 14,
      promotionalPrice: 9.99,
      minimumDeliveryQuantity: 4,
    },
    zero_tradicional_500ml: {
      flavor: 'tradicional' as const,
      size: '500ml' as const,
      type: 'zero' as const,
      originalPrice: 32,
      promotionalPrice: 24.99,
      minimumDeliveryQuantity: 2,
    },
    zero_cafe_180ml: {
      flavor: 'cafe' as const,
      size: '180ml' as const,
      type: 'zero' as const,
      originalPrice: 16,
      promotionalPrice: 11.99,
      minimumDeliveryQuantity: 4,
    },
    zero_cafe_500ml: {
      flavor: 'cafe' as const,
      size: '500ml' as const,
      type: 'zero' as const,
      originalPrice: 35,
      promotionalPrice: 27.99,
      minimumDeliveryQuantity: 2,
    },
  } satisfies Record<PromotionProductKey, {
    flavor: Flavor
    size: Size
    type: PuddingType
    originalPrice: number
    promotionalPrice: number
    minimumDeliveryQuantity: number
  }>,
}


export const flavorLabels: Record<Flavor, string> = {
  tradicional: 'Tradicional',
  cafe: 'Café',
}

export const typeLabels: Record<PuddingType, string> = {
  normal: 'Normal',
  zero: 'Zero lactose',
}

export const sizeLabels: Record<Size, string> = {
  '180ml': '180 ml',
  '500ml': '500 ml',
  '1kg': '1 kg',
}

export const deliveryLabels: Record<DeliveryMode, string> = {
  retirada: 'Retirada',
  entrega: 'Entrega',
}


export type PuddingPrices = typeof prices
export type PromotionConfig = typeof promotion

export type AppConfig = {
  pickupLocation: string
  availability: {
    readyDelivery: boolean
    scheduledOrders: boolean
    openingHours: string
    weeklyHours: Array<{ day: string; open: boolean; hours: string }>
    availabilityMessage: string
  }
  productAvailability: Record<ProductKey, boolean>
  productOrderModes: Record<ProductKey, Record<ProductOrderMode, boolean>>
  deliveryPricing: DeliveryPricingConfig
  prices: PuddingPrices
  promotion: PromotionConfig
}

export const defaultAppConfig: AppConfig = {
  pickupLocation: 'Setor Faiçalville, próximo ao Sesc Faiçalville',
  availability: {
    readyDelivery: true,
    scheduledOrders: true,
    openingHours: 'Segunda a sábado, das 9h às 18h',
    weeklyHours: [
      { day: 'Segunda', open: true, hours: '09:00 às 18:00' },
      { day: 'Terça', open: true, hours: '09:00 às 18:00' },
      { day: 'Quarta', open: true, hours: '09:00 às 18:00' },
      { day: 'Quinta', open: true, hours: '09:00 às 18:00' },
      { day: 'Sexta', open: true, hours: '09:00 às 18:00' },
      { day: 'Sábado', open: true, hours: '09:00 às 14:00' },
      { day: 'Domingo', open: false, hours: 'Fechado' },
    ],
    availabilityMessage: 'Pronta entrega sujeita à disponibilidade do dia.',
  },

  productAvailability: {
    normal_tradicional_180ml: true,
    normal_tradicional_500ml: true,
    normal_tradicional_1kg: true,
    normal_cafe_180ml: true,
    normal_cafe_500ml: true,
    normal_cafe_1kg: true,
    zero_tradicional_180ml: true,
    zero_tradicional_500ml: true,
    zero_tradicional_1kg: true,
    zero_cafe_180ml: true,
    zero_cafe_500ml: true,
    zero_cafe_1kg: true,
  },

  productOrderModes: {
    normal_tradicional_180ml: { ready: true, scheduled: true },
    normal_tradicional_500ml: { ready: true, scheduled: true },
    normal_tradicional_1kg: { ready: false, scheduled: true },
    normal_cafe_180ml: { ready: true, scheduled: true },
    normal_cafe_500ml: { ready: true, scheduled: true },
    normal_cafe_1kg: { ready: false, scheduled: true },
    zero_tradicional_180ml: { ready: true, scheduled: true },
    zero_tradicional_500ml: { ready: true, scheduled: true },
    zero_tradicional_1kg: { ready: false, scheduled: true },
    zero_cafe_180ml: { ready: true, scheduled: true },
    zero_cafe_500ml: { ready: true, scheduled: true },
    zero_cafe_1kg: { ready: false, scheduled: true },
  },

  deliveryPricing: {
    enabled: true,
    ranges: [
      { maxDistance: 3, price: 6 },
      { maxDistance: 6, price: 8 },
      { maxDistance: 9, price: 11 },
      { maxDistance: 12, price: 15 },
    ],
    timeSurcharges: [
      { label: 'Horário de pico', active: false, start: '18:00', end: '21:00', extraPrice: 3 },
    ],
  },
  prices,
  promotion,
}
