<script setup lang="ts" generic="T extends string">
defineProps<{
  options: Array<{ label: string; value: T; icon?: 'pickup' | 'delivery' }>
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
      <span v-if="option.icon" class="segmented-control__icon" aria-hidden="true">
        <svg v-if="option.icon === 'pickup'" viewBox="0 0 48 48" focusable="false">
          <path d="M13 20h22l-2 19H15L13 20Z" />
          <path d="M18 20v-2a6 6 0 0 1 12 0v2" />
          <path d="M17 28h14" />
        </svg>
        <svg v-else viewBox="0 0 48 48" focusable="false">
          <path d="M8 17h22v18H8V17Z" />
          <path d="M30 23h6l4 5v7H30V23Z" />
          <path d="M14 35a4 4 0 1 0 8 0M32 35a4 4 0 1 0 8 0" />
          <path d="M13 13h13" />
        </svg>
      </span>
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>
