<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  status: string
  fulfillmentType: 'pickup' | 'delivery'
}>()

type TimelineState = 'done' | 'current' | 'upcoming' | 'cancelled'

const normalSteps = [
  { key: 'received', label: 'Pedido recebido' },
  { key: 'pending', label: 'Aguardando confirmação' },
  { key: 'preparing', label: 'Em produção' },
  { key: 'ready', label: 'Pronto' },
  { key: 'out_for_delivery', label: 'Saiu para entrega' },
  { key: 'completed', label: 'Finalizado' },
]

const statusOrder = ['received', 'pending', 'preparing', 'ready', 'out_for_delivery', 'completed']

const steps = computed(() =>
  normalSteps.filter((step) => props.fulfillmentType === 'delivery' || step.key !== 'out_for_delivery'),
)

const currentKey = computed(() => {
  if (props.status === 'confirmed') return 'pending'
  if (props.status === 'cancelled') return 'cancelled'
  if (statusOrder.includes(props.status)) return props.status
  return 'pending'
})

function getStepState(key: string): TimelineState {
  if (currentKey.value === 'cancelled') return 'cancelled'
  if (key === currentKey.value) return 'current'
  const currentIndex = statusOrder.indexOf(currentKey.value)
  const stepIndex = statusOrder.indexOf(key)
  return stepIndex < currentIndex ? 'done' : 'upcoming'
}
</script>

<template>
  <div class="order-status-timeline" aria-label="Acompanhamento do pedido">
    <template v-if="currentKey === 'cancelled'">
      <div class="order-status-timeline__cancelled">
        <span aria-hidden="true">×</span>
        <strong>Pedido cancelado</strong>
      </div>
    </template>

    <ol v-else>
      <li
        v-for="step in steps"
        :key="step.key"
        :class="`is-${getStepState(step.key)}`"
      >
        <span aria-hidden="true"></span>
        <strong>{{ step.label }}</strong>
      </li>
    </ol>
  </div>
</template>
