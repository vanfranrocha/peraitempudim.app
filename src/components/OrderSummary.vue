<script setup lang="ts">
defineProps<{
  customerName: string
  flavor: string
  type: string
  size: string
  quantity: number
  unitPrice: string
  subtotal: string
  date: string
  delivery: string
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
      <div>
        <dt>Sabor</dt>
        <dd>{{ flavor }}</dd>
      </div>
      <div>
        <dt>Tipo</dt>
        <dd>{{ type }}</dd>
      </div>
      <div>
        <dt>Tamanho</dt>
        <dd>{{ size }}</dd>
      </div>
      <div>
        <dt>Quantidade</dt>
        <dd>{{ quantity }}</dd>
      </div>
      <div>
        <dt>Valor unitário</dt>
        <dd>{{ unitPrice }}</dd>
      </div>
      <div>
        <dt>Subtotal</dt>
        <dd>{{ subtotal }}</dd>
      </div>
      <div>
        <dt>Data desejada</dt>
        <dd>{{ date || 'Não informada' }}</dd>
      </div>
      <div>
        <dt>Recebimento</dt>
        <dd>{{ delivery }}</dd>
      </div>
    </dl>
  </aside>
</template>
