<script setup lang="ts">
const props = defineProps<{
  modelValue: number
  min?: number
  max?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const minValue = props.min ?? 1
const maxValue = props.max ?? 20

function update(nextValue: number) {
  emit('update:modelValue', Math.min(maxValue, Math.max(minValue, nextValue)))
}
</script>

<template>
  <div class="quantity-stepper" role="group" aria-label="Quantidade">
    <button
      type="button"
      aria-label="Diminuir quantidade"
      :disabled="modelValue <= minValue"
      @click="update(modelValue - 1)"
    >
      -
    </button>
    <output aria-live="polite">{{ modelValue }}</output>
    <button
      type="button"
      aria-label="Aumentar quantidade"
      :disabled="modelValue >= maxValue"
      @click="update(modelValue + 1)"
    >
      +
    </button>
  </div>
</template>
