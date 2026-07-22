<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import OptionCard from './components/OptionCard.vue'
import OrderSummary from './components/OrderSummary.vue'
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

const whatsappNumber = '5563992916364'
const adminCredentials = { user: 'admin', password: 'Pudim@2026!Faicalville' }
const appConfigStorageKey = 'perai-tem-pudim-config'
const ordersStorageKey = 'perai-tem-pudim-orders'
const adminSessionStorageKey = 'perai-tem-pudim-admin-session'

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
const adminPage = ref<'dashboard' | 'settings' | 'orders'>('dashboard')
const adminSettingsTab = ref<'availability' | 'hours' | 'products'>('availability')
const adminSearch = ref('')
const adminProductSizeFilter = ref<Size | 'all'>('all')
const adminProductFlavorFilter = ref<Flavor | 'all'>('all')
const adminUser = ref('')
const adminPassword = ref('')
const showAdminPassword = ref(false)
const adminError = ref('')
const savedOrders = ref<SavedOrder[]>([])

const flavor = ref<Flavor>('tradicional')
const puddingType = ref<PuddingType>('normal')
const size = ref<Size>('500ml')
const quantity = ref(1)
const orderMode = ref<OrderMode | null>(null)
const customerName = ref('')
const desiredDate = ref('')
const deliveryMode = ref<DeliveryMode>('retirada')
const cep = ref('')
const neighborhood = ref('')
const address = ref('')
const number = ref('')
const city = ref('Goiânia')
const state = ref('GO')
const complement = ref('')
const reference = ref('')
const notes = ref('')
const deliveryStatus = ref<DeliveryCalculationStatus>('idle')
const deliveryMessage = ref('')
const deliveryDistanceKm = ref<number | null>(null)
const deliveryFee = ref<number | null>(null)
const triedSubmit = ref(false)
const isLoading = ref(true)
const loadingPhraseIndex = ref(0)
const cartItems = ref<CartItem[]>([])
const currentPage = ref<'start' | 'order' | 'details' | 'checkout'>('start')
const flavorSection = ref<HTMLElement | null>(null)
const typeSection = ref<HTMLElement | null>(null)
const sizeSection = ref<HTMLElement | null>(null)
const cartSection = ref<HTMLElement | null>(null)
const summarySection = ref<HTMLElement | null>(null)
const promotionSection = ref<HTMLElement | null>(null)
const promoQueryEnabled = ref(false)
const shouldHighlightPromotion = ref(false)

const loadingPhrases = ['produção artesanal', 'Sob encomenda e pronta entrega', 'feito com calma e carinho']

