<script setup lang="ts">
defineProps<{
  customerName: string
  items: Array<{
    id: number
    name: string
    details: string
    quantity: number
    unitPrice: string
    subtotal: string
  }>
  date: string
  time?: string
  delivery: string
  subtotal: string
  deliveryFee: string
  deliveryDistance?: string
  deliveryNote?: string
  total: string
}>()
</script>

<template>
  <aside class="summary-card" aria-label="Resumo do pedido">
    <div class="summary-card__header">
      <span>Resumo</span>
      <strong>{{ total }}</strong>
    </div>

    <dl>
      <div>
        <dt>Nome</dt>
        <dd>{{ customerName || 'Não informado' }}</dd>
      </div>
      <div v-for="item in items" :key="item.id" class="summary-card__item">
        <dt>{{ item.name }}</dt>
        <dd>
          {{ item.details }}<br />
          {{ item.quantity }} x {{ item.unitPrice }}<br />
          {{ item.subtotal }}
        </dd>
      </div>
      <div>
        <dt>Data desejada</dt>
        <dd>{{ date || 'Não informada' }}</dd>
      </div>
      <div v-if="time">
        <dt>Horário desejado</dt>
        <dd>{{ time }}</dd>
      </div>
      <div>
        <dt>Recebimento</dt>
        <dd>{{ delivery }}</dd>
      </div>
      <div>
        <dt>Produtos</dt>
        <dd>{{ subtotal }}</dd>
      </div>
      <div>
        <dt>Entrega</dt>
        <dd>
          {{ deliveryFee }}
          <small v-if="deliveryDistance">Entrega • aproximadamente {{ deliveryDistance }}</small>
          <small v-if="deliveryNote">{{ deliveryNote }}</small>
        </dd>
      </div>
      <div class="summary-card__total">
        <dt>Total</dt>
        <dd>{{ total }}</dd>
      </div>
    </dl>
  </aside>
</template>
