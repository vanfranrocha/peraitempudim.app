<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import OptionCard from './components/OptionCard.vue'
import OrderSummary from './components/OrderSummary.vue'
import OrderStatusTimeline from './components/OrderStatusTimeline.vue'
import QuantityStepper from './components/QuantityStepper.vue'
import SegmentedControl from './components/SegmentedControl.vue'
import pudding1kgImage from './images/1kg.png'
import pudding180Image from './images/180.png'
import pudding500Image from './images/500ml.png'
import logoImage from './images/logo.png'
import {
  defaultAppConfig,
  deliveryLabels,
  flavorLabels,
  sizeLabels,
  type DeliveryMode,
  type Flavor,
  type PuddingType,
  type ProductKey,
  type ProductOrderMode,
  type Size,
  typeLabels,
} from './data/prices'
import {
  deliveryOriginAddress,
  formatCep,
  getDeliveryDistance,
  getDeliveryFee,
  lookupCep,
  normalizeCep,
} from './services/delivery'
import {
  FREE_SHIPPING_MAX_DISTANCE_KM,
  FREE_SHIPPING_SMALL_ORDER_MAX_DISTANCE_KM,
  getDisplayedShippingPrice,
  getFreeShippingState,
  getOrderTotal,
} from './services/deliveryRules'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { adminOrderStatusLabels, deleteOrder, fetchAdminOrders, updateOrderStatus, type AdminOrder, type AdminOrderStatus } from './services/adminOrders'
import { createOrder, type CreateOrderResult } from './services/orders'
import { getOrCreateCheckoutSessionId, resetCheckoutSession, trackCartStarted, trackCheckoutViewed, trackDetailsStarted, type CheckoutLastCompletedField } from './services/checkoutTracking'
import { deleteCheckoutSession, fetchCheckoutFunnelSummary, fetchCheckoutSessions, fetchRecentAbandonedCheckoutSessions, type AbandonedCheckoutSession, type CheckoutFunnelSummary, type CheckoutSessionListItem, type FunnelRange } from './services/checkoutAnalytics'
import { applyProductsToConfig, fetchProducts, saveProductsToSupabase } from './services/products'

const appConfigStorageKey = 'perai-tem-pudim-config'
const ordersStorageKey = 'perai-tem-pudim-orders'

type OrderMode = 'ready' | 'scheduled'
type DeliveryCalculationStatus =
  | 'idle'
  | 'calculating'
  | 'address-found'
  | 'address-not-found'
  | 'available'
  | 'outside-area'
  | 'error'

function cloneConfig() {
  return JSON.parse(JSON.stringify(defaultAppConfig)) as typeof defaultAppConfig
}

function mergeConfig(base: typeof defaultAppConfig, stored: Partial<typeof defaultAppConfig>) {
  return {
    ...base,
    ...stored,
    availability: { ...base.availability, ...stored.availability },
    productAvailability: { ...base.productAvailability, ...stored.productAvailability },
    productOrderModes: { ...base.productOrderModes, ...stored.productOrderModes },
    deliveryPricing: {
      ...base.deliveryPricing,
      ...stored.deliveryPricing,
      ranges: stored.deliveryPricing?.ranges ?? base.deliveryPricing.ranges,
      timeSurcharges: stored.deliveryPricing?.timeSurcharges ?? base.deliveryPricing.timeSurcharges,
    },
    prices: { ...base.prices, ...stored.prices },
    promotion: {
      ...base.promotion,
      ...stored.promotion,
      products: { ...base.promotion.products, ...stored.promotion?.products },
    },
  } as typeof defaultAppConfig
}

function loadStoredConfig() {
  try {
    const stored = window.localStorage.getItem(appConfigStorageKey)
    return stored ? mergeConfig(cloneConfig(), JSON.parse(stored)) : cloneConfig()
  } catch {
    return cloneConfig()
  }
}

type CartItem = {
  id: number
  productId: string
  productKey: ProductKey
  flavor: Flavor
  puddingType: PuddingType
  size: Size
  quantity: number
  unitPrice: number
  total: number
  image: string
  originalUnitPrice?: number
  promotionLabel?: string
}

type SavedOrder = {
  id: string
  createdAt: string
  customerName: string
  orderMode: string
  desiredDate: string
  desiredTimeSlot?: string
  deliveryMode: DeliveryMode
  deliveryDetails: string
  deliveryFee: number | null
  deliveryFeeLabel: string
  deliveryDistanceKm: number | null
  subtotal: number
  total: number
  notes: string
  items: Array<{
    name: string
    details: string
    quantity: number
    unitPrice: number
    total: number
    promotionLabel?: string
    image?: string
  }>
}

const initialSavedOrders: SavedOrder[] = [
  {
    id: '66094462',
    createdAt: '2026-07-21T12:00:00.000-03:00',
    customerName: 'Ana Oliveira',
    orderMode: 'Pronta entrega',
    desiredDate: '21/07/2026',
    desiredTimeSlot: '',
    deliveryMode: 'entrega',
    deliveryDetails: `Bairro: Goiânia
Endereço: Av. Canaã
Número: 664
Complemento: Qd 121 LT 27`,
    deliveryFee: null,
    deliveryFeeLabel: 'A confirmar',
    deliveryDistanceKm: null,
    subtotal: 47.94,
    total: 47.94,
    notes: 'Sem observações.',
    items: [
      {
        name: 'Pudim Tradicional',
        details: 'Normal • 180 ml',
        quantity: 6,
        unitPrice: 7.99,
        total: 47.94,
        promotionLabel: 'Promoção pronta entrega',
        image: pudding180Image,
      },
    ],
  },
]


const appConfig = ref(cloneConfig())
const adminMode = ref(false)
const adminLoggedIn = ref(false)
const adminPage = ref<'dashboard' | 'settings' | 'orders' | 'funnel' | 'delivery'>('dashboard')
const adminSettingsTab = ref<'availability' | 'hours' | 'products'>('availability')
const adminSearch = ref('')
const adminProductSizeFilter = ref<Size | 'all'>('all')
const adminProductFlavorFilter = ref<Flavor | 'all'>('all')
const adminEmail = ref('')
const adminPassword = ref('')
const showAdminPassword = ref(false)
const adminError = ref('')
const adminAuthLoading = ref(false)
const adminAuthError = ref('')
const adminAuthMessage = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const isPasswordRecovery = ref(false)
const adminSession = ref<Session | null>(null)
const isAdmin = ref(false)
const savedOrders = ref<SavedOrder[]>([])
const adminOrders = ref<AdminOrder[]>([])
const adminOrdersLoading = ref(false)
const adminOrdersError = ref('')
const checkoutFunnelRange = ref<FunnelRange>('today')
const checkoutFunnelSummary = ref<CheckoutFunnelSummary | null>(null)
const abandonedCheckoutSessions = ref<AbandonedCheckoutSession[]>([])
const checkoutSessions = ref<CheckoutSessionListItem[]>([])
const checkoutFunnelFilter = ref<'all' | 'with_contact' | 'without_contact' | 'abandoned' | 'completed'>('all')
const checkoutFunnelDensity = ref<'comfortable' | 'compact'>('compact')
const checkoutFunnelLoading = ref(false)
const checkoutFunnelError = ref('')
const removingCheckoutSessionId = ref<string | null>(null)
const hasCheckoutContact = (session: CheckoutSessionListItem) => Boolean(session.customerName || session.customerPhone)
const checkoutSessionsWithContactCount = computed(() => checkoutSessions.value.filter(hasCheckoutContact).length)
const filteredCheckoutSessions = computed(() => checkoutSessions.value.filter((session) => {
  if (checkoutFunnelFilter.value === 'with_contact') return hasCheckoutContact(session)
  if (checkoutFunnelFilter.value === 'without_contact') return !hasCheckoutContact(session)
  if (checkoutFunnelFilter.value === 'abandoned') return session.isAbandoned
  if (checkoutFunnelFilter.value === 'completed') return session.status === 'completed'
  return true
}))
const productsLoading = ref(false)
const productsLoadError = ref('')
const adminSaving = ref(false)

const flavor = ref<Flavor>('tradicional')
const puddingType = ref<PuddingType>('normal')
const size = ref<Size>('500ml')
const quantity = ref(1)
const orderMode = ref<OrderMode | null>(null)
const customerName = ref('')
const customerPhone = ref('')
const desiredDate = ref('')
const desiredTimeSlot = ref('')
const deliveryMode = ref<DeliveryMode>('entrega')
const cep = ref('')
const neighborhood = ref('')
const address = ref('')
const number = ref('')
const city = ref('Goiânia')
const state = ref('GO')
const complement = ref('')
const reference = ref('')
const notes = ref('')
const optionalAddressOpen = ref(false)
const manualAddressMode = ref(false)
const deliveryStatus = ref<DeliveryCalculationStatus>('idle')
const deliveryMessage = ref('')
const deliveryDistanceKm = ref<number | null>(null)
const calculatedDeliveryFee = ref<number | null>(null)
const triedSubmit = ref(false)
const submitLoading = ref(false)
const submitError = ref('')
const currentCreatedOrder = ref<CreateOrderResult | null>(null)
const createdOrderItems = ref<CartItem[]>([])
const isLoading = ref(true)
const loadingPhraseIndex = ref(0)
const cartItems = ref<CartItem[]>([])
const currentPage = ref<'start' | 'order' | 'details' | 'checkout' | 'success'>('start')
const flavorSection = ref<HTMLElement | null>(null)
const typeSection = ref<HTMLElement | null>(null)
const sizeSection = ref<HTMLElement | null>(null)
const cartSection = ref<HTMLElement | null>(null)
const summarySection = ref<HTMLElement | null>(null)
const promotionSection = ref<HTMLElement | null>(null)
const promoQueryEnabled = ref(false)
const productIdByKey = ref<Partial<Record<ProductKey, string>>>({})
const shouldHighlightPromotion = ref(false)

let authSubscription: { unsubscribe: () => void } | null = null

const loadingPhrases = ['produção artesanal', 'Sob encomenda e pronta entrega', 'feito com calma e carinho']

const todayIso = computed(() => new Date().toISOString().slice(0, 10))
const maxDateIso = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().slice(0, 10)
})
const scheduledTimeOptions = computed(() => {
  if (orderMode.value !== 'scheduled' || !desiredDate.value) return []
  const dayConfig = getOpeningHoursForDate(desiredDate.value)
  if (!dayConfig?.open) return []
  const range = parseHourRange(dayConfig.hours)
  if (!range) return []

  const slots: string[] = []
  for (let start = range.start; start + 60 <= range.end; start += 60) {
    slots.push(`${formatHour(start)} - ${formatHour(start + 60)}`)
  }
  return slots
})
const unitPrice = computed(() => getEffectivePrice(puddingType.value, flavor.value, size.value))
const selectedOriginalPrice = computed(() => getPromotionalProduct(puddingType.value, flavor.value, size.value)?.originalPrice)
const selectedPromotionLabel = computed(() => getPromotionalProduct(puddingType.value, flavor.value, size.value) ? 'Promoção pronta entrega' : '')
const selectedItemTotal = computed(() => unitPrice.value * quantity.value)
const subtotal = computed(() => cartItems.value.reduce((sum, item) => sum + item.total, 0))
const hasLargePuddingInCart = computed(() => cartItems.value.some((item) => item.size === '500ml'))
const freeShippingRadiusLabel = computed(() => hasLargePuddingInCart.value ? FREE_SHIPPING_MAX_DISTANCE_KM : FREE_SHIPPING_SMALL_ORDER_MAX_DISTANCE_KM)
const freeShippingState = computed(() =>
  getFreeShippingState({
    deliveryMode: deliveryMode.value,
    productsSubtotal: subtotal.value,
    deliveryDistanceKm: deliveryDistanceKm.value,
    hasLargePudding: hasLargePuddingInCart.value,
  }),
)
const isEligibleForFreeShipping = computed(() => freeShippingState.value.isEligibleForFreeShipping)
const amountRemainingForFreeShipping = computed(() => freeShippingState.value.amountRemainingForFreeShipping)
const deliveryFee = computed(() => {
  if (deliveryMode.value === 'entrega' && !isDeliveryCalculationEnabled.value) return null
  return getDisplayedShippingPrice({
    deliveryMode: deliveryMode.value,
    calculatedDeliveryFee: calculatedDeliveryFee.value,
    isEligibleForFreeShipping: isEligibleForFreeShipping.value,
  })
})
const total = computed(() => getOrderTotal(subtotal.value, deliveryFee.value))
const effectiveDesiredDate = computed(() => (orderMode.value === 'ready' ? todayIso.value : desiredDate.value))
function getDateError() {
  if (orderMode.value === 'ready') return ''
  if (!desiredDate.value) return 'Escolha a data desejada para sua encomenda.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate.value)) return 'Informe uma data válida.'
  if (desiredDate.value < todayIso.value) return 'Escolha uma data a partir de hoje.'
  if (desiredDate.value > maxDateIso.value) return 'Escolha uma data dentro dos próximos 12 meses.'
  if (!scheduledTimeOptions.value.length) return 'Não há horários disponíveis para a data escolhida.'
  if (!desiredTimeSlot.value) return 'Escolha o horário desejado para sua encomenda.'
  return ''
}
const dateError = computed(() => {
  if (!triedSubmit.value) return ''
  return getDateError()
})
const customerNameError = computed(() => {
  if (!triedSubmit.value) return ''
  if (!customerName.value.trim()) return 'Informe seu nome para identificar o pedido.'
  if (customerName.value.trim().length < 2) return 'Informe um nome válido.'
  return ''
})
const normalizedCustomerPhone = computed(() => customerPhone.value.replace(/\D/g, ''))
const customerPhoneError = computed(() => {
  if (!triedSubmit.value) return ''
  if (!normalizedCustomerPhone.value) return 'Informe um telefone para confirmarmos o pedido.'
  if (normalizedCustomerPhone.value.length < 10 || normalizedCustomerPhone.value.length > 11) return 'Informe um telefone válido com DDD.'
  return ''
})
const isDateValid = computed(() => getDateError() === '')
const pickupLocation = computed(() => appConfig.value.pickupLocation)
const prices = computed(() => appConfig.value.prices)
const promotion = computed(() => appConfig.value.promotion)
const isDeliveryCalculationEnabled = computed(() => appConfig.value.deliveryPricing.enabled !== false)

const selectedPromotionalMinimum = computed(() => getPromotionalProduct(puddingType.value, flavor.value, size.value)?.minimumDeliveryQuantity ?? 1)
const selectedProductAvailabilityError = computed(() => {
  if (isProductAvailable(puddingType.value, flavor.value, size.value)) return ''
  const key = getProductKey(puddingType.value, flavor.value, size.value)
  if (appConfig.value.productAvailability[key] === false) return 'Esse pudim está indisponível no momento.'
  if (orderMode.value === 'ready') return 'Esse pudim está disponível somente por encomenda.'
  if (orderMode.value === 'scheduled') return 'Esse pudim não está disponível para encomenda.'
  return 'Esse pudim está indisponível para esse tipo de pedido.'
})

const selectedPromotionalMinimumError = computed(() => {
  if (!selectedPromotionLabel.value || quantity.value >= selectedPromotionalMinimum.value) return ''
  return `Promoção ${sizeLabels[size.value]}: mínimo de ${selectedPromotionalMinimum.value} unidades.`
})