const todayIso = computed(() => new Date().toISOString().slice(0, 10))
const maxDateIso = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().slice(0, 10)
})
const unitPrice = computed(() => getEffectivePrice(puddingType.value, flavor.value, size.value))
const selectedOriginalPrice = computed(() => getPromotionalProduct(puddingType.value, flavor.value, size.value)?.originalPrice)
const selectedPromotionLabel = computed(() => getPromotionalProduct(puddingType.value, flavor.value, size.value) ? 'Promoção pronta entrega' : '')
const selectedItemTotal = computed(() => unitPrice.value * quantity.value)
const subtotal = computed(() => cartItems.value.reduce((sum, item) => sum + item.total, 0))
const total = computed(() => subtotal.value + (deliveryMode.value === 'entrega' ? deliveryFee.value ?? 0 : 0))
const effectiveDesiredDate = computed(() => (orderMode.value === 'ready' ? todayIso.value : desiredDate.value))
function getDateError() {
  if (orderMode.value === 'ready') return ''
  if (!desiredDate.value) return 'Escolha a data desejada para sua encomenda.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate.value)) return 'Informe uma data válida.'
  if (desiredDate.value < todayIso.value) return 'Escolha uma data a partir de hoje.'
  if (desiredDate.value > maxDateIso.value) return 'Escolha uma data dentro dos próximos 12 meses.'
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
const isDateValid = computed(() => getDateError() === '')
const pickupLocation = computed(() => appConfig.value.pickupLocation)
const prices = computed(() => appConfig.value.prices)
const promotion = computed(() => appConfig.value.promotion)

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
  deliveryMode.value !== 'entrega' || deliveryStatus.value === 'available' || deliveryStatus.value === 'outside-area',
)
const areCustomerDetailsValid = computed(() => isDateValid.value && !customerNameError.value && deliveryAddressComplete.value && canUseDeliveryCalculation.value)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDistance = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`

const deliveryDistanceLabel = computed(() => (deliveryDistanceKm.value === null ? '' : formatDistance(deliveryDistanceKm.value)))
const deliveryFeeLabel = computed(() => {
  if (deliveryMode.value === 'retirada') return 'Retirada — grátis'
  if (deliveryFee.value !== null) return formatCurrency(deliveryFee.value)
  if (deliveryStatus.value === 'outside-area') return 'Entrega a consultar'
  return 'A calcular'
})

const formatDate = (value: string) => {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

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

function getTodayOpeningHours() {
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  return appConfig.value.availability.weeklyHours.find((day) => day.day === dayNames[new Date().getDay()])
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
  { label: 'Retirada', value: 'retirada' as const, icon: 'pickup' as const },
  { label: 'Entrega', value: 'entrega' as const, icon: 'delivery' as const },
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
  return 'Configurações'
})
const adminSubtitle = computed(() => {
  if (adminPage.value === 'dashboard') return 'Resumo rápido da loja, produtos e campanha.'
  if (adminPage.value === 'orders') return 'Pedidos enviados para o WhatsApp.'
  return 'Ajuste disponibilidade, horários e produtos.'
})
const adminOrdersTotal = computed(() => savedOrders.value.length)
const adminOrdersToday = computed(() => {
  const today = new Date().toLocaleDateString('pt-BR')
  return savedOrders.value.filter((order) => new Date(order.createdAt).toLocaleDateString('pt-BR') === today).length
})
const adminOrdersByDay = computed(() => {
  const groups = savedOrders.value.reduce<Record<string, number>>((acc, order) => {
    const day = new Date(order.createdAt).toLocaleDateString('pt-BR')
    acc[day] = (acc[day] ?? 0) + 1
    return acc
  }, {})

  return Object.entries(groups).map(([day, count]) => ({ day, count }))
})

function getOrderItemImage(item: SavedOrder['items'][number]) {
  if (item.image) return item.image
  if (item.details.includes('180')) return pudding180Image
  if (item.details.includes('500')) return pudding500Image
  return pudding1kgImage
}

let deliveryDebounce: number | undefined
let latestDeliveryRequestId = 0

function resetDeliveryCalculation(status: DeliveryCalculationStatus = 'idle', message = '') {
  deliveryStatus.value = status
  deliveryMessage.value = message
  deliveryDistanceKm.value = null
  deliveryFee.value = null
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
    city.value = cepAddress.city || city.value || 'Goiânia'
    state.value = cepAddress.state || state.value || 'GO'
    deliveryStatus.value = 'address-found'
    deliveryMessage.value = 'Endereço encontrado. Informe o número para calcular a entrega.'
  } catch {
    resetDeliveryCalculation('address-not-found', 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.')
  }
}

async function calculateDeliveryFee() {
  if (deliveryMode.value !== 'entrega') {
    resetDeliveryCalculation('idle')
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
    const fee = getDeliveryFee(roundedDistance)
    deliveryDistanceKm.value = roundedDistance
    deliveryFee.value = fee

    if (fee === null) {
      deliveryStatus.value = 'outside-area'
      deliveryMessage.value = 'Esse endereço está um pouco mais distante. Fale com a gente pelo WhatsApp para verificarmos a entrega.'
      return
    }

    deliveryStatus.value = 'available'
    deliveryMessage.value = `Entrega disponível • aproximadamente ${formatDistance(roundedDistance)}`
  } catch {
    resetDeliveryCalculation('error', 'Não foi possível calcular a entrega agora. Confira o endereço ou tente novamente.')
  }
}

watch([deliveryMode, cep, address, number, neighborhood, city, state], () => {
  window.clearTimeout(deliveryDebounce)

  if (deliveryMode.value !== 'entrega') {
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

const whatsappUrl = computed(() => {
  const observation = notes.value.trim() || 'Sem observações.'
  const orderNumber = String(Date.now()).slice(-8)
  const separator = '------------------------------'
  const itemsSummary = cartItems.value
    .map((item, index) =>
      [
        `*${index + 1}. Pudim ${flavorLabels[item.flavor]}*`,
        `Tipo: ${typeLabels[item.puddingType]}`,
        `Tamanho: ${sizeLabels[item.size]}`,
        `Quantidade: ${item.quantity}`,
        item.promotionLabel ? `Promoção: ${item.promotionLabel}` : '',
        item.originalUnitPrice ? `Valor original: ${formatCurrency(item.originalUnitPrice)}` : '',
        `Valor unitário: ${formatCurrency(item.unitPrice)}`,
        `Subtotal: ${formatCurrency(item.total)}`,
      ].filter(Boolean).join('\n'),
    )
    .join(`\n${separator}\n`)

  const deliveryBlock =
    deliveryMode.value === 'entrega'
      ? [
          '*Forma de entrega:* Entrega',
          deliveryDetails.value,
          deliveryDistanceLabel.value && `*Distância aproximada:* ${deliveryDistanceLabel.value}`,
          `*Taxa de entrega:* ${deliveryFeeLabel.value}`,
        ].filter(Boolean).join('\n')
      : `*Forma de entrega:* Retirada — grátis\n${deliveryDetails.value}`

  const message = `Oi! Quero fazer este pedido \n\n*Meu pedido #${orderNumber}*\n\n${itemsSummary}\n${separator}\n\n*Nome:* ${customerName.value.trim()}\n\n${separator}\n*Tipo de pedido:* ${orderModeLabel.value}\n*Data desejada:* ${formatDate(effectiveDesiredDate.value)}\n\n${separator}\n${deliveryBlock}\n\n${separator}\n*Observações:* ${observation}\n\n${separator}\n*Subtotal:* ${formatCurrency(subtotal.value)}\n*Entrega:* ${deliveryFeeLabel.value}\n*Valor Total:* ${formatCurrency(total.value)}\n\nAguardo a confirmação da disponibilidade do pedido.\n\nObrigado!`

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
})

