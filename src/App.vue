<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  sizeLabels,
  type DeliveryMode,
  type Flavor,
  type PuddingType,
  type Size,
  typeLabels,
} from './data/prices'

const whatsappNumber = '5562992916364'

const flavor = ref<Flavor>('tradicional')
const puddingType = ref<PuddingType>('normal')
const size = ref<Size>('500ml')
const quantity = ref(1)
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
const itemAdded = ref(false)
const currentPage = ref<'order' | 'details' | 'checkout'>('order')
const flavorSection = ref<HTMLElement | null>(null)
const typeSection = ref<HTMLElement | null>(null)
const sizeSection = ref<HTMLElement | null>(null)
const cartSection = ref<HTMLElement | null>(null)
const summarySection = ref<HTMLElement | null>(null)

const loadingPhrases = ['produção artesanal', 'Sob encomenda e pronta entrega', 'feito com calma e carinho']

const todayIso = computed(() => new Date().toISOString().slice(0, 10))
const maxDateIso = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().slice(0, 10)
})
const unitPrice = computed(() => prices[puddingType.value][flavor.value][size.value])
const total = computed(() => unitPrice.value * quantity.value)
function getDateError() {
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
const areCustomerDetailsValid = computed(() => isDateValid.value && !customerNameError.value)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (value: string) => {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
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
const canShowAddButton = computed(() => currentPage.value === 'order')
const canShowSendButton = computed(() => currentPage.value === 'checkout' && itemAdded.value)
const cartQuantity = computed(() => (itemAdded.value ? quantity.value : 0))

const deliveryDetails = computed(() => {
  if (deliveryMode.value === 'retirada') return ''

  const details = [
    neighborhood.value && `Bairro: ${neighborhood.value}`,
    address.value && `Endereço: ${address.value}`,
    number.value && `Número: ${number.value}`,
    complement.value && `Complemento: ${complement.value}`,
  ].filter(Boolean)

  return details.length ? `\n${details.join('\n')}` : '\nEndereço a combinar.'
})

const whatsappUrl = computed(() => {
  const observation = notes.value.trim() || 'Sem observações.'
const message = `Olá! Quero fazer uma encomenda na Peraí, tem pudim! 🍮

Nome: ${customerName.value.trim()}
Sabor: ${flavorLabels[flavor.value]}
Tipo: ${typeLabels[puddingType.value]}
Tamanho: ${sizeLabels[size.value]}
Quantidade: ${quantity.value}
Valor unitário: ${formatCurrency(unitPrice.value)}
Total estimado: ${formatCurrency(total.value)}
Data desejada: ${formatDate(desiredDate.value)}
Forma de recebimento: ${deliveryLabels[deliveryMode.value]}${deliveryDetails.value}

Observações:
${observation}`

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
})

function handleSubmit() {
  triedSubmit.value = true
  if (!areCustomerDetailsValid.value) return
  window.open(whatsappUrl.value, '_blank', 'noopener,noreferrer')
}

function scrollToElement(target: HTMLElement | null) {
  window.setTimeout(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 120)
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

function selectFlavor(nextFlavor: Flavor) {
  flavor.value = nextFlavor
  scrollToElement(typeSection.value)
}

function selectType(nextType: PuddingType) {
  puddingType.value = nextType
  scrollToElement(sizeSection.value)
}

function selectSize(nextSize: Size) {
  size.value = nextSize
}

function addToCart() {
  itemAdded.value = true
  triedSubmit.value = false
  openDetailsPage()
}

function confirmDetails() {
  triedSubmit.value = true
  if (!areCustomerDetailsValid.value) return
  openCheckoutPage()
}

onMounted(() => {
  const phraseTimer = window.setInterval(() => {
    loadingPhraseIndex.value = (loadingPhraseIndex.value + 1) % loadingPhrases.length
  }, 760)

  window.setTimeout(() => {
    isLoading.value = false
    window.clearInterval(phraseTimer)
    openOrderPage(flavorSection.value)
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
      <button v-if="currentPage !== 'order'" class="back-button" type="button" aria-label="Voltar" @click="currentPage === 'checkout' ? openDetailsPage() : openOrderPage()">
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
        {{ currentPage === 'checkout' ? 'Finalizar pedido' : currentPage === 'details' ? 'Recebimento' : 'Monte seu pedido' }}
      </strong>
      <button class="cart-icon-button" type="button" aria-label="Ver carrinho" :disabled="!itemAdded" @click="openDetailsPage">
        <span aria-hidden="true">▢</span>
        <b v-if="cartQuantity">{{ cartQuantity }}</b>
      </button>
    </header>

    <form class="order-layout" @submit.prevent="handleSubmit">
      <template v-if="currentPage === 'order'">
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
                :price="`a partir de ${formatCurrency(prices.normal.tradicional[option.value])}`"
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
            <p v-if="dateError" id="date-error" class="error-text">{{ dateError }}</p>

            <div>
              <span class="field-label">Forma de recebimento</span>
              <SegmentedControl v-model="deliveryMode" :options="deliveryOptions" />
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

          <article class="cart-item cart-item--featured">
            <img :src="selectedSizeImage" alt="" />
            <div>
              <strong>Pudim {{ flavorLabels[flavor] }}</strong>
              <small>{{ typeLabels[puddingType] }} • {{ sizeLabels[size] }} • {{ quantity }} unidade(s)</small>
              <b>{{ formatCurrency(total) }}</b>
            </div>
          </article>
        </section>

        <div ref="summarySection" class="summary-column">
          <OrderSummary
            :customer-name="customerName"
            :flavor="flavorLabels[flavor]"
            :type="typeLabels[puddingType]"
            :size="sizeLabels[size]"
            :quantity="quantity"
            :unit-price="formatCurrency(unitPrice)"
            :subtotal="formatCurrency(total)"
            :date="formatDate(desiredDate)"
            :delivery="deliveryLabels[deliveryMode]"
            :total="formatCurrency(total)"
          />
        </div>
      </template>

      <div v-if="canShowAddButton" class="mobile-checkout mobile-checkout--add">
        <QuantityStepper v-model="quantity" :min="1" :max="20" />
        <button class="mobile-checkout__button" type="button" @click="addToCart">
          Adicionar • {{ formatCurrency(total) }}
        </button>
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
