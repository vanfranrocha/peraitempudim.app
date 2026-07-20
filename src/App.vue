<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import OptionCard from './components/OptionCard.vue'
import OrderSummary from './components/OrderSummary.vue'
import QuantityStepper from './components/QuantityStepper.vue'
import SegmentedControl from './components/SegmentedControl.vue'
import pudding1kgImage from './images/1kg.png'
import pudding180Image from './images/180.png'
import pudding500Image from './images/500ml.png'
import logoImage from './images/logo.png'
import {
  deliveryLabels,
  flavorLabels,
  prices,
  promotion,
  sizeLabels,
  type DeliveryMode,
  type Flavor,
  type PuddingType,
  type Size,
  typeLabels,
} from './data/prices'

const whatsappNumber = '5563992916364'

type OrderMode = 'ready' | 'scheduled'

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

const flavor = ref<Flavor>('tradicional')
const puddingType = ref<PuddingType>('normal')
const size = ref<Size>('500ml')
const quantity = ref(1)
const orderMode = ref<OrderMode | null>(null)
const customerName = ref('')
const desiredDate = ref('')
const deliveryMode = ref<DeliveryMode>('retirada')
const neighborhood = ref('')
const address = ref('')
const number = ref('')
const complement = ref('')
const notes = ref('')
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
const total = computed(() => cartItems.value.reduce((sum, item) => sum + item.total, 0))
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
const pickupLocation = 'Setor Faiçalville, próximo ao Sesc Faiçalville'

const selectedPromotionalMinimum = computed(() => getPromotionalProduct(puddingType.value, flavor.value, size.value)?.minimumDeliveryQuantity ?? 1)
const selectedPromotionalMinimumError = computed(() => {
  if (!selectedPromotionLabel.value || quantity.value >= selectedPromotionalMinimum.value) return ''
  return `Promoção ${sizeLabels[size.value]}: mínimo de ${selectedPromotionalMinimum.value} unidades.`
})

const areCustomerDetailsValid = computed(() => isDateValid.value && !customerNameError.value)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (value: string) => {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function getPromotionProductKey(type: PuddingType, selectedFlavor: Flavor, selectedSize: Size) {
  if (!promotion.active || !promoQueryEnabled.value) return null
  const key = `${type}_${selectedFlavor}_${selectedSize}` as keyof typeof promotion.products
  return key in promotion.products ? key : null
}

function getPromotionalProduct(type: PuddingType, selectedFlavor: Flavor, selectedSize: Size) {
  const key = getPromotionProductKey(type, selectedFlavor, selectedSize)
  return key ? promotion.products[key] : null
}

function getEffectivePrice(type: PuddingType, selectedFlavor: Flavor, selectedSize: Size) {
  return getPromotionalProduct(type, selectedFlavor, selectedSize)?.promotionalPrice ?? prices[type][selectedFlavor][selectedSize]
}


function getSizeOriginalPrice(selectedSize: Size) {
  return getPromotionalProduct('normal', 'tradicional', selectedSize)?.originalPrice
}

function getSizePromotionalPrice(selectedSize: Size) {
  return getPromotionalProduct('normal', 'tradicional', selectedSize)?.promotionalPrice
}

function getSizePriceLabel(selectedSize: Size) {
  if (promoQueryEnabled.value && promotion.active && getSizePromotionalPrice(selectedSize)) return 'promoção pronta entrega'
  return `a partir de ${formatCurrency(prices.normal.tradicional[selectedSize])}`
}

const flavorOptions = [
  {
    value: 'tradicional' as const,
    title: 'Tradicional',
    description: 'Clássico, cremoso e com calda de caramelo.',
    icon: '🍮',
  },
  {
    value: 'cafe' as const,
    title: 'Café',
    description: 'Sabor equilibrado, com toque de café e calda especial.',
    icon: '☕',
  },
]

const sizeOptions = [
  { value: '180ml' as const, title: '180 ml', description: 'Porção individual', image: pudding180Image },
  { value: '500ml' as const, title: '500 ml', description: 'Ideal para compartilhar', image: pudding500Image },
  { value: '1kg' as const, title: '1 kg', description: 'Perfeito para família ou encontros', image: pudding1kgImage },
]

const typeOptions = [
  { label: 'Normal', value: 'normal' as const },
  { label: 'Zero lactose', value: 'zero' as const },
]

const deliveryOptions = [
  { label: 'Retirada', value: 'retirada' as const },
  { label: 'Entrega', value: 'entrega' as const },
]

const selectedSizeImage = computed(() => sizeOptions.find((option) => option.value === size.value)?.image ?? pudding500Image)
const orderModeLabel = computed(() => (orderMode.value === 'ready' ? 'Pronta entrega' : 'Encomenda'))
const canShowAddButton = computed(() => currentPage.value === 'order')
const canShowSendButton = computed(() => currentPage.value === 'checkout' && itemAdded.value)
const itemAdded = computed(() => cartItems.value.length > 0)
const cartQuantity = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0))