const deliveryAddressComplete = computed(() =>
  deliveryMode.value !== 'entrega' ||
  (normalizeCep(cep.value).length === 8 &&
    Boolean(address.value.trim()) &&
    Boolean(number.value.trim()) &&
    Boolean(neighborhood.value.trim()) &&
    Boolean(city.value.trim()) &&
    Boolean(state.value.trim())),
)
const canUseDeliveryCalculation = computed(() =>
  deliveryMode.value !== 'entrega' || !isDeliveryCalculationEnabled.value || deliveryStatus.value === 'available' || deliveryStatus.value === 'outside-area',
)
const areCustomerDetailsComplete = computed(() => {
  const nameComplete = customerName.value.trim().length >= 2
  const phoneComplete = normalizedCustomerPhone.value.length >= 10 && normalizedCustomerPhone.value.length <= 11
  return isDateValid.value && nameComplete && phoneComplete && deliveryAddressComplete.value && canUseDeliveryCalculation.value
})
const areCustomerDetailsValid = computed(() => areCustomerDetailsComplete.value && !customerNameError.value && !customerPhoneError.value)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatOrderNumber = (orderNumber: number | string) => {
  const numeric = Number(orderNumber)
  if (!Number.isFinite(numeric)) return `PUD-${String(orderNumber)}`
  return `PUD-${String(numeric).padStart(6, '0')}`
}

const formatBrazilianPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return digits || phone
}

const maskBrazilianPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits ? `(${digits}` : ''
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function formatCustomerPhoneInput(event: Event) {
  const input = event.target as HTMLInputElement
  customerPhone.value = maskBrazilianPhone(input.value)
}

const formatDistance = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`

const deliveryDistanceLabel = computed(() => (!isDeliveryCalculationEnabled.value || deliveryDistanceKm.value === null ? '' : formatDistance(deliveryDistanceKm.value)))
function getEstimatedDeliveryTime(distanceKm: number) {
  if (distanceKm <= 1) return '10 a 15 min'
  if (distanceKm <= 3) return '15 a 20 min'
  if (distanceKm <= 6) return '20 a 25 min'
  if (distanceKm <= 9) return '30 a 35 min'
  if (distanceKm <= 12) return '35 a 45 min'
  return 'a consultar'
}
const deliveryTimeLabel = computed(() => (deliveryDistanceKm.value === null ? '' : getEstimatedDeliveryTime(deliveryDistanceKm.value)))
const deliveryFeeLabel = computed(() => {
  if (deliveryMode.value === 'retirada') return 'Retirada — grátis'
  if (!isDeliveryCalculationEnabled.value) return 'A confirmar'
  if (isEligibleForFreeShipping.value) return 'Grátis'
  if (deliveryFee.value !== null) return formatCurrency(deliveryFee.value)
  if (deliveryStatus.value === 'outside-area') return 'Entrega a consultar'
  return 'A calcular'
})

const freeShippingSuggestionQuantity = computed(() => {
  const referencePrice = getEffectivePrice('normal', 'tradicional', '180ml')
  return Math.max(1, Math.ceil(amountRemainingForFreeShipping.value / referencePrice))
})

const freeShippingMessage = computed(() => {
  if (deliveryMode.value !== 'entrega' || !isDeliveryCalculationEnabled.value) return ''
  if (!freeShippingState.value.hasMinimumSubtotal) {
    const plural = freeShippingSuggestionQuantity.value > 1 ? 'pudins' : 'pudim'
    return `🍮 Adicione + ${freeShippingSuggestionQuantity.value} ${plural} de 180 ml e ganhe frete grátis.`
  }
  if (freeShippingState.value.shouldValidateAddressForFreeShipping) {
    return `Seu pedido já atingiu o valor mínimo para frete grátis. Informe o endereço para verificar se está dentro do raio de ${freeShippingRadiusLabel.value} km.`
  }
  if (freeShippingState.value.isEligibleForFreeShipping) {
    return `Parabéns, seu pedido tem frete grátis 🎉`
  }
  if (freeShippingState.value.isOutsideFreeShippingRadius) {
    return 'Este endereço está fora do raio de frete grátis. O valor da entrega foi calculado conforme a distância.'
  }
  return ''
})
const canShowFreeShippingSuggestionButton = computed(() =>
  deliveryMode.value === 'entrega' &&
  isDeliveryCalculationEnabled.value &&
  !freeShippingState.value.hasMinimumSubtotal &&
  (deliveryStatus.value === 'available' || deliveryStatus.value === 'outside-area'),
)

const detailsIntroText = computed(() =>
  deliveryMode.value === 'entrega'
    ? 'Informe o CEP para verificarmos a entrega na sua região.'
    : 'Confirme seus dados para reservar a retirada.',
)
const deliveryAddressFeedbackVisible = computed(() =>
  deliveryMode.value === 'entrega' &&
  (deliveryMessage.value || deliveryFee.value !== null || !isDeliveryCalculationEnabled.value),
)

const detailsFooterTotalLabel = computed(() =>
  deliveryMode.value === 'entrega' && deliveryFee.value !== null ? 'Total estimado com frete' : 'Total estimado',
)

const formatDate = (value: string) => {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

const formatDeliveryPeriod = (value: string) => value.replace(' - ', ' às ')

function getPromotionProductKey(type: PuddingType, selectedFlavor: Flavor, selectedSize: Size) {
  if (!promotion.value.active || !promoQueryEnabled.value) return null
  const key = `${type}_${selectedFlavor}_${selectedSize}` as keyof typeof promotion.value.products
  return key in promotion.value.products ? key : null
}

function getPromotionalProduct(type: PuddingType, selectedFlavor: Flavor, selectedSize: Size) {
  const key = getPromotionProductKey(type, selectedFlavor, selectedSize)
  return key ? promotion.value.products[key] : null
}

function getEffectivePrice(type: PuddingType, selectedFlavor: Flavor, selectedSize: Size) {
  return getPromotionalProduct(type, selectedFlavor, selectedSize)?.promotionalPrice ?? prices.value[type][selectedFlavor][selectedSize]
}


function getSizeOriginalPrice(selectedSize: Size) {
  return getPromotionalProduct('normal', 'tradicional', selectedSize)?.originalPrice
}

function getSizePromotionalPrice(selectedSize: Size) {
  return getPromotionalProduct('normal', 'tradicional', selectedSize)?.promotionalPrice
}

function getPriceParts(value?: number) {
  const formatted = formatCurrency(value ?? 0).replace(/^R\$\s?/, '')
  const [integerPart, centsPart = '00'] = formatted.split(',')
  return { integer: integerPart, cents: `,${centsPart}` }
}

const promotionStartingPrice = computed(() => {
  const values = Object.values(promotion.value.products)
    .map((product) => Number(product.promotionalPrice))
    .filter((value) => Number.isFinite(value) && value > 0)

  return values.length ? Math.min(...values) : 0
})

function getSizePriceLabel(selectedSize: Size) {
  if (promoQueryEnabled.value && promotion.value.active && getSizePromotionalPrice(selectedSize)) return 'promoção pronta entrega'
  return `a partir de ${formatCurrency(prices.value.normal.tradicional[selectedSize])}`
}

const flavorOptions = [
  {
    value: 'tradicional' as const,
    title: 'Tradicional',
    description: 'Clássico, cremoso e com calda de caramelo.',
    icon: 'pudding' as const,
  },
  {
    value: 'cafe' as const,
    title: 'Café',
    description: 'Sabor equilibrado, com toque de café e calda especial.',
    icon: 'coffee' as const,
  },
]

const baseSizeOptions = [
  { value: '180ml' as const, title: '180 ml', description: 'Porção individual', image: pudding180Image },
  { value: '500ml' as const, title: '500 ml', description: 'Ideal para compartilhar', image: pudding500Image },
  { value: '1kg' as const, title: '1 kg', description: 'Perfeito para família ou encontros', image: pudding1kgImage },
]

const sizeOptions = computed(() =>
  baseSizeOptions.map((option) => {
    const key = getProductKey(puddingType.value, flavor.value, option.value)
    const modeLabel = getProductOrderModeLabel(key)
    return {
      ...option,
      description: modeLabel === 'Pronta entrega e encomenda' ? option.description : `${option.description} • ${modeLabel}`,
    }
  }),
)

const typeOptions = [
  { label: 'Normal', value: 'normal' as const },
  { label: 'Zero lactose', value: 'zero' as const },
]

const openingInfo = computed(() => appConfig.value.availability.openingHours)
const availabilityMessage = computed(() => appConfig.value.availability.availabilityMessage)

const isReadyDeliveryOpenNow = computed(() => {
  if (!appConfig.value.availability.readyDelivery) return false
  const dayConfig = getTodayOpeningHours()
  if (!dayConfig?.open) return false
  const range = parseHourRange(dayConfig.hours)
  if (!range) return true
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return currentMinutes >= range.start && currentMinutes <= range.end
})

const readyDeliveryUnavailableText = computed(() => {
  if (isReadyDeliveryOpenNow.value) return ''
  const dayConfig = getTodayOpeningHours()
  if (!appConfig.value.availability.readyDelivery) return 'Pronta entrega indisponível no momento.'
  if (!dayConfig?.open) return 'Pronta entrega fechada hoje.'
  return `Pronta entrega disponível hoje: ${dayConfig.hours}.`
})

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function getTodayOpeningHours() {
  return appConfig.value.availability.weeklyHours.find((day) => day.day === dayNames[new Date().getDay()])
}

function getOpeningHoursForDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return appConfig.value.availability.weeklyHours.find((item) => item.day === dayNames[date.getDay()]) ?? null
}

function formatHour(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hour}h${String(minutes).padStart(2, '0')}` : `${hour}h`
}

function parseHourRange(value: string) {
  const matches = value.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/)
  if (!matches) return null
  const [, startHour, startMinute, endHour, endMinute] = matches
  return {
    start: Number(startHour) * 60 + Number(startMinute),
    end: Number(endHour) * 60 + Number(endMinute),
  }
}



const adminProductSizeFilters = [
  { label: 'Todos', value: 'all' as const },
  { label: '180 ml', value: '180ml' as const },
  { label: '500 ml', value: '500ml' as const },
  { label: '1 kg', value: '1kg' as const },
]
const adminProductFlavorFilters = [
  { label: 'Todos', value: 'all' as const },
  { label: 'Tradicional', value: 'tradicional' as const },
  { label: 'Café', value: 'cafe' as const },
]

const adminFilteredProductCards = computed(() =>
  adminProductCards.value.filter((product) => {
    const term = adminSearch.value.trim().toLocaleLowerCase('pt-BR')
    const matchesSearch = !term || `${product.name} ${product.details}`.toLocaleLowerCase('pt-BR').includes(term)
    const matchesSize = adminProductSizeFilter.value === 'all' || product.size === adminProductSizeFilter.value
    const matchesFlavor = adminProductFlavorFilter.value === 'all' || product.flavor === adminProductFlavorFilter.value
    return matchesSearch && matchesSize && matchesFlavor
  }),
)

const adminTotalProducts = computed(() => adminProductCards.value.length)
const adminAvailableProducts = computed(() => adminProductCards.value.filter((product) => appConfig.value.productAvailability[product.key] !== false).length)
const adminPromotionProducts = computed(() => adminProductCards.value.filter((product) => getProductPromotion(product.type, product.flavor, product.size)).length)
const adminAveragePrice = computed(() => {
  const values = adminProductCards.value.map((product) => appConfig.value.prices[product.type][product.flavor][product.size])
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
})
const adminClosedDays = computed(() => appConfig.value.availability.weeklyHours.filter((day) => !day.open).length)

const adminProductCards = computed(() => {
  const cards: Array<{
    key: ProductKey
    type: PuddingType
    flavor: Flavor
    size: Size
    image: string
    name: string
    details: string
  }> = []

  ;(['normal', 'zero'] as PuddingType[]).forEach((cardType) => {
    ;(['tradicional', 'cafe'] as Flavor[]).forEach((cardFlavor) => {
      ;(['180ml', '500ml', '1kg'] as Size[]).forEach((cardSize) => {
        cards.push({
          key: getProductKey(cardType, cardFlavor, cardSize),
          type: cardType,
          flavor: cardFlavor,
          size: cardSize,
          image: getProductImage(cardSize),
          name: `${flavorLabels[cardFlavor]} ${typeLabels[cardType]}`,
          details: sizeLabels[cardSize],
        })
      })
    })
  })

  return cards
})

function getProductKey(productType: PuddingType, productFlavor: Flavor, productSize: Size) {
  return `${productType}_${productFlavor}_${productSize}` as ProductKey
}

function getProductId(productType: PuddingType, productFlavor: Flavor, productSize: Size) {
  return productIdByKey.value[getProductKey(productType, productFlavor, productSize)] ?? ''
}

function getProductImage(productSize: Size) {
  if (productSize === '180ml') return pudding180Image
  if (productSize === '500ml') return pudding500Image
  return pudding1kgImage
}

function getProductPromotion(productType: PuddingType, productFlavor: Flavor, productSize: Size) {
  const key = `${productType}_${productFlavor}_${productSize}` as keyof typeof appConfig.value.promotion.products
  return key in appConfig.value.promotion.products ? appConfig.value.promotion.products[key] : null
}

function isProductAvailable(productType: PuddingType, productFlavor: Flavor, productSize: Size) {
  const key = getProductKey(productType, productFlavor, productSize)
  return appConfig.value.productAvailability[key] !== false && isProductAvailableForOrderMode(key)
}

function isProductAvailableForOrderMode(key: ProductKey) {
  if (!orderMode.value) return true
  return appConfig.value.productOrderModes[key]?.[orderMode.value] !== false
}

function getProductOrderModeLabel(key: ProductKey) {
  const modes = appConfig.value.productOrderModes[key]
  if (!modes) return 'Pronta entrega e encomenda'
  if (modes.ready && modes.scheduled) return 'Pronta entrega e encomenda'
  if (modes.ready) return 'Somente pronta entrega'
  if (modes.scheduled) return 'Somente encomenda'
  return 'Indisponível para pedidos'
}

function setProductOrderMode(key: ProductKey, mode: ProductOrderMode, value: boolean) {
  appConfig.value.productOrderModes[key] = {
    ready: appConfig.value.productOrderModes[key]?.ready ?? true,
    scheduled: appConfig.value.productOrderModes[key]?.scheduled ?? true,
    [mode]: value,
  }
}


const deliveryOptions = [
  { label: 'Entrega', value: 'entrega' as const, icon: 'delivery' as const },
  { label: 'Retirada', value: 'retirada' as const, icon: 'pickup' as const },
]

const selectedSizeImage = computed(() => sizeOptions.value.find((option) => option.value === size.value)?.image ?? pudding500Image)
const orderModeLabel = computed(() => (orderMode.value === 'ready' ? 'Pronta entrega' : 'Encomenda'))
const canShowAddButton = computed(() => currentPage.value === 'order')
const canShowSendButton = computed(() => currentPage.value === 'checkout' && itemAdded.value)
const itemAdded = computed(() => cartItems.value.length > 0)
const cartQuantity = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0))
const adminTitle = computed(() => {
  if (adminPage.value === 'dashboard') return 'Dashboard'
  if (adminPage.value === 'orders') return 'Pedidos'
  if (adminPage.value === 'delivery') return 'Entrega'
  if (adminPage.value === 'funnel') return 'Funil'
  return 'Configurações'
})
const adminSubtitle = computed(() => {
  if (adminPage.value === 'dashboard') return 'Resumo rápido da loja, produtos e campanha.'
  if (adminPage.value === 'orders') return 'Pedidos recebidos pelo app.'
  if (adminPage.value === 'delivery') return 'Controle taxa por raio e adicionais por horário.'
  if (adminPage.value === 'funnel') return 'Acompanhe quem iniciou carrinho, avançou no checkout e deixou contato.'
  return 'Ajuste disponibilidade, horários e produtos.'
})
const adminOrdersTotal = computed(() => adminOrders.value.length)
const adminOrdersToday = computed(() => {
  const today = new Date().toLocaleDateString('pt-BR')
  return adminOrders.value.filter((order) => new Date(order.createdAt).toLocaleDateString('pt-BR') === today).length
})
const adminPendingOrders = computed(() => adminOrders.value.filter((order) => order.status === 'pending').length)
const adminCompletedRevenue = computed(() =>
  adminOrders.value
    .filter((order) => order.status === 'completed')
    .reduce((sum, order) => sum + order.total, 0),
)
const adminOrdersByDay = computed(() => {
  const groups = adminOrders.value.reduce<Record<string, number>>((acc, order) => {
    const day = new Date(order.createdAt).toLocaleDateString('pt-BR')
    acc[day] = (acc[day] ?? 0) + 1
    return acc
  }, {})

  return Object.entries(groups).map(([day, count]) => ({ day, count }))
})

