<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: string
  image?: string
  price?: string
  selected?: boolean
}>()

defineEmits<{
  select: []
}>()
</script>

<template>
  <button
    class="option-card"
    :class="{ 'option-card--selected': selected }"
    type="button"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span v-if="image" class="option-card__image-wrap" aria-hidden="true">
      <img class="option-card__image" :src="image" :alt="title" />
    </span>
    <span v-if="icon" class="option-card__icon" aria-hidden="true">{{ icon }}</span>
    <span class="option-card__content">
      <strong>{{ title }}</strong>
      <small>{{ description }}</small>
      <em v-if="price">{{ price }}</em>
    </span>
  </button>
</template>