const deliveryDetails = computed(() => {
  if (deliveryMode.value === 'retirada') return `Local de retirada: ${pickupLocation}`

  const details = [
    neighborhood.value && `Bairro: ${neighborhood.value}`,
    address.value && `Endereço: ${address.value}`,
    number.value && `Número: ${number.value}`,
    complement.value && `Complemento: ${complement.value}`,
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
      ? `*Forma de recebimento:* Entrega\n${deliveryDetails.value}\n*Taxa de entrega:* A confirmar`
      : `*Forma de recebimento:* Retirada\n${deliveryDetails.value}`

  const message = `*Meu pedido #${orderNumber}*\n\n${itemsSummary}\n${separator}\n\n*Nome:* ${customerName.value.trim()}\n\n${separator}\n*Tipo de pedido:* ${orderModeLabel.value}\n*Data desejada:* ${formatDate(effectiveDesiredDate.value)}\n\n${separator}\n${deliveryBlock}\n\n${separator}\n*Observações:* ${observation}\n\n${separator}\n*Subtotal:* ${formatCurrency(total.value)}\n*Valor Total:* ${formatCurrency(total.value)}\n\nAguardo a confirmação da disponibilidade do pedido.\n\nObrigado!`

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
})

function handleSubmit() {
  triedSubmit.value = true
  if (!areCustomerDetailsValid.value) {
    return
  }
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
  quantity.value = nextSize === '180ml' ? promotion.products.normal_tradicional_180ml.minimumDeliveryQuantity : promotion.products.normal_tradicional_500ml.minimumDeliveryQuantity
  openOrderPage(flavorSection.value)
}

function selectOrderMode(nextMode: OrderMode) {
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
  if (selectedPromotionalMinimumError.value) return

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

onMounted(() => {
  promoQueryEnabled.value = new URLSearchParams(window.location.search).get('promo') === 'true'
  shouldHighlightPromotion.value = promoQueryEnabled.value

  const phraseTimer = window.setInterval(() => {
    loadingPhraseIndex.value = (loadingPhraseIndex.value + 1) % loadingPhrases.length
  }, 760)

  window.setTimeout(() => {
    isLoading.value = false
    window.clearInterval(phraseTimer)
    openStartPage()
    if (shouldHighlightPromotion.value && promotion.active) {
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

  <main class="page-shell">
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
            <button class="option-card start-option" type="button" @click="selectOrderMode('ready')">
              <span class="option-card__icon" aria-hidden="true">⚡</span>
              <span class="option-card__content">
                <strong>Pronta entrega</strong>
                <small>Quero receber/retirar hoje</small>
              </span>
            </button>

            <button class="option-card start-option" type="button" @click="selectOrderMode('scheduled')">
              <span class="option-card__icon" aria-hidden="true">📅</span>
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
              <span class="field-label">Forma de recebimento</span>
              <SegmentedControl v-model="deliveryMode" :options="deliveryOptions" />
            </div>

            <div v-if="deliveryMode === 'retirada'" class="pickup-note">
              <span>Local de retirada</span>
              <strong>{{ pickupLocation }}</strong>
            </div>

            <div v-if="deliveryMode === 'entrega'" class="delivery-fields">
              <label class="field">
                <span>Bairro</span>
                <input v-model="neighborhood" type="text" autocomplete="address-level2" />
              </label>
              <label class="field field--wide">
                <span>Endereço</span>
                <input v-model="address" type="text" autocomplete="street-address" />
              </label>
              <label class="field">
                <span>Número</span>
                <input v-model="number" type="text" inputmode="numeric" autocomplete="address-line2" />
              </label>
              <label class="field field--wide">
                <span>Complemento opcional</span>
                <input v-model="complement" type="text" />
              </label>
              <p class="notice">O valor da entrega será confirmado conforme o endereço.</p>
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
            :total="formatCurrency(total)"
          />
        </div>
      </template>

      <div v-if="canShowAddButton" class="mobile-checkout mobile-checkout--add">
        <small v-if="selectedPromotionalMinimumError" class="minimum-inline-error">{{ selectedPromotionalMinimumError }}</small>
        <div class="mobile-checkout__quantity-row">
          <QuantityStepper v-model="quantity" :min="1" :max="20" />
          <button class="mobile-checkout__button" type="button" :disabled="Boolean(selectedPromotionalMinimumError)" @click="addToCart">
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
          <small>Total estimado</small>
          <strong>{{ formatCurrency(total) }}</strong>
        </div>
        <button class="mobile-checkout__button" type="button" @click="confirmDetails">
          Continuar
        </button>
      </div>
    </form>
  </main>
</template>