const adminKanbanStatuses = computed(() => [
  { status: 'pending' as AdminOrderStatus, title: 'A aceitar' },
  { status: 'confirmed' as AdminOrderStatus, title: 'Confirmado' },
  { status: 'preparing' as AdminOrderStatus, title: 'Em produção' },
  { status: 'ready' as AdminOrderStatus, title: 'Pronto' },
  { status: 'out_for_delivery' as AdminOrderStatus, title: 'Saiu para entrega' },
  { status: 'completed' as AdminOrderStatus, title: 'Finalizado' },
  { status: 'cancelled' as AdminOrderStatus, title: 'Cancelado' },
])

const adminKanbanOrders = computed(() =>
  adminKanbanStatuses.value.map((column) => ({
    ...column,
    orders: adminOrders.value.filter((order) => order.status === column.status),
  })),
)

const adminStatusFlow: AdminOrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed']

function getOrderItemImage(item: SavedOrder['items'][number] | AdminOrder['items'][number]) {
  if ('image' in item && item.image) return item.image
  if ('details' in item) {
    if (item.details.includes('180')) return pudding180Image
    if (item.details.includes('500')) return pudding500Image
    return pudding1kgImage
  }
  if (item.productSizeMl === 180) return pudding180Image
  if (item.productSizeMl === 500) return pudding500Image
  return pudding1kgImage
}

function getAdminOrderItemDetails(item: AdminOrder['items'][number]) {
  const variant = item.productVariant === 'zero_lactose' ? 'Zero lactose' : 'Normal'
  const size = item.productSizeMl ? `${item.productSizeMl} ml` : item.productWeightGrams ? `${item.productWeightGrams / 1000} kg` : ''
  return [variant, size].filter(Boolean).join(' • ')
}

function getAdminOrderWhatsappUrl(order: AdminOrder) {
  const phone = order.customerPhone.replace(/\D/g, '')
  if (!phone) return ''
  const normalized = phone.startsWith('55') ? phone : `55${phone}`
  const message = `Oi, ${order.customerName}! Recebemos seu pedido ${formatOrderNumber(order.orderNumber)} do Peraí, tem pudim! 🍮`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

function getAdminOrderDateLabel(order: AdminOrder) {
  const date = order.requestedDate ? formatDate(order.requestedDate) : 'Sem data'
  return order.requestedTime ? `${date} • ${order.requestedTime}` : date
}

function getAdminOrderShortAddress(order: AdminOrder) {
  if (order.fulfillmentType === 'pickup') return 'Retirada'
  const address = order.deliveryAddress
  if (!address) return 'Entrega sem endereço'
  return `${address.street}, ${address.number} • ${address.neighborhood}`
}

function getAdminOrderNextStatus(order: AdminOrder) {
  if (order.status === 'pending') return 'confirmed' as AdminOrderStatus
  const index = adminStatusFlow.indexOf(order.status)
  return index >= 0 ? adminStatusFlow[index + 1] : undefined
}

function getAdminOrderPreviousStatus(order: AdminOrder) {
  if (order.status === 'cancelled') return 'pending' as AdminOrderStatus
  const index = adminStatusFlow.indexOf(order.status)
  return index > 0 ? adminStatusFlow[index - 1] : undefined
}

function getAdminOrderNextLabel(order: AdminOrder) {
  if (order.status === 'pending') return 'Aceitar'
  const status = getAdminOrderNextStatus(order)
  return status ? `Avançar para ${adminOrderStatusLabels[status]}` : ''
}

function isAdminOrderItemPromotion(item: AdminOrder['items'][number]) {
  const variant = item.productVariant === 'zero_lactose' ? 'zero' : item.productVariant === 'normal' ? 'normal' : null
  const flavor = item.productFlavor === 'tradicional' || item.productFlavor === 'cafe' ? item.productFlavor : null
  const size = item.productSizeMl === 180 ? '180ml' : item.productSizeMl === 500 ? '500ml' : item.productWeightGrams === 1000 ? '1kg' : null
  if (!variant || !flavor || !size) return false
  const regularPrice = appConfig.value.prices[variant][flavor][size]
  return Number.isFinite(regularPrice) && item.unitPrice < regularPrice
}

function hasAdminOrderPromotion(order: AdminOrder) {
  return order.items.some(isAdminOrderItemPromotion)
}

function getCheckoutStepLabel(step: string) {
  if (step === 'cart') return 'Carrinho'
  if (step === 'details') return 'Dados'
  if (step === 'checkout') return 'Resumo final'
  if (step === 'success') return 'Concluído'
  return step
}

function getCheckoutStatusLabel(status: string) {
  if (status === 'cart_started') return 'Carrinho iniciado'
  if (status === 'details_started') return 'Dados iniciados'
  if (status === 'checkout_viewed') return 'Checkout visualizado'
  if (status === 'completed') return 'Pedido concluído'
  if (status === 'abandoned') return 'Abandonado'
  return status
}

function getCheckoutSessionWhatsappUrl(session: CheckoutSessionListItem) {
  const phone = session.customerPhone?.replace(/\D/g, '')
  if (!phone) return ''
  const normalized = phone.startsWith('55') ? phone : `55${phone}`
  const name = session.customerName ? `, ${session.customerName}` : ''
  const message = `Oi${name}! Aqui é do Peraí, tem pudim! 🍮 Vi que você começou um pedido por aqui. Posso te ajudar a finalizar?`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

function getCheckoutProductLabel(productKey?: string) {
  if (!productKey) return 'Pudim'
  const parts = productKey.split('_')
  const type = parts[0] === 'zero' ? 'Zero lactose' : 'Normal'
  const flavor = productKey.includes('_cafe_') ? 'Café' : 'Tradicional'
  const size = productKey.endsWith('180ml') ? '180 ml' : productKey.endsWith('500ml') ? '500 ml' : productKey.endsWith('1kg') ? '1 kg' : ''
  return `Pudim ${flavor} • ${type}${size ? ` • ${size}` : ''}`
}

function getCheckoutProgressLabel(field?: string | null) {
  const labels: Record<string, string> = {
    delivery_mode_selected: 'Escolheu entrega/retirada',
    cep_started: 'Começou pelo CEP',
    cep_found: 'CEP encontrado',
    delivery_calculated: 'Viu a entrega',
    delivery_to_confirm: 'Entrega a confirmar',
    number_filled: 'Informou número',
    name_filled: 'Informou nome',
    phone_filled: 'Informou telefone',
    optional_section_opened: 'Abriu opcionais',
    details_completed: 'Dados completos',
  }
  return field ? labels[field] ?? field : 'Sem progresso registrado'
}

function isCheckoutItemPromotional(item: CheckoutSessionListItem['cartItems'][number]) {
  return Boolean(item.promotion_applied)
}

async function removeCheckoutSession(sessionId: string) {
  if (removingCheckoutSessionId.value) return
  removingCheckoutSessionId.value = sessionId
  checkoutFunnelError.value = ''
  try {
    await deleteCheckoutSession(sessionId)
    checkoutSessions.value = checkoutSessions.value.filter((session) => session.sessionId !== sessionId)
    await loadCheckoutFunnel()
    adminError.value = 'Item removido do funil.'
  } catch (error) {
    checkoutFunnelError.value = error instanceof Error ? error.message : 'Não foi possível remover o item do funil.'
  } finally {
    removingCheckoutSessionId.value = null
  }
}

function getAdminDeliveryDetails(order: AdminOrder) {
  if (order.fulfillmentType === 'pickup') return 'Retirada no local combinado.'
  const address = order.deliveryAddress
  if (!address) return 'Endereço não informado.'
  return [
    address.postalCode && `CEP: ${address.postalCode}`,
    `Endereço: ${address.street}`,
    `Número: ${address.number}`,
    `Bairro: ${address.neighborhood}`,
    `Cidade/UF: ${address.city} - ${address.state}`,
    address.complement && `Complemento: ${address.complement}`,
    address.reference && `Referência: ${address.reference}`,
  ].filter(Boolean).join('\n')
}

let deliveryDebounce: number | undefined
let checkoutTrackingDebounce: number | undefined
let latestDeliveryRequestId = 0
let detailsProgressDebounce = 0
let adminOrdersChannel: ReturnType<typeof supabase.channel> | null = null

function resetDeliveryCalculation(status: DeliveryCalculationStatus = 'idle', message = '') {
  deliveryStatus.value = status
  deliveryMessage.value = message
  deliveryDistanceKm.value = null
  calculatedDeliveryFee.value = null
}

function completeDeliveryAddress() {
  return [
    `${address.value.trim()}, ${number.value.trim()}`,
    complement.value.trim(),
    neighborhood.value.trim(),
    `${city.value.trim()} - ${state.value.trim()}`,
    `CEP ${formatCep(cep.value)}`,
  ].filter(Boolean).join(', ')
}

async function fillAddressByCep() {
  const digits = normalizeCep(cep.value)
  cep.value = formatCep(digits)

  if (digits.length !== 8) {
    resetDeliveryCalculation('idle')
    return
  }

  try {
    const cepAddress = await lookupCep(digits)
    cep.value = cepAddress.cep
    address.value = cepAddress.street || address.value
    neighborhood.value = cepAddress.neighborhood || neighborhood.value
    city.value = 'Goiânia'
    state.value = 'GO'
    manualAddressMode.value = false
    deliveryStatus.value = 'address-found'
    deliveryMessage.value = 'Endereço encontrado. Informe o número para calcular a entrega.'
    trackDetailsProgress('cep_found')
  } catch {
    manualAddressMode.value = true
    resetDeliveryCalculation('address-not-found', 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.')
  }
}

async function calculateDeliveryFee() {
  if (deliveryMode.value === 'entrega' && !isDeliveryCalculationEnabled.value) {
    resetDeliveryCalculation('idle')
    return
  }

  if (deliveryMode.value !== 'entrega' || !isDeliveryCalculationEnabled.value) {
    resetDeliveryCalculation('idle')
    if (deliveryMode.value === 'entrega' && !isDeliveryCalculationEnabled.value) trackDetailsProgress('delivery_to_confirm')
    return
  }

  if (!deliveryAddressComplete.value) {
    resetDeliveryCalculation('idle')
    return
  }

  const requestId = Date.now()
  latestDeliveryRequestId = requestId
  deliveryStatus.value = 'calculating'
  deliveryMessage.value = 'Calculando entrega...'

  try {
    const result = await getDeliveryDistance(deliveryOriginAddress, completeDeliveryAddress())
    if (latestDeliveryRequestId !== requestId) return

    const roundedDistance = Math.round(result.distanceKm * 10) / 10
    const fee = getDeliveryFee(
      roundedDistance,
      appConfig.value.deliveryPricing.ranges,
      appConfig.value.deliveryPricing.timeSurcharges,
    )
    deliveryDistanceKm.value = roundedDistance
    calculatedDeliveryFee.value = fee

    if (fee === null) {
      deliveryStatus.value = 'outside-area'
      deliveryMessage.value = 'Esse endereço está um pouco mais distante. Envie o pedido para verificarmos a entrega.'
      trackDetailsProgress('delivery_calculated')
      return
    }

    deliveryStatus.value = 'available'
    deliveryMessage.value = `Entrega estimada para sua região • ${getEstimatedDeliveryTime(roundedDistance)}`
    trackDetailsProgress('delivery_calculated')
  } catch {
    resetDeliveryCalculation('error', 'Não foi possível calcular a entrega agora. Confira o endereço ou tente novamente.')
  }
}

watch([deliveryMode, cep, address, number, neighborhood, city, state, isDeliveryCalculationEnabled], () => {
  window.clearTimeout(deliveryDebounce)

  if (deliveryMode.value !== 'entrega' || !isDeliveryCalculationEnabled.value) {
    resetDeliveryCalculation('idle')
    return
  }

  if (!deliveryAddressComplete.value) {
    if (deliveryStatus.value !== 'address-found' && deliveryStatus.value !== 'address-not-found') resetDeliveryCalculation('idle')
    return
  }

  deliveryDebounce = window.setTimeout(() => {
    calculateDeliveryFee()
  }, 550)
})


watch(deliveryMode, () => {
  trackDetailsProgress('delivery_mode_selected')
})

watch(cep, () => {
  if (deliveryMode.value === 'entrega' && normalizeCep(cep.value).length > 0) trackDetailsProgress('cep_started')
})

watch(number, () => {
  if (deliveryMode.value === 'entrega' && number.value.trim()) trackDetailsProgress('number_filled')
})

watch(customerName, () => {
  if (customerName.value.trim().length >= 2) trackDetailsProgress('name_filled')
})

watch(customerPhone, () => {
  if (normalizedCustomerPhone.value.length >= 10) trackDetailsProgress('phone_filled')
})

watch([desiredDate, scheduledTimeOptions], () => {
  if (orderMode.value !== 'scheduled') return
  if (!scheduledTimeOptions.value.includes(desiredTimeSlot.value)) {
    desiredTimeSlot.value = scheduledTimeOptions.value[0] ?? ''
  }
})

watch(cartItems, () => {
  scheduleCartTracking()
}, { deep: true })

watch(checkoutFunnelRange, () => {
  if (adminMode.value && adminLoggedIn.value) void loadCheckoutFunnel()
})

const deliveryDetails = computed(() => {
  if (deliveryMode.value === 'retirada') return `Local de retirada: ${pickupLocation.value}`

  const details = [
    cep.value && `CEP: ${formatCep(cep.value)}`,
    address.value && `Endereço: ${address.value}`,
    number.value && `Número: ${number.value}`,
    neighborhood.value && `Bairro: ${neighborhood.value}`,
    (city.value || state.value) && `Cidade/UF: ${city.value} - ${state.value}`,
    complement.value && `Complemento: ${complement.value}`,
    reference.value && `Referência: ${reference.value}`,
  ].filter(Boolean)

  return details.length ? details.join('\n') : 'Endereço a combinar.'
})

async function handleSubmit() {
  triedSubmit.value = true
  submitError.value = ''
  if (!areCustomerDetailsValid.value || submitLoading.value) return

  const clientRequestId = crypto.randomUUID()
  submitLoading.value = true

  try {
    const result = await createOrder({
      client_request_id: clientRequestId,
      checkout_session_id: getOrCreateCheckoutSessionId(),
      customer_name: customerName.value.trim(),
      customer_phone: normalizedCustomerPhone.value,
      order_type: orderMode.value === 'scheduled' ? 'scheduled' : 'ready_delivery',
      fulfillment_type: deliveryMode.value === 'entrega' ? 'delivery' : 'pickup',
      requested_date: effectiveDesiredDate.value,
      requested_time: orderMode.value === 'scheduled' ? desiredTimeSlot.value : null,
      customer_notes: notes.value.trim(),
      delivery: deliveryMode.value === 'entrega' ? {
        postal_code: formatCep(cep.value),
        street: address.value.trim(),
        number: number.value.trim(),
        complement: complement.value.trim(),
        neighborhood: neighborhood.value.trim(),
        city: city.value.trim(),
        state: state.value.trim(),
        reference: reference.value.trim(),
        latitude: null,
        longitude: null,
        distance_km: deliveryDistanceKm.value,
      } : null,
      items: cartItems.value.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        promotion_applied: Boolean(item.promotionLabel),
      })),
    })

    createdOrderItems.value = cartItems.value.map((item) => ({ ...item }))
    currentCreatedOrder.value = result
    cartItems.value = []
    currentPage.value = 'success'
    void nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : 'Não foi possível enviar o pedido agora.'
  } finally {
    submitLoading.value = false
  }
}

