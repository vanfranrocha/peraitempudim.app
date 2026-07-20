export type PuddingType = 'normal' | 'zero'
export type Flavor = 'tradicional' | 'cafe'
export type Size = '180ml' | '500ml' | '1kg'
export type DeliveryMode = 'retirada' | 'entrega'

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