function handleSubmit() {
  triedSubmit.value = true
  if (!areCustomerDetailsValid.value) {
    return
  }
  saveCurrentOrder()
  window.open(whatsappUrl.value, '_blank', 'noopener,noreferrer')
}

function scrollToElement(target: HTMLElement | null) {
  window.setTimeout(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 120)
}

function openStartPage() {
  currentPage.value = 'start'
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
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
  currentPage.value = 'details'
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 40)
}

function openCheckoutPage() {
  if (!itemAdded.value) return
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

  cartItems.value.push({
    id: Date.now(),
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

function removeCartItem(itemId: number) {
  cartItems.value = cartItems.value.filter((item) => item.id !== itemId)
  if (!cartItems.value.length) {
    openOrderPage(sizeSection.value)
  }
}

function confirmDetails() {
  triedSubmit.value = true
  if (!areCustomerDetailsValid.value) return
  openCheckoutPage()
}



function loadSavedOrders() {
  try {
    const stored = window.localStorage.getItem(ordersStorageKey)
    const storedOrders = stored ? JSON.parse(stored) as SavedOrder[] : []
    const storedIds = new Set(storedOrders.map((order) => order.id))
    savedOrders.value = [
      ...storedOrders,
      ...initialSavedOrders.filter((order) => !storedIds.has(order.id)),
    ]
    persistSavedOrders()
  } catch {
    savedOrders.value = [...initialSavedOrders]
    persistSavedOrders()
  }
}

function persistSavedOrders() {
  window.localStorage.setItem(ordersStorageKey, JSON.stringify(savedOrders.value))
}

function saveCurrentOrder() {
  const orderId = String(Date.now()).slice(-8)
  const order: SavedOrder = {
    id: orderId,
    createdAt: new Date().toISOString(),
    customerName: customerName.value.trim(),
    orderMode: orderModeLabel.value,
    desiredDate: formatDate(effectiveDesiredDate.value),
    deliveryMode: deliveryMode.value,
    deliveryDetails: deliveryDetails.value,
    deliveryFee: deliveryMode.value === 'entrega' ? deliveryFee.value : 0,
    deliveryFeeLabel: deliveryFeeLabel.value,
    deliveryDistanceKm: deliveryDistanceKm.value,
    subtotal: subtotal.value,
    total: total.value,
    notes: notes.value.trim(),
    items: cartItems.value.map((item) => ({
      name: `Pudim ${flavorLabels[item.flavor]}`,
      details: `${typeLabels[item.puddingType]} • ${sizeLabels[item.size]}`,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      promotionLabel: item.promotionLabel,
      image: item.image,
    })),
  }

  savedOrders.value = [order, ...savedOrders.value].slice(0, 100)
  persistSavedOrders()
}

function clearSavedOrders() {
  savedOrders.value = []
  persistSavedOrders()
  adminError.value = 'Pedidos apagados.'
}

function removeSavedOrder(orderId: string) {
  savedOrders.value = savedOrders.value.filter((order) => order.id !== orderId)
  persistSavedOrders()
  adminError.value = `Pedido #${orderId} removido.`
}

function saveAdminConfig() {
  window.localStorage.setItem(appConfigStorageKey, JSON.stringify(appConfig.value))
  adminError.value = 'Configurações salvas.'
}

function resetAdminConfig() {
  appConfig.value = cloneConfig()
  window.localStorage.removeItem(appConfigStorageKey)
  adminError.value = 'Configurações restauradas.'
}

function loginAdmin() {
  if (adminUser.value === adminCredentials.user && adminPassword.value === adminCredentials.password) {
    adminLoggedIn.value = true
    window.localStorage.setItem(adminSessionStorageKey, adminCredentials.user)
    adminError.value = ''
    return
  }
  adminError.value = 'Login ou senha inválidos.'
}

function logoutAdmin() {
  adminLoggedIn.value = false
  adminPassword.value = ''
  window.localStorage.removeItem(adminSessionStorageKey)
}

onMounted(() => {
  appConfig.value = loadStoredConfig()
  loadSavedOrders()
  adminMode.value = new URLSearchParams(window.location.search).get('admin') === 'true'
  const storedAdminSession = window.localStorage.getItem(adminSessionStorageKey)
  if (adminMode.value && storedAdminSession === adminCredentials.user) {
    adminUser.value = adminCredentials.user
    adminLoggedIn.value = true
  }
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
    <section v-if="!adminLoggedIn" class="admin-login-page">
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
          <span>Login</span>
          <input v-model="adminUser" type="text" autocomplete="username" placeholder="admin" />
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
        <p v-if="adminError" class="error-text">{{ adminError }}</p>
        <button class="admin-primary-button" type="button" @click="loginAdmin">Entrar</button>
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
            <span>⌂</span> Dashboard
          </button>
          <button type="button" :class="{ active: adminPage === 'settings' }" @click="adminPage = 'settings'">
            <span>⚙</span> Configurações
          </button>
          <button type="button" :class="{ active: adminPage === 'orders' }" @click="adminPage = 'orders'">
            <span>▣</span> Pedidos
          </button>
        </nav>
        <div class="admin-sidebar__footer">
          <small>Logado como</small>
          <strong>{{ adminUser }}</strong>
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
          <div v-if="adminPage !== 'orders'" class="admin-save-row">
            <button class="admin-ghost-button" type="button" @click="resetAdminConfig">Restaurar</button>
            <button class="admin-primary-button" type="button" @click="saveAdminConfig">Salvar alterações</button>
          </div>
        </div>

        <p v-if="adminError" class="admin-feedback">{{ adminError }}</p>

        <template v-if="adminPage === 'dashboard'">
          <section class="admin-metrics-grid">
            <article class="admin-metric-card">
              <span>🍮</span>
              <div><strong>{{ adminTotalProducts }}</strong><small>Produtos cadastrados</small></div>
            </article>
            <article class="admin-metric-card">
              <span>✅</span>
              <div><strong>{{ adminAvailableProducts }}</strong><small>Disponíveis agora</small></div>
            </article>
            <article class="admin-metric-card">
              <span>🏷️</span>
              <div><strong>{{ adminPromotionProducts }}</strong><small>Itens em promoção</small></div>
            </article>
            <article class="admin-metric-card">
              <span>💰</span>
              <div><strong>{{ formatCurrency(adminAveragePrice) }}</strong><small>Preço médio normal</small></div>
            </article>
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
                <p>Lista dos pedidos salvos quando o cliente clica em enviar para o WhatsApp.</p>
              </div>
              <button class="admin-ghost-button" type="button" :disabled="!savedOrders.length" @click="clearSavedOrders">Limpar pedidos</button>
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
                <div><strong>{{ formatCurrency(savedOrders.reduce((sum, order) => sum + order.total, 0)) }}</strong><small>Total registrado</small></div>
              </article>
            </div>

            <div v-if="adminOrdersByDay.length" class="admin-orders-by-day">
              <span v-for="group in adminOrdersByDay" :key="group.day">{{ group.day }} • {{ group.count }} pedido(s)</span>
            </div>

            <div v-if="!savedOrders.length" class="admin-empty-orders">
              <strong>Nenhum pedido salvo ainda.</strong>
              <span>Quando um cliente finalizar pelo WhatsApp, o pedido aparece aqui.</span>
            </div>

            <div v-else class="admin-orders-list">
              <details v-for="order in savedOrders" :key="order.id" class="admin-order-card">
                <summary class="admin-order-card__summary">
                  <div>
                    <strong>Pedido #{{ order.id }}</strong>
                    <small>{{ new Date(order.createdAt).toLocaleString('pt-BR') }}</small>
                  </div>
                  <div>
                    <span>{{ order.customerName }}</span>
                    <small>{{ deliveryLabels[order.deliveryMode] }} • {{ order.desiredDate }}</small>
                  </div>
                  <b>{{ formatCurrency(order.total) }}</b>
                  <button class="admin-order-delete" type="button" @click.prevent="removeSavedOrder(order.id)">Excluir</button>
                  <i aria-hidden="true">⌄</i>
                </summary>

                <div class="admin-order-card__content">
                  <div class="admin-order-card__meta">
                    <div><small>Cliente</small><strong>{{ order.customerName }}</strong></div>
                    <div><small>Recebimento</small><strong>{{ deliveryLabels[order.deliveryMode] }}</strong></div>
                    <div><small>Data</small><strong>{{ order.desiredDate }}</strong></div>
                    <div><small>Entrega</small><strong>{{ order.deliveryFeeLabel }}</strong></div>
                  </div>

                  <div class="admin-order-items">
                    <div v-for="item in order.items" :key="`${order.id}-${item.name}-${item.details}`">
                      <img :src="getOrderItemImage(item)" alt="" />
                      <span>{{ item.quantity }}x {{ item.name }}</span>
                      <strong>{{ formatCurrency(item.total) }}</strong>
                      <small>{{ item.details }}<template v-if="item.promotionLabel"> • {{ item.promotionLabel }}</template></small>
                    </div>
                  </div>

                  <div class="admin-order-details">
                    <strong>Dados do pedido</strong>
                    <pre>{{ order.deliveryDetails }}</pre>
                    <p v-if="order.deliveryDistanceKm">Distância aproximada: {{ formatDistance(order.deliveryDistanceKm) }}</p>
                    <p v-if="order.notes">Observações: {{ order.notes }}</p>
                    <p>Subtotal: {{ formatCurrency(order.subtotal) }} • Total: {{ formatCurrency(order.total) }}</p>
                  </div>
                </div>
              </details>
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
              <button class="admin-primary-button" type="button" @click="saveAdminConfig">Salvar configurações</button>
            </aside>
          </div>
        </template>
        </div>
      </div>
    </section>  </main>


  <main v-else class="page-shell">
    <header class="site-header">
      <button v-if="currentPage !== 'order' && currentPage !== 'start'" class="back-button" type="button" aria-label="Voltar" @click="currentPage === 'checkout' ? openDetailsPage() : currentPage === 'details' ? openOrderPage() : openStartPage()">
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
        {{ currentPage === 'checkout' ? 'Finalizar pedido' : currentPage === 'details' ? 'Recebimento' : currentPage === 'order' ? 'Monte seu pedido' : promoQueryEnabled ? 'Oferta Especial' : 'Como pedir' }}
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
            <strong>R$ 7,99</strong>
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
                  <strong><span>7</span><sup>,99</sup></strong>
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
                  <strong><span>19</span><sup>,99</sup></strong>
                </div>
              </div>
              <b>500ml</b>
            </button>
          </div>

          <p class="promo-delivery-rule promo-delivery-rule--box">
            Pedido mínimo para delivery:<br />180ml: 4 unidades • 500ml: 2 unidades
          </p>
          <p class="promo-note">Preços promocionais para versões participantes. Consulte valores da opção Zero Lactose.</p>
          <p class="promo-urgency">{{ promotion.urgency }}</p>

          <button class="promo-cta promo-cta--pulse" type="button" @click="goToPromotionOrder">
            Quero Aproveitar a Promoção
          </button>
        </section>

        <section v-if="!promoQueryEnabled" class="panel start-panel">
          <div class="section-heading">
            <div>
              <h2>Como você quer pedir?</h2>
              <small>escolha a disponibilidade</small>
            </div>
          </div>

          <div class="option-grid">
            <button class="option-card start-option" type="button" :disabled="!isReadyDeliveryOpenNow" @click="selectOrderMode('ready')">
              <span class="option-card__icon start-icon start-icon--ready" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <path d="M27.5 4 12 25.5h11L19.5 44 36 20.5H24.8L27.5 4Z" />
                </svg>
              </span>
              <span class="option-card__content">
                <strong>Pronta entrega</strong>
                <small>{{ isReadyDeliveryOpenNow ? 'Quero receber/retirar hoje' : readyDeliveryUnavailableText }}</small>
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
                <small>Quero escolher uma data</small>
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
                <small>obrigatório 1</small>
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
                <small>obrigatório 1</small>
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
                <small>obrigatório 1</small>
              </div>
            </div>
            <SegmentedControl :model-value="puddingType" :options="typeOptions" @update:model-value="selectType" />
            <p class="help-text">A versão zero lactose é preparada com leite e leite condensado zero lactose.</p>
          </section>
        </div>
      </template>

      <template v-else-if="currentPage === 'details'">
        <section v-if="itemAdded" ref="cartSection" class="panel cart-panel">
          <div class="section-heading">
            <div>
              <h2>Como você quer receber?</h2>
              <small>data, retirada ou entrega</small>
            </div>
          </div>

          <div class="cart-form">
            <label class="field">
              <span>Nome</span>
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

            <label v-if="orderMode === 'scheduled'" class="field">
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
            <div v-else class="ready-date-note">
              <span>Pronta entrega</span>
              <strong>Receber/retirar hoje, {{ formatDate(todayIso) }}</strong>
            </div>
            <p v-if="dateError" id="date-error" class="error-text">{{ dateError }}</p>

            <div>
              <span class="field-label">Forma de entrega</span>
              <SegmentedControl v-model="deliveryMode" :options="deliveryOptions" />
            </div>

            <div v-if="deliveryMode === 'retirada'" class="pickup-note">
              <span>Local de retirada</span>
              <strong>{{ pickupLocation }}</strong>
            </div>

            <div v-if="deliveryMode === 'entrega'" class="delivery-fields">
              <label class="field">
                <span>CEP</span>
                <input
                  v-model="cep"
                  type="text"
                  inputmode="numeric"
                  autocomplete="postal-code"
                  placeholder="00000-000"
                  maxlength="9"
                  @blur="fillAddressByCep"
                />
              </label>
              <label class="field field--wide">
                <span>Endereço</span>
                <input v-model="address" type="text" autocomplete="street-address" placeholder="Rua, avenida ou alameda" />
              </label>
              <label class="field">
                <span>Número</span>
                <input v-model="number" type="text" inputmode="numeric" autocomplete="address-line2" placeholder="Nº" />
              </label>
              <label class="field">
                <span>Bairro</span>
                <input v-model="neighborhood" type="text" autocomplete="address-level2" />
              </label>
              <div class="delivery-city-row">
                <label class="field">
                  <span>Cidade</span>
                  <input v-model="city" type="text" autocomplete="address-level1" />
                </label>
                <label class="field">
                  <span>UF</span>
                  <input v-model="state" type="text" maxlength="2" autocomplete="address-level1" />
                </label>
              </div>
              <label class="field field--wide">
                <span>Complemento opcional</span>
                <input v-model="complement" type="text" placeholder="Apartamento, bloco, lote..." />
              </label>
              <label class="field field--wide">
                <span>Ponto de referência opcional</span>
                <input v-model="reference" type="text" placeholder="Próximo a..." />
              </label>

              <div
                v-if="deliveryMessage || deliveryFee !== null"
                class="delivery-status"
                :class="`delivery-status--${deliveryStatus}`"
              >
                <strong>{{ deliveryFeeLabel }}</strong>
                <span v-if="deliveryDistanceLabel">Entrega • aproximadamente {{ deliveryDistanceLabel }}</span>
                <small v-if="deliveryMessage">{{ deliveryMessage }}</small>
              </div>
              <p v-if="triedSubmit && deliveryMode === 'entrega' && !deliveryAddressComplete" class="error-text">
                Informe CEP, endereço, número, bairro, cidade e UF para calcular a entrega.
              </p>
              <p v-if="triedSubmit && deliveryMode === 'entrega' && deliveryAddressComplete && !canUseDeliveryCalculation" class="error-text">
                Calcule a entrega antes de continuar.
              </p>
            </div>

            <label class="field">
              <span>Observações</span>
              <textarea
                v-model="notes"
                rows="4"
                placeholder="Horário preferencial, restrições ou instruções para entrega."
              ></textarea>
            </label>

          </div>
        </section>
      </template>

      <template v-else>
        <section class="panel cart-panel">
          <div class="section-heading">
            <div>
              <h2>Finalizar pedido</h2>
              <small>confira antes de enviar</small>
            </div>
          </div>

          <div class="cart-items-list">
            <article v-for="item in cartItems" :key="item.id" class="cart-item cart-item--featured">
              <img :src="item.image" alt="" />
              <div>
                <strong>Pudim {{ flavorLabels[item.flavor] }}</strong>
                <small>{{ typeLabels[item.puddingType] }} • {{ sizeLabels[item.size] }} • {{ item.quantity }} unidade(s)</small>
                <em v-if="item.promotionLabel" class="cart-item__promo">{{ item.promotionLabel }}</em>
                <b><s v-if="item.originalUnitPrice">{{ formatCurrency(item.originalUnitPrice * item.quantity) }}</s>{{ formatCurrency(item.total) }}</b>
              </div>
              <button class="cart-item__remove" type="button" aria-label="Remover item" @click="removeCartItem(item.id)">
                Remover
              </button>
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
            :delivery="deliveryLabels[deliveryMode]"
            :subtotal="formatCurrency(subtotal)"
            :delivery-fee="deliveryFeeLabel"
            :delivery-distance="deliveryDistanceLabel"
            :delivery-note="deliveryStatus === 'outside-area' ? deliveryMessage : ''"
            :total="formatCurrency(total)"
          />
        </div>
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
        <button class="mobile-checkout__button" type="submit">
          Enviar pelo WhatsApp • {{ formatCurrency(total) }}
        </button>
      </div>

      <div v-if="currentPage === 'details' && itemAdded" class="mobile-checkout">
        <div>
          <small>{{ deliveryMode === 'entrega' && deliveryFee !== null ? 'Total com entrega' : 'Total estimado' }}</small>
          <strong>{{ formatCurrency(total) }}</strong>
        </div>
        <button class="mobile-checkout__button" type="button" @click="confirmDetails">
          Continuar
        </button>
      </div>
    </form>
  </main>
</template>
