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