function scrollToElement(target: HTMLElement | null) {
  window.setTimeout(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 120)
}

function openStartPage() {
  currentCreatedOrder.value = null
  createdOrderItems.value = []
  currentPage.value = 'start'
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
}

function goHomeFromSuccess() {
  currentPage.value = 'start'
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
}

function startAnotherOrder() {
  cartItems.value = []
  customerName.value = ''
  customerPhone.value = ''
  desiredDate.value = ''
  desiredTimeSlot.value = ''
  deliveryMode.value = 'retirada'
  cep.value = ''
  neighborhood.value = ''
  address.value = ''
  number.value = ''
  city.value = 'Goiânia'
  state.value = 'GO'
  complement.value = ''
  reference.value = ''
  notes.value = ''
  triedSubmit.value = false
  submitError.value = ''
  orderMode.value = null
  currentCreatedOrder.value = null
  createdOrderItems.value = []
  resetCheckoutSession()
  resetDeliveryCalculation('idle')
  currentPage.value = 'start'
  window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 40)
}

function openOrderPage(target?: HTMLElement | null) {
  currentPage.value = 'order'
  window.setTimeout(() => {
    if (target) {
      scrollToElement(target)
      return
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
}

function openDetailsPage() {
  if (!itemAdded.value) return
  void trackDetailsStarted(buildCheckoutTrackingPayload(false))
  currentPage.value = 'details'
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
}

function openCheckoutPage() {
  if (!itemAdded.value) return
  void trackCheckoutViewed(buildCheckoutTrackingPayload(true))
  currentPage.value = 'checkout'
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
}

function goToPromotionOrder() {
  orderMode.value = 'ready'
  desiredDate.value = todayIso.value
  openOrderPage(sizeSection.value)
}

function selectPromotionSize(nextSize: Size) {
  orderMode.value = 'ready'
  desiredDate.value = todayIso.value
  size.value = nextSize
  quantity.value = nextSize === '180ml' ? promotion.value.products.normal_tradicional_180ml.minimumDeliveryQuantity : promotion.value.products.normal_tradicional_500ml.minimumDeliveryQuantity
  openOrderPage(flavorSection.value)
}

function selectOrderMode(nextMode: OrderMode) {
  if (nextMode === 'ready' && !isReadyDeliveryOpenNow.value) return
  if (nextMode === 'scheduled' && !appConfig.value.availability.scheduledOrders) return
  orderMode.value = nextMode
  if (nextMode === 'ready') {
    desiredDate.value = todayIso.value
    desiredTimeSlot.value = ''
  } else if (!desiredDate.value) {
    desiredDate.value = todayIso.value
  }
  openOrderPage(sizeSection.value)
}

function selectSize(nextSize: Size) {
  size.value = nextSize
  scrollToElement(flavorSection.value)
}

function selectFlavor(nextFlavor: Flavor) {
  flavor.value = nextFlavor
  scrollToElement(typeSection.value)
}

function selectType(nextType: PuddingType) {
  puddingType.value = nextType
}

function addToCart() {
  triedSubmit.value = true
  if (selectedProductAvailabilityError.value || selectedPromotionalMinimumError.value) return

  const nextProductKey = getProductKey(puddingType.value, flavor.value, size.value)
  const nextProductId = productIdByKey.value[nextProductKey]
  if (!nextProductId) {
    selectedProductAvailabilityError.value || (submitError.value = 'Não foi possível identificar esse produto. Atualize a página e tente novamente.')
    return
  }

  cartItems.value.push({
    id: Date.now(),
    productId: nextProductId,
    productKey: nextProductKey,
    flavor: flavor.value,
    puddingType: puddingType.value,
    size: size.value,
    quantity: quantity.value,
    unitPrice: unitPrice.value,
    total: selectedItemTotal.value,
    image: selectedSizeImage.value,
    originalUnitPrice: selectedOriginalPrice.value,
    promotionLabel: selectedPromotionLabel.value,
  })
  triedSubmit.value = false
  quantity.value = 1
  openDetailsPage()
}

function addFreeShippingSuggestionToCart() {
  const suggestedType: PuddingType = 'normal'
  const suggestedFlavor: Flavor = 'tradicional'
  const suggestedSize: Size = '180ml'
  const suggestedQuantity = freeShippingSuggestionQuantity.value
  if (suggestedQuantity <= 0) return
  if (!isProductAvailable(suggestedType, suggestedFlavor, suggestedSize)) return

  const suggestedUnitPrice = getEffectivePrice(suggestedType, suggestedFlavor, suggestedSize)
  const suggestedPromotion = getPromotionalProduct(suggestedType, suggestedFlavor, suggestedSize)

  const suggestedProductKey = getProductKey(suggestedType, suggestedFlavor, suggestedSize)
  const suggestedProductId = productIdByKey.value[suggestedProductKey]
  if (!suggestedProductId) return

  cartItems.value.push({
    id: Date.now(),
    productId: suggestedProductId,
    productKey: suggestedProductKey,
    flavor: suggestedFlavor,
    puddingType: suggestedType,
    size: suggestedSize,
    quantity: suggestedQuantity,
    unitPrice: suggestedUnitPrice,
    total: suggestedUnitPrice * suggestedQuantity,
    image: getProductImage(suggestedSize),
    originalUnitPrice: suggestedPromotion?.originalPrice,
    promotionLabel: suggestedPromotion ? 'Promoção pronta entrega' : undefined,
  })
}

function removeCartItem(itemId: number) {
  cartItems.value = cartItems.value.filter((item) => item.id !== itemId)
  if (!cartItems.value.length) {
    openOrderPage(sizeSection.value)
  }
}

function confirmDetails() {
  triedSubmit.value = true
  if (!areCustomerDetailsValid.value) return
  void trackDetailsStarted(buildCheckoutTrackingPayload(true, 'details_completed'))
  openCheckoutPage()
}



function buildCheckoutTrackingPayload(includeCustomer = false, lastCompletedField: CheckoutLastCompletedField | null = null) {
  return {
    items_quantity: cartQuantity.value,
    cart_subtotal: subtotal.value,
    order_mode: orderMode.value,
    fulfillment_type: deliveryMode.value === 'entrega' ? 'delivery' : deliveryMode.value === 'retirada' ? 'pickup' : null,
    customer_name: includeCustomer ? customerName.value.trim() || null : null,
    customer_phone: includeCustomer ? normalizedCustomerPhone.value || null : null,
    last_completed_field: lastCompletedField,
    cart_items: cartItems.value.map((item) => ({
      product_id: item.productId,
      product_key: item.productKey,
      quantity: item.quantity,
      promotion_applied: Boolean(item.promotionLabel),
    })),
  }
}


function trackDetailsProgress(lastCompletedField: CheckoutLastCompletedField) {
  if (currentPage.value !== 'details' || !cartItems.value.length) return
  window.clearTimeout(detailsProgressDebounce)
  detailsProgressDebounce = window.setTimeout(() => {
    void trackDetailsStarted(buildCheckoutTrackingPayload(true, lastCompletedField))
  }, 350)
}

function openOptionalAddressFields() {
  optionalAddressOpen.value = !optionalAddressOpen.value
  if (optionalAddressOpen.value) trackDetailsProgress('optional_section_opened')
}

function enableManualAddressMode() {
  manualAddressMode.value = true
  city.value = 'Goiânia'
  state.value = 'GO'
}

function scheduleCartTracking() {
  window.clearTimeout(checkoutTrackingDebounce)
  if (!cartItems.value.length) return
  checkoutTrackingDebounce = window.setTimeout(() => {
    void trackCartStarted(buildCheckoutTrackingPayload(false))
  }, 450)
}

function loadSavedOrders(options: { persistInitialOrders?: boolean } = { persistInitialOrders: true }) {
  try {
    const stored = window.localStorage.getItem(ordersStorageKey)
    const storedOrders = stored ? JSON.parse(stored) as SavedOrder[] : []
    const storedIds = new Set(storedOrders.map((order) => order.id))
    savedOrders.value = [
      ...storedOrders,
      ...initialSavedOrders.filter((order) => !storedIds.has(order.id)),
    ]
    if (options.persistInitialOrders) persistSavedOrders()
  } catch {
    savedOrders.value = [...initialSavedOrders]
    if (options.persistInitialOrders) persistSavedOrders()
  }
}

function persistSavedOrders() {
  window.localStorage.setItem(ordersStorageKey, JSON.stringify(savedOrders.value))
}

function clearSavedOrders() {
  savedOrders.value = []
  persistSavedOrders()
  adminError.value = 'Pedidos apagados.'
}


function addDeliveryRange() {
  const lastRange = appConfig.value.deliveryPricing.ranges[appConfig.value.deliveryPricing.ranges.length - 1]
  appConfig.value.deliveryPricing.ranges.push({
    maxDistance: (lastRange?.maxDistance ?? 0) + 3,
    price: lastRange?.price ?? 0,
  })
}

function removeDeliveryRange(index: number) {
  appConfig.value.deliveryPricing.ranges.splice(index, 1)
}

function addDeliveryTimeSurcharge() {
  appConfig.value.deliveryPricing.timeSurcharges.push({
    label: 'Novo horário',
    active: true,
    start: '18:00',
    end: '21:00',
    extraPrice: 0,
  })
}

async function loadProductsFromSupabase() {
  productsLoading.value = true
  productsLoadError.value = ''

  try {
    const products = await fetchProducts()
    if (!products.length) throw new Error('Nenhum produto retornado pelo Supabase.')

    productIdByKey.value = products.reduce<Partial<Record<ProductKey, string>>>((acc, product) => {
      const key = product.product_key.replace('zero_lactose', 'zero') as ProductKey
      acc[key] = String(product.id)
      return acc
    }, {})
    appConfig.value = applyProductsToConfig(products, appConfig.value)
    console.info(`[Peraí, tem pudim!] ${products.length} produtos carregados do Supabase.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao carregar produtos do Supabase.'
    productsLoadError.value = message
    console.error('[Peraí, tem pudim!] Usando produtos locais como fallback.', error)
  } finally {
    productsLoading.value = false
  }
}

function stopAdminOrdersRealtime() {
  adminOrdersChannel?.unsubscribe()
  adminOrdersChannel = null
}

function startAdminOrdersRealtime() {
  if (!adminLoggedIn.value) return

  try {
    stopAdminOrdersRealtime()
    const channel = supabase.channel(`admin-orders-${Date.now()}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      void loadAdminOrders()
    })
    adminOrdersChannel = channel
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        adminOrdersChannel = null
      }
    })
  } catch (error) {
    adminOrdersChannel = null
    console.warn('[Peraí, tem pudim!] Realtime de pedidos indisponível. Use Atualizar para recarregar.', error)
  }
}

async function loadAdminOrders() {
  if (!adminLoggedIn.value) return
  adminOrdersLoading.value = true
  adminOrdersError.value = ''
  try {
    adminOrders.value = await fetchAdminOrders()
  } catch (error) {
    adminOrdersError.value = error instanceof Error ? error.message : 'Não foi possível carregar os pedidos.'
  } finally {
    adminOrdersLoading.value = false
  }
}

async function loadCheckoutFunnel() {
  if (!adminLoggedIn.value) return
  checkoutFunnelLoading.value = true
  checkoutFunnelError.value = ''
  try {
    const [summary, abandoned, sessions] = await Promise.all([
      fetchCheckoutFunnelSummary(checkoutFunnelRange.value),
      fetchRecentAbandonedCheckoutSessions(checkoutFunnelRange.value),
      fetchCheckoutSessions(checkoutFunnelRange.value),
    ])
    checkoutFunnelSummary.value = summary
    abandonedCheckoutSessions.value = abandoned
    checkoutSessions.value = sessions
  } catch (error) {
    checkoutFunnelError.value = error instanceof Error ? error.message : 'Não foi possível carregar o funil.'
  } finally {
    checkoutFunnelLoading.value = false
  }
}

async function changeAdminOrderStatus(orderId: string, status: AdminOrderStatus) {
  try {
    await updateOrderStatus(orderId, status)
    await loadAdminOrders()
    adminError.value = 'Status do pedido atualizado.'
  } catch (error) {
    adminError.value = error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.'
  }
}

async function removeAdminOrder(orderId: string) {
  try {
    await deleteOrder(orderId)
    adminOrders.value = adminOrders.value.filter((order) => order.id !== orderId)
    adminError.value = 'Pedido removido.'
  } catch (error) {
    adminError.value = error instanceof Error ? error.message : 'Não foi possível remover o pedido.'
  }
}

function removeDeliveryTimeSurcharge(index: number) {
  appConfig.value.deliveryPricing.timeSurcharges.splice(index, 1)
}

function removeSavedOrder(orderId: string) {
  savedOrders.value = savedOrders.value.filter((order) => order.id !== orderId)
  persistSavedOrders()
  adminError.value = `Pedido #${orderId} removido.`
}

async function saveAdminConfig() {
  adminSaving.value = true
  adminError.value = 'Salvando configurações...'

  try {
    const savedProductsCount = await saveProductsToSupabase(appConfig.value)
    window.localStorage.setItem(appConfigStorageKey, JSON.stringify(appConfig.value))
    adminError.value = `Configurações salvas. ${savedProductsCount} produtos atualizados no Supabase.`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao salvar no Supabase.'
    window.localStorage.setItem(appConfigStorageKey, JSON.stringify(appConfig.value))
    adminError.value = `${message} As alterações foram salvas apenas neste navegador. Nenhum UPDATE anônimo foi enviado.`
    console.error('[Peraí, tem pudim!] Salvamento no Supabase não realizado.', error)
  } finally {
    adminSaving.value = false
  }
}

function resetAdminConfig() {
  appConfig.value = cloneConfig()
  window.localStorage.removeItem(appConfigStorageKey)
  adminError.value = 'Configurações restauradas.'
}

async function verifyAdminSession(session: Session | null) {
  adminAuthLoading.value = true
  adminAuthError.value = ''

  try {
    if (!session) {
      adminSession.value = null
      isAdmin.value = false
      adminLoggedIn.value = false
      return false
    }

    const { data, error } = await supabase.rpc('is_admin')
    if (error) throw new Error(error.message)

    if (!data) {
      await supabase.auth.signOut()
      adminSession.value = null
      isAdmin.value = false
      adminLoggedIn.value = false
      adminAuthError.value = 'Você não possui acesso administrativo.'
      return false
    }

    adminSession.value = session
    isAdmin.value = true
    adminLoggedIn.value = true
    adminEmail.value = session.user.email ?? adminEmail.value
    adminAuthError.value = ''
    adminError.value = ''
    void loadAdminOrders()
    void loadCheckoutFunnel()
    startAdminOrdersRealtime()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao verificar acesso administrativo.'
    adminSession.value = null
    isAdmin.value = false
    adminLoggedIn.value = false
    adminAuthError.value = message
    return false
  } finally {
    adminAuthLoading.value = false
  }
}

