<script setup lang="ts" generic="T extends string">
defineProps<{
  options: Array<{ label: string; value: T }>
  modelValue: T
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()
</script>

<template>
  <div class="segmented-control">
    <button
      v-for="option in options"
      :key="option.value"
      class="segmented-control__button"
      :class="{ 'segmented-control__button--active': option.value === modelValue }"
      type="button"
      :aria-pressed="option.value === modelValue"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