async function requestPasswordReset() {
  adminAuthError.value = ''
  adminAuthMessage.value = ''

  const email = adminEmail.value.trim()

  if (!email) {
    adminAuthError.value = 'Informe seu e-mail.'
    return
  }

  adminAuthLoading.value = true

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?admin=true&reset-password=true`,
    })

    if (error) throw error

    adminAuthMessage.value = 'Enviamos um link de recuperação para seu e-mail.'
  } catch (error) {
    adminAuthError.value = error instanceof Error ? error.message : 'Não foi possível enviar o link de recuperação.'
  } finally {
    adminAuthLoading.value = false
  }
}

async function updateRecoveredPassword() {
  adminAuthError.value = ''
  adminAuthMessage.value = ''

  if (newPassword.value.length < 8) {
    adminAuthError.value = 'A nova senha precisa ter pelo menos 8 caracteres.'
    return
  }

  if (newPassword.value !== confirmNewPassword.value) {
    adminAuthError.value = 'As senhas não conferem.'
    return
  }

  adminAuthLoading.value = true

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword.value,
    })

    if (error) throw error

    adminAuthMessage.value = 'Senha alterada com sucesso.'
    await supabase.auth.signOut()
    newPassword.value = ''
    confirmNewPassword.value = ''
    isPasswordRecovery.value = false
    adminLoggedIn.value = false
    isAdmin.value = false
    adminSession.value = null
    window.history.replaceState({}, '', `${window.location.pathname}?admin=true`)
  } catch (error) {
    adminAuthError.value = error instanceof Error ? error.message : 'Não foi possível alterar a senha.'
  } finally {
    adminAuthLoading.value = false
  }
}

async function loginAdmin() {
  adminAuthLoading.value = true
  adminAuthError.value = ''
  adminAuthMessage.value = ''
  adminError.value = ''

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail.value.trim(),
      password: adminPassword.value,
    })

    if (error) throw new Error(error.message)
    const allowed = await verifyAdminSession(data.session)
    if (allowed) adminPassword.value = ''
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível entrar no painel.'
    adminAuthError.value = message
    adminLoggedIn.value = false
    isAdmin.value = false
  } finally {
    adminAuthLoading.value = false
  }
}

async function logoutAdmin() {
  stopAdminOrdersRealtime()
  await supabase.auth.signOut()
  adminLoggedIn.value = false
  isAdmin.value = false
  adminSession.value = null
  adminPassword.value = ''
  isPasswordRecovery.value = false
}


onMounted(async () => {
  appConfig.value = loadStoredConfig()
  await loadProductsFromSupabase()
  loadSavedOrders()
  const initialParams = new URLSearchParams(window.location.search)
  adminMode.value = initialParams.get('admin') === 'true'
  isPasswordRecovery.value = initialParams.get('reset-password') === 'true'
  if (adminMode.value && !isPasswordRecovery.value) {
    adminAuthLoading.value = true
    const { data } = await supabase.auth.getSession()
    await verifyAdminSession(data.session)
  }

  window.addEventListener('storage', (event) => {
    if (event.key === ordersStorageKey) loadSavedOrders({ persistInitialOrders: false })
  })
  window.addEventListener('focus', () => {
    if (adminMode.value && adminLoggedIn.value) { void loadAdminOrders(); void loadCheckoutFunnel() }
  })
  document.addEventListener('visibilitychange', () => {
    if (adminMode.value && adminLoggedIn.value && !document.hidden) { void loadAdminOrders(); void loadCheckoutFunnel() }
  })
  authSubscription = supabase.auth.onAuthStateChange((event, session) => {
    if (!adminMode.value) return
    if (event === 'PASSWORD_RECOVERY') {
      isPasswordRecovery.value = true
      adminLoggedIn.value = false
      adminAuthError.value = ''
      adminAuthMessage.value = ''
      adminSession.value = session
      return
    }
    if (isPasswordRecovery.value) return
    void verifyAdminSession(session)
  }).data.subscription
  promoQueryEnabled.value = new URLSearchParams(window.location.search).get('promo') === 'true'
  shouldHighlightPromotion.value = promoQueryEnabled.value

  const phraseTimer = window.setInterval(() => {
    loadingPhraseIndex.value = (loadingPhraseIndex.value + 1) % loadingPhrases.length
  }, 760)

  window.setTimeout(() => {
    isLoading.value = false
    window.clearInterval(phraseTimer)
    openStartPage()
    if (shouldHighlightPromotion.value && promotion.value.active) {
      void nextTick(() => {
        window.setTimeout(() => scrollToElement(promotionSection.value), 90)
      })
    }
  }, 2600)
})

onUnmounted(() => {
  authSubscription?.unsubscribe()
  stopAdminOrdersRealtime()
})
</script>

<template>
  <Transition name="splash">
    <div v-if="isLoading" class="splash-screen" role="status" aria-live="polite">
      <img :src="logoImage" alt="Peraí, tem pudim!" />
      <Transition name="phrase" mode="out-in">
        <p :key="loadingPhraseIndex">{{ loadingPhrases[loadingPhraseIndex] }}</p>
      </Transition>
      <span class="splash-screen__loader" aria-hidden="true"></span>
    </div>
  </Transition>


  <main v-if="adminMode" class="admin-shell">
    <section v-if="adminAuthLoading && !adminLoggedIn && !isPasswordRecovery" class="admin-login-page">
      <section class="admin-login-form" aria-label="Verificando acesso">
        <img :src="logoImage" alt="Peraí, tem pudim!" />
        <div class="admin-heading">
          <h1>Verificando acesso</h1>
          <p>Aguarde um instante enquanto confirmamos sua sessão.</p>
        </div>
      </section>
    </section>

    <section v-else-if="isPasswordRecovery" class="admin-login-page">
      <aside class="admin-login-hero">
        <img class="admin-login-hero__brand" :src="logoImage" alt="Peraí, tem pudim!" />
        <img class="admin-login-hero__photo" :src="pudding500Image" alt="Pudim artesanal" />
        <div>
          <strong>Crie uma nova senha</strong>
          <small>Depois de alterar, entre novamente no painel administrativo.</small>
        </div>
      </aside>

      <section class="admin-login-form" aria-label="Recuperação de senha do admin">
        <img :src="logoImage" alt="Peraí, tem pudim!" />
        <div class="admin-heading">
          <h1>Nova senha</h1>
          <p>Informe uma nova senha com pelo menos 8 caracteres.</p>
        </div>
        <label class="field admin-login-field">
          <span>Nova senha</span>
          <input v-model="newPassword" type="password" autocomplete="new-password" placeholder="Digite a nova senha" />
        </label>
        <label class="field admin-login-field">
          <span>Confirmar nova senha</span>
          <input v-model="confirmNewPassword" type="password" autocomplete="new-password" placeholder="Repita a nova senha" @keydown.enter="updateRecoveredPassword" />
        </label>
        <p v-if="adminAuthError" class="error-text">{{ adminAuthError }}</p>
        <p v-if="adminAuthMessage" class="admin-auth-message">{{ adminAuthMessage }}</p>
        <button class="admin-primary-button" type="button" :disabled="adminAuthLoading" @click="updateRecoveredPassword">{{ adminAuthLoading ? 'Alterando...' : 'Alterar senha' }}</button>
      </section>
    </section>

    <section v-else-if="!adminLoggedIn" class="admin-login-page">
      <aside class="admin-login-hero">
        <img class="admin-login-hero__brand" :src="logoImage" alt="Peraí, tem pudim!" />
        <img class="admin-login-hero__photo" :src="pudding500Image" alt="Pudim artesanal" />
        <div>
          <strong>Pedidos artesanais, gestão simples.</strong>
          <small>Controle produtos, horários e pedidos do Peraí, tem pudim! em um só lugar.</small>
        </div>
      </aside>

      <section class="admin-login-form" aria-label="Login do admin">
        <img :src="logoImage" alt="Peraí, tem pudim!" />
        <div class="admin-heading">
          <h1>Bem-vinda de volta</h1>
          <p>Acesse o painel para gerenciar pedidos, horários e produtos.</p>
        </div>
        <label class="field admin-login-field">
          <span>E-mail</span>
          <input v-model="adminEmail" type="email" autocomplete="username" placeholder="voce@email.com" />
        </label>
        <label class="field admin-login-field admin-password-field">
          <span>Senha</span>
          <input
            v-model="adminPassword"
            :type="showAdminPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="Digite sua senha"
            @keydown.enter="loginAdmin"
          />
          <button type="button" :aria-label="showAdminPassword ? 'Ocultar senha' : 'Mostrar senha'" @click="showAdminPassword = !showAdminPassword">
            <svg v-if="!showAdminPassword" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M7.1 7.5C4.2 9.1 2.5 12 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.5 4.4-1.2"/><path d="M10 6.2c.6-.1 1.3-.2 2-.2 6 0 9.5 6 9.5 6s-.9 1.6-2.6 3.1"/></svg>
          </button>
        </label>
        <button class="admin-forgot-password" type="button" :disabled="adminAuthLoading" @click="requestPasswordReset">Esqueci minha senha</button>
        <p v-if="adminAuthError || adminError" class="error-text">{{ adminAuthError || adminError }}</p>
        <p v-if="adminAuthMessage" class="admin-auth-message">{{ adminAuthMessage }}</p>
        <button class="admin-primary-button" type="button" :disabled="adminAuthLoading" @click="loginAdmin">{{ adminAuthLoading ? 'Entrando...' : 'Entrar' }}</button>
      </section>
    </section>

    <section v-else class="admin-dashboard-shell">
      <aside class="admin-sidebar">
        <div class="admin-sidebar__brand">
          <img :src="logoImage" alt="Peraí, tem pudim!" />
          <span>Painel Admin</span>
        </div>
        <nav class="admin-sidebar__nav" aria-label="Menu do admin">
          <button type="button" :class="{ active: adminPage === 'dashboard' }" @click="adminPage = 'dashboard'">
            <span class="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 14.5 16 6l10 8.5V26a2 2 0 0 1-2 2h-5v-8h-6v8H8a2 2 0 0 1-2-2V14.5Z"/><path d="M11 28h10"/></svg></span> Dashboard
          </button>
          <button type="button" :class="{ active: adminPage === 'settings' }" @click="adminPage = 'settings'">
            <span class="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/><path d="M16 4v4M16 24v4M6.2 10.3l3.4 2M22.4 19.7l3.4 2M6.2 21.7l3.4-2M22.4 12.3l3.4-2"/></svg></span> Configurações
          </button>
          <button type="button" :class="{ active: adminPage === 'orders' }" @click="adminPage = 'orders'">
            <span class="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M9 6h14a2 2 0 0 1 2 2v18l-3-2-3 2-3-2-3 2-3-2-3 2V8a2 2 0 0 1 2-2Z"/><path d="M12 12h8M12 17h8M12 22h5"/></svg></span> Pedidos
          </button>
          <button type="button" :class="{ active: adminPage === 'funnel' }" @click="adminPage = 'funnel'; loadCheckoutFunnel()">
            <span class="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 8h20M10 16h12M14 24h4"/><path d="M8 8l7 8v7l2 1 2-1v-7l7-8"/></svg></span> Funil
          </button>
          <button type="button" :class="{ active: adminPage === 'delivery' }" @click="adminPage = 'delivery'">
            <span class="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 23a4 4 0 1 0 8 0M22 23a4 4 0 1 0 8 0"/><path d="M11 23h6l4-8h4l3 8"/><path d="M17 23l-3-7H9"/><path d="M21 15l-2-4h-4"/><path d="M23 11h4"/><path d="M8 19h4"/></svg></span> Entrega
          </button>
        </nav>
        <div class="admin-sidebar__footer">
          <small>Logada como</small>
          <strong>{{ adminSession?.user.email || 'admin' }}</strong>
          <button class="admin-ghost-button" type="button" @click="logoutAdmin">Sair</button>
        </div>
      </aside>

      <div class="admin-main">
        <header class="admin-main-header">
          <label class="admin-search">
            <span>⌕</span>
            <input v-model="adminSearch" type="search" placeholder="Buscar produto, tamanho, sabor..." />
            <button v-if="adminSearch" type="button" aria-label="Limpar busca" @click="adminSearch = ''">×</button>
          </label>
        </header>

        <div class="admin-content-scroll">
        <div class="admin-title-row">
          <div class="admin-heading">
            <h1>{{ adminTitle }}</h1>
            <p>{{ adminSubtitle }}</p>
          </div>
          <div v-if="adminPage !== 'orders' && adminPage !== 'funnel'" class="admin-save-row">
            <button class="admin-ghost-button" type="button" @click="resetAdminConfig">Restaurar</button>
            <button class="admin-primary-button" type="button" :disabled="adminSaving" @click="saveAdminConfig">{{ adminSaving ? 'Salvando...' : 'Salvar alterações' }}</button>
          </div>
        </div>

        <p v-if="adminError" class="admin-feedback">{{ adminError }}</p>

        <template v-if="adminPage === 'dashboard'">
          <section class="admin-metrics-grid">
            <article class="admin-metric-card">
              <span>▣</span>
              <div><strong>{{ adminOrdersTotal }}</strong><small>Pedidos totais</small></div>
            </article>
            <article class="admin-metric-card">
              <span>◷</span>
              <div><strong>{{ adminOrdersToday }}</strong><small>Pedidos hoje</small></div>
            </article>
            <article class="admin-metric-card">
              <span>!</span>
              <div><strong>{{ adminPendingOrders }}</strong><small>Novos pedidos</small></div>
            </article>
            <article class="admin-metric-card">
              <span>R$</span>
              <div><strong>{{ formatCurrency(adminCompletedRevenue) }}</strong><small>Faturamento finalizado</small></div>
            </article>
          </section>

          <section class="admin-card-panel admin-funnel-panel">
            <div class="admin-card-panel__header">
              <div><h2>Funil de checkout</h2><p>Carrinhos iniciados, checkout e abandono calculado por inatividade de 2 horas.</p></div>
              <div class="admin-funnel-tabs" role="group" aria-label="Período do funil">
                <button type="button" :class="{ active: checkoutFunnelRange === 'today' }" @click="checkoutFunnelRange = 'today'">Hoje</button>
                <button type="button" :class="{ active: checkoutFunnelRange === '7d' }" @click="checkoutFunnelRange = '7d'">7 dias</button>
                <button type="button" :class="{ active: checkoutFunnelRange === '30d' }" @click="checkoutFunnelRange = '30d'">30 dias</button>
                <button type="button" :disabled="checkoutFunnelLoading" @click="loadCheckoutFunnel">{{ checkoutFunnelLoading ? 'Atualizando...' : 'Atualizar' }}</button>
              </div>
            </div>
            <p v-if="checkoutFunnelError" class="error-text">{{ checkoutFunnelError }}</p>
            <div class="admin-funnel-grid" :class="{ loading: checkoutFunnelLoading }">
              <article><span>🛒</span><strong>{{ checkoutFunnelSummary?.sessionsStarted ?? 0 }}</strong><small>Carrinhos iniciados</small></article>
              <article><span>▣</span><strong>{{ checkoutFunnelSummary?.checkoutViewed ?? 0 }}</strong><small>Chegaram ao checkout</small></article>
              <article><span>✓</span><strong>{{ checkoutFunnelSummary?.completed ?? 0 }}</strong><small>Pedidos concluídos</small></article>
              <article><span>!</span><strong>{{ checkoutFunnelSummary?.abandoned ?? 0 }}</strong><small>Carrinhos abandonados</small></article>
              <article><span>%</span><strong>{{ checkoutFunnelSummary?.cartToOrderConversionRate ?? 0 }}%</strong><small>Conversão do carrinho</small></article>
              <article><span>R$</span><strong>{{ formatCurrency(checkoutFunnelSummary?.estimatedAbandonedCartValue ?? 0) }}</strong><small>Valor estimado abandonado</small></article>
            </div>
            <div v-if="abandonedCheckoutSessions.length" class="admin-abandoned-list">
              <h3>Carrinhos abandonados recentes</h3>
              <article v-for="session in abandonedCheckoutSessions" :key="session.sessionId">
                <div><strong>{{ getCheckoutStepLabel(session.currentStep) }}</strong><small>{{ new Date(session.lastActivityAt).toLocaleString('pt-BR') }}</small></div>
                <span>{{ session.itemsQuantity }} item(ns)</span>
                <b>{{ formatCurrency(session.cartSubtotal) }}</b>
                <small v-if="session.customerName || session.customerPhone">{{ session.customerName || 'Sem nome' }}<template v-if="session.customerPhone"> • {{ formatBrazilianPhone(session.customerPhone) }}</template></small>
              </article>
            </div>
          </section>

          <section class="admin-dashboard-grid">
            <article class="admin-chart-card admin-card-panel">
              <div class="admin-card-panel__header">
                <div><h2>Resumo da operação</h2><p>Status atual configurado para o pedido.</p></div>
              </div>
              <div class="admin-status-list">
                <div><span>Pronta entrega</span><strong>{{ appConfig.availability.readyDelivery ? 'Ativa' : 'Inativa' }}</strong></div>
                <div><span>Encomendas</span><strong>{{ appConfig.availability.scheduledOrders ? 'Ativas' : 'Inativas' }}</strong></div>
                <div><span>Promoção</span><strong>{{ appConfig.promotion.active ? 'Ativa' : 'Inativa' }}</strong></div>
                <div><span>Dias fechados</span><strong>{{ adminClosedDays }}</strong></div>
              </div>
            </article>

            <article class="admin-card-panel">
              <div class="admin-card-panel__header">
                <div><h2>Horários da semana</h2><p>Visão rápida dos dias de atendimento.</p></div>
              </div>
              <div class="admin-mini-hours">
                <div v-for="day in appConfig.availability.weeklyHours" :key="day.day" :class="{ closed: !day.open }">
                  <span>{{ day.day.slice(0, 3) }}</span>
                  <strong>{{ day.open ? day.hours : 'Fechado' }}</strong>
                </div>
              </div>
            </article>
          </section>

          <section class="admin-card-panel">
            <div class="admin-card-panel__header">
              <div><h2>Produtos em destaque</h2><p>Alguns itens disponíveis no cardápio.</p></div>
              <button class="admin-ghost-button" type="button" @click="adminPage = 'settings'; adminSettingsTab = 'products'">Gerenciar produtos</button>
            </div>
            <div class="admin-dashboard-products">
              <article v-for="product in adminProductCards.slice(0, 6)" :key="product.key" class="admin-dashboard-product">
                <img :src="product.image" alt="" />
                <div><strong>{{ product.name }}</strong><small>{{ product.details }} • {{ formatCurrency(appConfig.prices[product.type][product.flavor][product.size]) }}</small></div>
                <span :class="{ off: !appConfig.productAvailability[product.key] }">{{ appConfig.productAvailability[product.key] ? getProductOrderModeLabel(product.key) : 'Off' }}</span>
              </article>
            </div>
          </section>

        </template>

        <template v-else-if="adminPage === 'orders'">
          <section class="admin-card-panel admin-section admin-orders-panel">
            <div class="admin-card-panel__header">
              <div>
                <h2>Pedidos recebidos</h2>
                <p>Lista dos pedidos recebidos pelo app.</p>
              </div>
              <button class="admin-ghost-button" type="button" :disabled="adminOrdersLoading" @click="loadAdminOrders">Atualizar</button>
            </div>

            <div class="admin-order-stats">
              <article>
                <span>▣</span>
                <div><strong>{{ adminOrdersTotal }}</strong><small>Total de pedidos</small></div>
              </article>
              <article>
                <span>◷</span>
                <div><strong>{{ adminOrdersToday }}</strong><small>Pedidos hoje</small></div>
              </article>
              <article>
                <span>R$</span>
                <div><strong>{{ formatCurrency(adminOrders.reduce((sum, order) => sum + order.total, 0)) }}</strong><small>Total registrado</small></div>
              </article>
            </div>

            <div v-if="adminOrdersByDay.length" class="admin-orders-by-day">
              <span v-for="group in adminOrdersByDay" :key="group.day">{{ group.day }} • {{ group.count }} pedido(s)</span>
            </div>

            <p v-if="adminOrdersError" class="error-text">{{ adminOrdersError }}</p>
            <div v-if="adminOrdersLoading" class="admin-empty-orders">
              <strong>Carregando pedidos...</strong>
            </div>

            <div v-else-if="!adminOrders.length" class="admin-empty-orders">
              <strong>Nenhum pedido recebido ainda.</strong>
              <span>Quando um cliente fizer pedido pelo app, ele aparece aqui.</span>
            </div>

            <div v-else class="admin-kanban-board" aria-label="Kanban de pedidos">
              <section v-for="column in adminKanbanOrders" :key="column.status" class="admin-kanban-column">
                <header class="admin-kanban-column__header">
                  <div>
                    <span class="admin-kanban-column__check" aria-hidden="true"></span>
                    <strong>{{ column.title }}</strong>
                  </div>
                  <b>{{ column.orders.length }}</b>
                </header>

                <div class="admin-kanban-column__body">
                  <article v-for="order in column.orders" :key="order.id" class="admin-kanban-card" :class="{ 'has-promotion': hasAdminOrderPromotion(order) }">
                    <div class="admin-kanban-card__topline">
                      <label><input type="checkbox" aria-label="Selecionar pedido" /></label>
                      <strong>{{ formatOrderNumber(order.orderNumber) }}</strong>
                      <b>{{ formatCurrency(order.total) }}</b>
                    </div>

                    <div class="admin-kanban-card__customer">
                      <span>{{ order.customerName }}</span>
                      <small>{{ getAdminOrderDateLabel(order) }}</small>
                    </div>

                    <div class="admin-kanban-tags">
                      <span>{{ order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada' }}</span>
                      <span v-if="hasAdminOrderPromotion(order)" class="promo">Promoção</span>
                    </div>

                    <div class="admin-kanban-card__contact">
                      <span>{{ formatBrazilianPhone(order.customerPhone) }}</span>
                      <a
                        v-if="getAdminOrderWhatsappUrl(order)"
                        :href="getAdminOrderWhatsappUrl(order)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >WhatsApp</a>
                    </div>

                    <p class="admin-kanban-card__address">{{ getAdminOrderShortAddress(order) }}</p>

                    <div class="admin-kanban-items">
                      <div v-for="item in order.items" :key="item.id">
                        <img :src="getOrderItemImage(item)" alt="" />
                        <span>{{ item.quantity }}x {{ item.productName }}</span>
                        <small>{{ getAdminOrderItemDetails(item) }} • {{ formatCurrency(item.unitPrice) }}</small>
                        <em v-if="isAdminOrderItemPromotion(item)">Promoção</em>
                      </div>
                    </div>

                    <details class="admin-kanban-details">
                      <summary>Ver detalhes</summary>
                      <pre>{{ getAdminDeliveryDetails(order) }}</pre>
                      <p v-if="order.distanceKm">Distância: {{ formatDistance(order.distanceKm) }}</p>
                      <p v-if="order.customerNotes">Observações: {{ order.customerNotes }}</p>
                      <p>Subtotal: {{ formatCurrency(order.subtotal) }} • Entrega: {{ formatCurrency(order.deliveryFee) }}</p>
                      <label class="field"><span>Status</span><select :value="order.status" @change="changeAdminOrderStatus(order.id, ($event.target as HTMLSelectElement).value as AdminOrderStatus)">
                        <option v-for="(label, status) in adminOrderStatusLabels" :key="status" :value="status">{{ label }}</option>
                      </select></label>
                    </details>

                    <div class="admin-kanban-actions">
                      <button
                        v-if="getAdminOrderPreviousStatus(order)"
                        class="admin-kanban-back"
                        type="button"
                        @click="changeAdminOrderStatus(order.id, getAdminOrderPreviousStatus(order)!)"
                      >Voltar</button>
                      <button
                        v-if="getAdminOrderNextStatus(order)"
                        class="admin-kanban-next"
                        type="button"
                        @click="changeAdminOrderStatus(order.id, getAdminOrderNextStatus(order)!)"
                      >{{ getAdminOrderNextLabel(order) }}</button>
                      <button
                        v-if="order.status !== 'cancelled' && order.status !== 'completed'"
                        class="admin-kanban-cancel"
                        type="button"
                        @click="changeAdminOrderStatus(order.id, 'cancelled')"
                      >Cancelar</button>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </section>
        </template>

        <template v-else-if="adminPage === 'funnel'">
          <section class="admin-card-panel admin-section admin-funnel-page">
            <div class="admin-card-panel__header">
              <div>
                <h2>Funil de checkout</h2>
                <p>Veja quem iniciou carrinho, entrou nos dados e quem deixou contato para recuperação.</p>
              </div>
              <div class="admin-funnel-tabs" role="group" aria-label="Período do funil">
                <button type="button" :class="{ active: checkoutFunnelRange === 'today' }" @click="checkoutFunnelRange = 'today'">Hoje</button>
                <button type="button" :class="{ active: checkoutFunnelRange === '7d' }" @click="checkoutFunnelRange = '7d'">7 dias</button>
                <button type="button" :class="{ active: checkoutFunnelRange === '30d' }" @click="checkoutFunnelRange = '30d'">30 dias</button>
                <button type="button" :disabled="checkoutFunnelLoading" @click="loadCheckoutFunnel">{{ checkoutFunnelLoading ? 'Atualizando...' : 'Atualizar' }}</button>
              </div>
            </div>

            <p v-if="checkoutFunnelError" class="error-text">{{ checkoutFunnelError }}</p>

            <div class="admin-funnel-grid" :class="{ loading: checkoutFunnelLoading }">
              <article><span>🛒</span><strong>{{ checkoutFunnelSummary?.sessionsStarted ?? 0 }}</strong><small>Carrinhos iniciados</small></article>
              <article><span>▣</span><strong>{{ checkoutFunnelSummary?.detailsStarted ?? 0 }}</strong><small>Entraram nos dados</small></article>
              <article><span>☎</span><strong>{{ checkoutSessionsWithContactCount }}</strong><small>Deixaram contato</small></article>
              <article><span>✓</span><strong>{{ checkoutFunnelSummary?.completed ?? 0 }}</strong><small>Pedidos concluídos</small></article>
              <article><span>!</span><strong>{{ checkoutFunnelSummary?.abandoned ?? 0 }}</strong><small>Abandonados 2h+</small></article>
            </div>

            <div class="admin-funnel-controls">
              <div class="admin-funnel-filter" role="group" aria-label="Filtrar sessões do funil">
                <button type="button" :class="{ active: checkoutFunnelFilter === 'all' }" @click="checkoutFunnelFilter = 'all'">Todos</button>
                <button type="button" :class="{ active: checkoutFunnelFilter === 'with_contact' }" @click="checkoutFunnelFilter = 'with_contact'">Com contato</button>
                <button type="button" :class="{ active: checkoutFunnelFilter === 'without_contact' }" @click="checkoutFunnelFilter = 'without_contact'">Sem contato</button>
                <button type="button" :class="{ active: checkoutFunnelFilter === 'abandoned' }" @click="checkoutFunnelFilter = 'abandoned'">Abandonados</button>
                <button type="button" :class="{ active: checkoutFunnelFilter === 'completed' }" @click="checkoutFunnelFilter = 'completed'">Concluídos</button>
              </div>
              <button class="admin-funnel-density" type="button" @click="checkoutFunnelDensity = checkoutFunnelDensity === 'compact' ? 'comfortable' : 'compact'">
                {{ checkoutFunnelDensity === 'compact' ? 'Ver maior' : 'Ver compacto' }}
              </button>
            </div>

            <div v-if="!filteredCheckoutSessions.length && !checkoutFunnelLoading" class="admin-empty-orders">
              <strong>Nenhuma sessão no período.</strong>
              <span>Quando alguém aparecer nesse filtro, o card entra aqui.</span>
            </div>

            <div v-else class="admin-funnel-session-list" :class="{ 'admin-funnel-session-list--compact': checkoutFunnelDensity === 'compact' }">
              <article v-for="session in filteredCheckoutSessions" :key="session.sessionId" class="admin-funnel-session-card" :class="{ abandoned: session.isAbandoned, completed: session.status === 'completed' }">
                <header>
                  <div>
                    <strong>{{ getCheckoutStatusLabel(session.status) }}</strong>
                    <small>{{ getCheckoutStepLabel(session.currentStep) }} • {{ new Date(session.lastActivityAt).toLocaleString('pt-BR') }}</small>
                  </div>
                  <div class="admin-funnel-session-actions">
                    <span v-if="session.isAbandoned">Abandonado</span>
                    <span v-else-if="session.status === 'completed'">Concluído</span>
                    <span v-else>Em andamento</span>
                    <button class="admin-funnel-remove cart-item__remove" type="button" :disabled="removingCheckoutSessionId === session.sessionId" aria-label="Remover item do funil" title="Remover do funil" @click.stop="removeCheckoutSession(session.sessionId)">
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M4 7h16" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M6 7l1 13h10l1-13" />
                        <path d="M9 7V4h6v3" />
                      </svg>
                    </button>
                  </div>
                </header>

                <div class="admin-funnel-session-meta">
                  <div><small>Itens</small><strong>{{ session.itemsQuantity }}</strong></div>
                  <div><small>Subtotal</small><strong>{{ formatCurrency(session.cartSubtotal) }}</strong></div>
                  <div><small>Pedido</small><strong>{{ session.orderMode === 'scheduled' ? 'Encomenda' : session.orderMode === 'ready' ? 'Pronta entrega' : '-' }}</strong></div>
                  <div><small>Recebimento</small><strong>{{ session.fulfillmentType === 'delivery' ? 'Entrega' : session.fulfillmentType === 'pickup' ? 'Retirada' : '-' }}</strong></div>
                  <div><small>Progresso</small><strong>{{ getCheckoutProgressLabel(session.lastCompletedField) }}</strong></div>
                </div>

                <div class="admin-funnel-contact">
                  <div>
                    <small>Contato</small>
                    <strong>{{ session.customerName || 'Nome não informado' }}</strong>
                    <span>{{ session.customerPhone ? formatBrazilianPhone(session.customerPhone) : 'Telefone não informado' }}</span>
                  </div>
                  <a v-if="getCheckoutSessionWhatsappUrl(session)" :href="getCheckoutSessionWhatsappUrl(session)" target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
                </div>

                <div v-if="session.cartItems.length" class="admin-funnel-products">
                  <div v-for="(item, index) in session.cartItems" :key="`${session.sessionId}-${index}`">
                    <span>{{ item.quantity || 0 }}x {{ getCheckoutProductLabel(item.product_key) }}</span>
                    <em v-if="isCheckoutItemPromotional(item)">Promoção</em>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </template>

        <template v-else-if="adminPage === 'delivery'">
          <section class="admin-card-panel admin-section admin-delivery-panel">
            <div class="admin-card-panel__header">
              <div>
                <h2>Cálculo de frete</h2>
                <p>Escolha se o cliente verá o frete calculado no checkout ou se a taxa ficará a confirmar no pedido.</p>
              </div>
              <label class="admin-switch admin-switch--compact"><input v-model="appConfig.deliveryPricing.enabled" type="checkbox" /><span><strong>{{ appConfig.deliveryPricing.enabled ? 'Cálculo ativo' : 'A confirmar' }}</strong></span></label>
            </div>
          </section>

          <section class="admin-card-panel admin-section admin-delivery-panel">
            <div class="admin-card-panel__header">
              <div>
                <h2>Taxa por raio</h2>
                <p>Defina o valor automático conforme a distância calculada. Acima do maior raio, fica como entrega a consultar.</p>
              </div>
              <button class="admin-ghost-button" type="button" :disabled="!appConfig.deliveryPricing.enabled" @click="addDeliveryRange">Adicionar faixa</button>
            </div>

            <div class="admin-delivery-ranges">
              <article v-for="(range, index) in appConfig.deliveryPricing.ranges" :key="`range-${index}`" class="admin-delivery-row">
                <label class="admin-money-field"><span>Até km</span><div><b>km</b><input v-model.number="range.maxDistance" type="number" min="0" step="0.1" :disabled="!appConfig.deliveryPricing.enabled" /></div></label>
                <label class="admin-money-field"><span>Valor</span><div><b>R$</b><input v-model.number="range.price" type="number" min="0" step="0.01" :disabled="!appConfig.deliveryPricing.enabled" /></div></label>
                <button class="admin-order-delete" type="button" :disabled="!appConfig.deliveryPricing.enabled || appConfig.deliveryPricing.ranges.length <= 1" @click="removeDeliveryRange(index)">Remover</button>
              </article>
            </div>
          </section>

          <section class="admin-card-panel admin-section admin-delivery-panel">
            <div class="admin-card-panel__header">
              <div>
                <h2>Adicional por horário</h2>
                <p>Use para horários de maior demanda. O adicional é somado à faixa de distância quando ativo.</p>
              </div>
              <button class="admin-ghost-button" type="button" :disabled="!appConfig.deliveryPricing.enabled" @click="addDeliveryTimeSurcharge">Adicionar horário</button>
            </div>

            <div class="admin-delivery-ranges">
              <article v-for="(surcharge, index) in appConfig.deliveryPricing.timeSurcharges" :key="`surcharge-${index}`" class="admin-delivery-row admin-delivery-row--time">
                <label class="admin-switch admin-switch--compact"><input v-model="surcharge.active" type="checkbox" :disabled="!appConfig.deliveryPricing.enabled" /><span><strong>{{ surcharge.active ? 'Ativo' : 'Inativo' }}</strong></span></label>
                <label class="field"><span>Nome</span><input v-model="surcharge.label" type="text" :disabled="!appConfig.deliveryPricing.enabled" /></label>
                <label class="field"><span>Início</span><input v-model="surcharge.start" type="time" :disabled="!appConfig.deliveryPricing.enabled" /></label>
                <label class="field"><span>Fim</span><input v-model="surcharge.end" type="time" :disabled="!appConfig.deliveryPricing.enabled" /></label>
                <label class="admin-money-field"><span>Adicional</span><div><b>R$</b><input v-model.number="surcharge.extraPrice" type="number" min="0" step="0.01" :disabled="!appConfig.deliveryPricing.enabled" /></div></label>
                <button class="admin-order-delete" type="button" :disabled="!appConfig.deliveryPricing.enabled" @click="removeDeliveryTimeSurcharge(index)">Remover</button>
              </article>
            </div>
          </section>
        </template>

        <template v-else>
          <div class="admin-settings-layout">
            <div class="admin-settings-content">
              <div class="admin-tabs" role="tablist" aria-label="Configurações">
            <button type="button" :class="{ active: adminSettingsTab === 'availability' }" @click="adminSettingsTab = 'availability'">Disponibilidade</button>
            <button type="button" :class="{ active: adminSettingsTab === 'hours' }" @click="adminSettingsTab = 'hours'">Horários</button>
            <button type="button" :class="{ active: adminSettingsTab === 'products' }" @click="adminSettingsTab = 'products'">Produtos</button>
          </div>

          <section v-if="adminSettingsTab === 'availability'" class="admin-card-panel admin-section">
            <div>
              <h2>Disponibilidade</h2>
              <p class="admin-section__hint">Controle os canais de venda e informações principais.</p>
            </div>
            <div class="admin-status-grid">
              <label class="admin-switch admin-switch--card">
                <input v-model="appConfig.availability.readyDelivery" type="checkbox" />
                <span><strong>Pronta entrega</strong><small>Receber ou retirar hoje</small></span>
              </label>
              <label class="admin-switch admin-switch--card">
                <input v-model="appConfig.availability.scheduledOrders" type="checkbox" />
                <span><strong>Encomendas</strong><small>Cliente escolhe uma data</small></span>
              </label>
              <label class="admin-switch admin-switch--card">
                <input v-model="appConfig.promotion.active" type="checkbox" />
                <span><strong>Promoção</strong><small>Ativar campanha no link promo</small></span>
              </label>
            </div>
            <label class="field"><span>Mensagem de disponibilidade</span><textarea v-model="appConfig.availability.availabilityMessage" rows="3"></textarea></label>
            <label class="field"><span>Local de retirada</span><input v-model="appConfig.pickupLocation" type="text" /></label>
          </section>

          <section v-if="adminSettingsTab === 'hours'" class="admin-card-panel admin-section">
            <div>
              <h2>Horário de atendimento</h2>
              <p class="admin-section__hint">Configure cada dia da semana. O resumo aparece para o cliente.</p>
            </div>
            <label class="field"><span>Resumo público</span><input v-model="appConfig.availability.openingHours" type="text" /></label>
            <div class="admin-hours-grid">
              <article v-for="day in appConfig.availability.weeklyHours" :key="day.day" class="admin-day-card" :class="{ 'admin-day-card--closed': !day.open }">
                <label><input v-model="day.open" type="checkbox" /><strong>{{ day.day }}</strong></label>
                <input v-model="day.hours" type="text" :disabled="!day.open" />
              </article>
            </div>
          </section>

          <section v-if="adminSettingsTab === 'products'" class="admin-card-panel admin-section">
            <div>
              <h2>Produtos</h2>
              <p class="admin-section__hint">Defina disponibilidade, preço normal e promoção por tamanho, sabor e tipo.</p>
            </div>
            <div class="admin-product-toolbar">
              <div>
                <span>Tamanho</span>
                <div class="admin-filter-pills">
                  <button v-for="filter in adminProductSizeFilters" :key="filter.value" type="button" :class="{ active: adminProductSizeFilter === filter.value }" @click="adminProductSizeFilter = filter.value">{{ filter.label }}</button>
                </div>
              </div>
              <div>
                <span>Sabor</span>
                <div class="admin-filter-pills">
                  <button v-for="filter in adminProductFlavorFilters" :key="filter.value" type="button" :class="{ active: adminProductFlavorFilter === filter.value }" @click="adminProductFlavorFilter = filter.value">{{ filter.label }}</button>
                </div>
              </div>
            </div>

            <div class="admin-products-grid">
              <article v-for="product in adminFilteredProductCards" :key="product.key" class="admin-product-card" :class="{ 'admin-product-card--disabled': !appConfig.productAvailability[product.key] }">
                <img :src="product.image" alt="" />
                <div class="admin-product-card__body">
                  <div class="admin-product-card__title">
                    <div><strong>{{ product.name }}</strong><small>{{ product.details }}</small></div>
                    <label class="admin-product-toggle"><input v-model="appConfig.productAvailability[product.key]" type="checkbox" /><span>{{ appConfig.productAvailability[product.key] ? 'Disponível' : 'Indisponível' }}</span></label>
                  </div>
                  <div class="admin-money-row">
                    <label class="admin-money-field"><span>Preço normal</span><div><b>R$</b><input v-model.number="appConfig.prices[product.type][product.flavor][product.size]" type="number" step="0.01" /></div></label>
                    <label v-if="getProductPromotion(product.type, product.flavor, product.size)" class="admin-money-field admin-money-field--promo"><span>Preço promo</span><div><b>R$</b><input v-model.number="getProductPromotion(product.type, product.flavor, product.size)!.promotionalPrice" type="number" step="0.01" /></div></label>
                  </div>
                  <div class="admin-product-modes">
                    <span>Tipo de pedido</span>
                    <label>
                      <input
                        :checked="appConfig.productOrderModes[product.key]?.ready !== false"
                        type="checkbox"
                        @change="setProductOrderMode(product.key, 'ready', ($event.target as HTMLInputElement).checked)"
                      />
                      Pronta entrega
                    </label>
                    <label>
                      <input
                        :checked="appConfig.productOrderModes[product.key]?.scheduled !== false"
                        type="checkbox"
                        @change="setProductOrderMode(product.key, 'scheduled', ($event.target as HTMLInputElement).checked)"
                      />
                      Encomenda
                    </label>
                  </div>
                  <label v-if="getProductPromotion(product.type, product.flavor, product.size)" class="admin-minimum-field"><span>Mínimo da promoção</span><input v-model.number="getProductPromotion(product.type, product.flavor, product.size)!.minimumDeliveryQuantity" type="number" min="1" /></label>
                </div>
              </article>
            </div>
          </section>

            </div>

            <aside class="admin-current-config">
              <div class="admin-current-config__header">
                <h2>Resumo atual</h2>
                <span>{{ appConfig.promotion.active ? 'Promo ativa' : 'Sem promo' }}</span>
              </div>
              <div class="admin-current-list">
                <div><span>Produtos disponíveis</span><strong>{{ adminAvailableProducts }}/{{ adminTotalProducts }}</strong></div>
                <div><span>Pronta entrega</span><strong>{{ appConfig.availability.readyDelivery ? 'Ativa' : 'Off' }}</strong></div>
                <div><span>Encomendas</span><strong>{{ appConfig.availability.scheduledOrders ? 'Ativas' : 'Off' }}</strong></div>
                <div><span>Preço médio</span><strong>{{ formatCurrency(adminAveragePrice) }}</strong></div>
              </div>
              <button class="admin-primary-button" type="button" :disabled="adminSaving" @click="saveAdminConfig">{{ adminSaving ? 'Salvando...' : 'Salvar configurações' }}</button>
            </aside>
          </div>
        </template>
        </div>
      </div>
    </section>  </main>


  <main v-else class="page-shell">
    <header class="site-header">
      <button v-if="currentPage !== 'order' && currentPage !== 'start' && currentPage !== 'success'" class="back-button" type="button" aria-label="Voltar" @click="currentPage === 'checkout' ? openDetailsPage() : currentPage === 'details' ? openOrderPage() : openStartPage()">
        ‹
      </button>
      <button v-else class="brand" type="button" aria-label="Peraí, tem pudim!" @click="openOrderPage()">
        <img class="brand__logo" :src="logoImage" alt="Peraí, tem pudim!" />
        <span>
          <strong>Peraí, tem pudim!</strong>
          <small>Pudins artesanais feitos sob encomenda em Goiânia</small>
        </span>
      </button>
      <strong class="app-title">
        {{ currentPage === 'success' ? 'Pedido recebido' : currentPage === 'checkout' ? 'Finalizar pedido' : currentPage === 'details' ? 'Recebimento' : currentPage === 'order' ? 'Monte seu pedido' : promoQueryEnabled ? 'Oferta Especial' : 'Como pedir' }}
      </strong>
      <button class="cart-icon-button" type="button" aria-label="Ver carrinho" :disabled="!itemAdded" @click="openDetailsPage">
        <span aria-hidden="true">▢</span>
        <b v-if="cartQuantity">{{ cartQuantity }}</b>
      </button>
    </header>

    <form class="order-layout" @submit.prevent="handleSubmit">
      <template v-if="currentPage === 'start'">
        <section
          v-if="promoQueryEnabled && promotion.active"
          ref="promotionSection"
          class="promo-panel promo-panel--campaign"
          :class="{ 'promo-panel--highlight': shouldHighlightPromotion }"
          aria-labelledby="promo-title"
        >
          <div class="promo-panel__hero-title">
            <h1 id="promo-title">Pudins a partir de</h1>
            <strong>{{ formatCurrency(promotionStartingPrice) }}</strong>
          </div>

          <div class="promo-panel__subhead">
            <h2>Escolha o tamanho</h2>
            <p>Sabores: <strong>Tradicional e Café</strong> <span aria-hidden="true">|</span> <strong>Normal ou Zero Lactose</strong></p>
          </div>

          <div class="promo-offers promo-offers--visual">
            <button class="promo-offer-card promo-offer-card--visual" type="button" aria-label="Montar pedido com pudim 180ml" @click="selectPromotionSize('180ml')">
              <img :src="pudding180Image" alt="" />
              <div>
                <span class="promo-offer-card__from">de {{ formatCurrency(promotion.products.normal_tradicional_180ml.originalPrice) }}</span>
                <div class="promo-price promo-price--visual">
                  <small><span>por</span><br/><span>R$</span></small>
                  <strong><span>{{ getPriceParts(promotion.products.normal_tradicional_180ml.promotionalPrice).integer }}</span><sup>{{ getPriceParts(promotion.products.normal_tradicional_180ml.promotionalPrice).cents }}</sup></strong>
                </div>
              </div>
              <b>180ml</b>
            </button>

            <button class="promo-offer-card promo-offer-card--visual" type="button" aria-label="Montar pedido com pudim 500ml" @click="selectPromotionSize('500ml')">
              <img :src="pudding500Image" alt="" />
              <div>
                <span class="promo-offer-card__from">de {{ formatCurrency(promotion.products.normal_tradicional_500ml.originalPrice) }}</span>
                <div class="promo-price promo-price--visual">
                  <small><span>por</span><br/><span>R$</span></small>
                  <strong><span>{{ getPriceParts(promotion.products.normal_tradicional_500ml.promotionalPrice).integer }}</span><sup>{{ getPriceParts(promotion.products.normal_tradicional_500ml.promotionalPrice).cents }}</sup></strong>
                </div>
              </div>
              <b>500ml</b>
            </button>
          </div>

          <p class="promo-delivery-rule promo-delivery-rule--box">
            Pedido mínimo para delivery:<br />180ml: {{ promotion.products.normal_tradicional_180ml.minimumDeliveryQuantity }} unidades • 500ml: {{ promotion.products.normal_tradicional_500ml.minimumDeliveryQuantity }} unidades
          </p>
          <p class="promo-note">Preços promocionais para versões participantes. Consulte valores da opção Zero Lactose.</p>
          <p class="promo-urgency">{{ promotion.urgency }}</p>

          <button class="promo-cta promo-cta--pulse" type="button" @click="goToPromotionOrder">
            Quero Aproveitar a Promoção
          </button>
        </section>

        <section v-if="!promoQueryEnabled" class="panel start-panel">
          <div class="section-heading tela-1">
            <div>
              <h2>Como você <br/>quer pedir?</h2>
              <small>Escolha a opção que combina com você no momento.</small>
            </div>
          </div>

          <div class="option-grid" style="margin-top: 16px;">
            <button class="option-card start-option" type="button" :disabled="!isReadyDeliveryOpenNow" @click="selectOrderMode('ready')">
              <span class="option-card__icon start-icon start-icon--ready" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <path d="M27.5 4 12 25.5h11L19.5 44 36 20.5H24.8L27.5 4Z" />
                </svg>
              </span>
              <span class="option-card__content">
                <strong>Pronta entrega</strong>
                <small>Receba agora! Temos pudins disponíveis a pronta entrega.</small>
                <small style="margin-top: 8px;">{{ isReadyDeliveryOpenNow ? 'Quero receber/retirar hoje' : readyDeliveryUnavailableText }}</small>
              </span>
            </button>

            <button class="option-card start-option" type="button" :disabled="!appConfig.availability.scheduledOrders" @click="selectOrderMode('scheduled')">
              <span class="option-card__icon start-icon start-icon--calendar" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <rect x="10" y="12" width="28" height="27" rx="6" />
                  <path d="M10 20h28" />
                  <path d="M17 8v8M31 8v8" />
                  <path d="M18 28h4M26 28h4M18 34h4M26 34h4" />
                </svg>
              </span>
              <span class="option-card__content">
                <strong>Encomendar</strong>
                <small>Escolha a data e o horário ideais e faça seu pedido com antecedência.</small>
              </span>
            </button>
          </div>
        </section>
      </template>

      <template v-else-if="currentPage === 'order'">
        <section class="hero hero--compact">
          <div class="hero__visual" aria-hidden="true">
            <img :src="selectedSizeImage" alt="" />
            <span>{{ sizeLabels[size] }}</span>
          </div>
        </section>

        <div class="order-flow">
          <section ref="sizeSection" class="panel step-panel">
            <div class="section-heading">
              <div>
                <h2>Escolha o tamanho</h2>
              </div>
            </div>
            <div class="option-grid option-grid--three">
              <OptionCard
                v-for="option in sizeOptions"
                :key="option.value"
                :title="option.title"
                :description="option.description"
                :image="option.image"
                :price="getSizePriceLabel(option.value)"
                :original-price="getSizeOriginalPrice(option.value) ? formatCurrency(getSizeOriginalPrice(option.value)!) : undefined"
                :promotional-price="getSizePromotionalPrice(option.value) ? formatCurrency(getSizePromotionalPrice(option.value)!) : undefined"
                :selected="size === option.value"
                @select="selectSize(option.value)"
              />
            </div>
          </section>
          <section ref="flavorSection" class="panel step-panel">
            <div class="section-heading">
              <div>
                <h2>Escolha o sabor</h2>
              </div>
            </div>
            <div class="option-grid option-grid--two">
              <OptionCard
                v-for="option in flavorOptions"
                :key="option.value"
                :title="option.title"
                :description="option.description"
                :icon="option.icon"
                :selected="flavor === option.value"
                @select="selectFlavor(option.value)"
              />
            </div>
          </section>

          <section ref="typeSection" class="panel step-panel">
            <div class="section-heading">
              <div>
                <h2>Escolha o tipo</h2>
              </div>
            </div>
            <SegmentedControl :model-value="puddingType" :options="typeOptions" @update:model-value="selectType" />
            <p class="help-text">A versão zero lactose é preparada com leite e leite condensado zero lactose.</p>
          </section>
        </div>
      </template>

      <template v-else-if="currentPage === 'details'">
        <section v-if="itemAdded" ref="cartSection" class="panel cart-panel">
          <div class="section-heading details-heading">
            <div>
              <h2>Como você quer receber?</h2>
              <small>Informe o CEP para verificarmos a entrega na sua região.</small>
              <!-- <small>{{ detailsIntroText }}</small> -->
            </div>
          </div>

          <div class="cart-form details-form">
            <div>
              <span class="field-label">Forma de entrega</span>
              <SegmentedControl v-model="deliveryMode" :options="deliveryOptions" />
            </div>

            <div v-if="orderMode === 'scheduled'" class="scheduled-fields">
              <label class="field">
                <span>Data desejada</span>
                <input
                  v-model="desiredDate"
                  type="date"
                  required
                  :min="todayIso"
                  :max="maxDateIso"
                  :aria-invalid="Boolean(dateError)"
                  aria-describedby="date-error"
                />
              </label>
              <label class="field">
                <span>Horário desejado</span>
                <select v-model="desiredTimeSlot" required :aria-invalid="Boolean(dateError)">
                  <option value="" disabled>Selecione</option>
                  <option v-for="option in scheduledTimeOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
            </div>
            <div v-else class="ready-date-note">
              <span>Pronta entrega</span>
              <strong>Receber/retirar hoje, {{ formatDate(todayIso) }}</strong>
            </div>
            <p v-if="dateError" id="date-error" class="error-text">{{ dateError }}</p>

            <div v-if="deliveryMode === 'retirada'" class="pickup-note">
              <span>Local de retirada</span>
              <strong>{{ pickupLocation }}</strong>
            </div>

            <div v-if="deliveryMode === 'entrega'" class="delivery-fields delivery-fields--compact">
              <label class="field">
                <span>CEP</span>
                <input
                  v-model="cep"
                  type="text"
                  inputmode="numeric"
                  autocomplete="postal-code"
                  placeholder="00000-000"
                  maxlength="9"
                  @input="cep = formatCep(cep)"
                  @blur="fillAddressByCep"
                />
              </label>

              <div
                v-if="deliveryAddressFeedbackVisible"
                class="delivery-status"
                :class="isDeliveryCalculationEnabled ? `delivery-status--${deliveryStatus}` : 'delivery-status--manual'"
              >
                <strong>{{ isDeliveryCalculationEnabled ? `Entrega ${deliveryFeeLabel}` : 'Entrega: A confirmar' }}</strong>
                <span v-if="!isDeliveryCalculationEnabled">Confirmaremos o valor da entrega após receber o pedido.</span>
                <span v-else-if="deliveryStatus === 'available' && deliveryTimeLabel">Entrega estimada para sua região • {{ deliveryTimeLabel }}</span>
                <span v-else-if="deliveryDistanceLabel">Entrega • aproximadamente {{ deliveryDistanceLabel }}</span>
                <small
                  v-if="freeShippingMessage && (deliveryStatus === 'available' || deliveryStatus === 'outside-area')"
                  class="free-shipping-note"
                  :class="{ 'free-shipping-note--success': isEligibleForFreeShipping }"
                >{{ freeShippingMessage }}</small>
                <button
                  v-if="canShowFreeShippingSuggestionButton"
                  class="free-shipping-inline-button"
                  type="button"
                  @click="addFreeShippingSuggestionToCart"
                >
                  Adicionar {{ freeShippingSuggestionQuantity }} ao pedido
                </button>
                <small v-if="isDeliveryCalculationEnabled && deliveryStatus !== 'available' && deliveryMessage">{{ deliveryMessage }}</small>
                <button
                  v-if="deliveryStatus === 'address-not-found'"
                  class="manual-address-button"
                  type="button"
                  @click="enableManualAddressMode"
                >
                  Preencher endereço manualmente
                </button>
              </div>
            </div>

            <label class="field">
              <span>Seu nome</span>
              <input
                v-model.trim="customerName"
                type="text"
                required
                autocomplete="name"
                placeholder="Seu nome"
                :aria-invalid="Boolean(customerNameError)"
                aria-describedby="customer-name-error"
              />
            </label>
            <p v-if="customerNameError" id="customer-name-error" class="error-text">{{ customerNameError }}</p>

            <label class="field">
              <span>Telefone</span>
              <input
                v-model="customerPhone"
                type="tel"
                required
                inputmode="tel"
                autocomplete="tel"
                placeholder="(62) 99999-9999"
                maxlength="15"
                @input="formatCustomerPhoneInput"
                :aria-invalid="Boolean(customerPhoneError)"
                aria-describedby="customer-phone-error customer-phone-help"
              />
            </label>
            <small id="customer-phone-help" class="field-help">Usaremos este número apenas para confirmar o pedido e enviar os dados de pagamento.</small>
            <p v-if="customerPhoneError" id="customer-phone-error" class="error-text">{{ customerPhoneError }}</p>

            <div v-if="deliveryMode === 'entrega'" class="delivery-fields delivery-fields--address">
              <div class="delivery-city-row">
                <label class="field field--auto-filled">
                  <span>Endereço</span>
                  <input v-model="address" type="text" autocomplete="street-address" placeholder="Rua, avenida ou alameda" />
                </label>
                <label class="field">
                  <span>Número</span>
                  <input v-model="number" type="text" inputmode="numeric" autocomplete="address-line2" placeholder="Nº" />
                </label>
              </div>
              <label class="field field--auto-filled">
                <span>Bairro</span>
                <input v-model="neighborhood" type="text" autocomplete="address-level2" placeholder="Bairro" />
              </label>
              <p v-if="triedSubmit && !deliveryAddressComplete" class="error-text">
                Informe CEP, endereço, número e bairro para continuar.
              </p>
              <p v-if="triedSubmit && deliveryAddressComplete && !canUseDeliveryCalculation" class="error-text">
                Calcule a entrega antes de continuar.
              </p>
            </div>

            <div class="optional-address">
              <button
                class="optional-address__toggle"
                type="button"
                :aria-expanded="optionalAddressOpen"
                aria-controls="optional-address-fields"
                @click="openOptionalAddressFields"
              >
                <span>Adicionar complemento e observações</span>
                <strong>{{ optionalAddressOpen ? 'Fechar' : 'Abrir' }}</strong>
              </button>
              <div v-show="optionalAddressOpen" id="optional-address-fields" class="optional-address__fields">
                <label v-if="deliveryMode === 'entrega'" class="field field--wide">
                  <span>Complemento (opcional)</span>
                  <input v-model="complement" type="text" placeholder="Apartamento, bloco, lote..." />
                </label>
                <label v-if="deliveryMode === 'entrega'" class="field field--wide">
                  <span>Ponto de referência (opcional)</span>
                  <input v-model="reference" type="text" placeholder="Próximo a..." />
                </label>
                <label class="field">
                  <span>Observações</span>
                  <textarea
                    v-model="notes"
                    rows="4"
                    placeholder="Horário preferencial, restrições ou instruções para entrega."
                  ></textarea>
                </label>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="currentPage === 'checkout'">
        <section class="panel cart-panel">
          <div class="section-heading">
            <div>
              <h2>🍮 Seu pedido está pronto!</h2>
              <small>Falta apenas um passo para reservar seus pudins.</small>
            </div>
          </div>

          <div class="cart-items-list">
            <article v-for="item in cartItems" :key="item.id" class="cart-item cart-item--featured">
              <img :src="item.image" alt="" />
              <div>
                <div class="cart-item__title-row">
                  <strong>Pudim {{ flavorLabels[item.flavor] }}</strong>
                  <button class="cart-item__remove" type="button" aria-label="Remover Pudim {{ flavorLabels[item.flavor] }}" @click="removeCartItem(item.id)">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M4 7h16" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M6 7l1 13h10l1-13" />
                      <path d="M9 7V4h6v3" />
                    </svg>
                  </button>
                </div>
                <small>{{ typeLabels[item.puddingType] }} • {{ sizeLabels[item.size] }} • {{ item.quantity }} unidade(s)</small>
                <em v-if="item.promotionLabel" class="cart-item__promo">{{ item.promotionLabel }}</em>
                <b><s v-if="item.originalUnitPrice">{{ formatCurrency(item.originalUnitPrice * item.quantity) }}</s>{{ formatCurrency(item.total) }}</b>
              </div>
            </article>
          </div>

          <button class="add-more-button" type="button" @click="openOrderPage(sizeSection)">
            Adicionar outro pudim
          </button>
        </section>

        <div ref="summarySection" class="summary-column">
          <OrderSummary
            :customer-name="customerName"
            :items="cartItems.map((item) => ({
              id: item.id,
              name: `Pudim ${flavorLabels[item.flavor]}`,
              details: `${typeLabels[item.puddingType]} • ${sizeLabels[item.size]}`,
              quantity: item.quantity,
              unitPrice: formatCurrency(item.unitPrice),
              subtotal: formatCurrency(item.total),
            }))"
            :date="formatDate(effectiveDesiredDate)"
            :time="orderMode === 'scheduled' ? desiredTimeSlot : ''"
            :delivery="deliveryLabels[deliveryMode]"
            :subtotal="formatCurrency(subtotal)"
            :delivery-fee="deliveryFeeLabel"
            :delivery-distance="deliveryDistanceLabel"
            :delivery-note="deliveryStatus === 'outside-area' ? deliveryMessage : ''"
            :total="formatCurrency(total)"
          />
        </div>
      </template>

      <template v-else-if="currentPage === 'success'">
        <section class="panel success-panel">
          <div class="success-card">
            <div class="success-card__hero">
              <div>
                <h2>Pedido recebido!</h2>
                <p>Recebemos seu pedido com sucesso.</p>
              </div>
            </div>

            <p class="success-card__message">Agora vamos verificar a disponibilidade e entrar em contato para confirmar o pedido e o pagamento.</p>

            <div v-if="currentCreatedOrder" class="success-summary">
              <div class="success-summary__highlight">
                <span>Número do pedido</span>
                <strong>{{ formatOrderNumber(currentCreatedOrder.order_number) }}</strong>
              </div>
              <div class="success-summary__highlight">
                <span>Status</span>
                <strong class="success-status">Aguardando confirmação</strong>
              </div>
              <div><span>Nome</span><strong>{{ customerName }}</strong></div>
              <div class="success-summary__phone"><span>Telefone</span><strong>{{ formatBrazilianPhone(customerPhone) }}</strong><small>É por este número que entraremos em contato.</small></div>
              <div><span>Data</span><strong>{{ formatDate(effectiveDesiredDate) }}</strong></div>
              <div v-if="desiredTimeSlot"><span>Horário</span><strong>{{ desiredTimeSlot }}</strong></div>
              <div><span>Recebimento</span><strong>{{ deliveryLabels[deliveryMode] }}</strong></div>
              <div class="success-summary__highlight"><span>Total</span><strong>{{ formatCurrency(currentCreatedOrder.total) }}</strong></div>
            </div>

            <div v-if="createdOrderItems.length" class="success-items">
              <h3>Itens do pedido</h3>
              <article v-for="item in createdOrderItems" :key="item.id" class="success-item">
                <img :src="item.image" :alt="`Pudim ${flavorLabels[item.flavor]}`" />
                <div>
                  <strong>{{ item.quantity }}x Pudim {{ flavorLabels[item.flavor] }}</strong>
                  <span>{{ typeLabels[item.puddingType] }} • {{ sizeLabels[item.size] }} • {{ formatCurrency(item.total) }}</span>
                </div>
              </article>
            </div>

            <div class="success-actions">
              <button class="mobile-checkout__button" type="button" @click="goHomeFromSuccess">Voltar ao início</button>
              <button class="add-more-button" type="button" @click="startAnotherOrder">Fazer outro pedido</button>
            </div>
          </div>
        </section>
      </template>

      <div v-if="canShowAddButton" class="mobile-checkout mobile-checkout--add">
        <small v-if="selectedProductAvailabilityError || selectedPromotionalMinimumError" class="minimum-inline-error">{{ selectedProductAvailabilityError || selectedPromotionalMinimumError }}</small>
        <div class="mobile-checkout__quantity-row">
          <QuantityStepper v-model="quantity" :min="1" :max="20" />
          <button class="mobile-checkout__button" type="button" :disabled="Boolean(selectedProductAvailabilityError || selectedPromotionalMinimumError)" @click="addToCart">
            Adicionar • {{ formatCurrency(selectedItemTotal) }}
          </button>
        </div>
      </div>

      <div v-if="canShowSendButton" class="mobile-checkout mobile-checkout--send">
        <button class="mobile-checkout__button" type="submit" :disabled="submitLoading">
          {{ submitLoading ? 'Enviando pedido...' : `Enviar pedido • ${formatCurrency(total)}` }}
        </button>
        <small v-if="submitError" class="minimum-inline-error">{{ submitError }}</small>
        <small class="text-center">Você receberá a confirmação pelo telefone informado.</small>
      </div>

      <div v-if="currentPage === 'details' && itemAdded" class="mobile-checkout mobile-checkout--details">
        <small v-if="freeShippingMessage && deliveryMode === 'entrega' && (deliveryStatus === 'available' || deliveryStatus === 'outside-area')" class="mobile-checkout__shipping-note">{{ freeShippingMessage }}</small>
        <div class="mobile-checkout__total-single">
          <small>{{ detailsFooterTotalLabel }}</small>
          <strong>{{ formatCurrency(total) }}</strong>
        </div>
        <button class="mobile-checkout__button" type="button" :disabled="!areCustomerDetailsComplete" @click="confirmDetails">
          Continuar
        </button>
      </div>
    </form>
  </main>
</template>
