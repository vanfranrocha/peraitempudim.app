<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: 'pudding' | 'coffee'
  image?: string
  price?: string
  originalPrice?: string
  promotionalPrice?: string
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
    <span v-if="icon" class="option-card__icon" :class="`option-card__icon--${icon}`" aria-hidden="true">
      <svg v-if="icon === 'pudding'" viewBox="0 0 64 64" focusable="false">
        <path class="icon-plate" d="M9 47c3.5 5.8 42.5 5.8 46 0" />
        <path class="icon-plate" d="M7 43c0 6.2 50 6.2 50 0 0-3.8-8.1-6.4-14.8-7.5" />
        <path class="icon-pudding" d="M17 15c1-5.4 4.7-8 10-8h10c5.3 0 9 2.6 10 8l5.2 27.1C53.7 50 10.3 50 11.8 42.1L17 15Z" />
        <path class="icon-sauce" d="M18.6 19.1c4.4.2 6.9 3.1 6.9 7.1v6.1c0 5.1 7 5.4 7 .2v-5.4c0-7.9 11.1-8 11.1-.1v7.6c0 5.4 7.5 5.4 7.5.1" />
      </svg>
      <svg v-else viewBox="0 0 64 64" focusable="false">
        <path class="icon-steam" d="M24 9c-3 4.2 3 5.8 0 10M32 9c-3 4.2 3 5.8 0 10M40 9c-3 4.2 3 5.8 0 10" />
        <path class="icon-cup" d="M15 25h31l-2.2 13.5C42.8 45 37.4 49 31 49h-1c-6.4 0-11.8-4-12.8-10.5L15 25Z" />
        <path class="icon-cup" d="M46 29h3c4 0 6 2.4 5.2 6.2-.8 3.9-3.5 6-7.8 6h-3" />
        <path class="icon-saucer" d="M16 50c2.8 4.2 29.2 4.2 32 0" />
        <path class="icon-saucer" d="M12 47h40" />
      </svg>
    </span>
    <span class="option-card__content">
      <strong>{{ title }}</strong>
      <small>{{ description }}</small>
      <span v-if="promotionalPrice" class="option-card__promo-price">
        <small>{{ price }}</small>
        <span>
          <s v-if="originalPrice">{{ originalPrice }}</s>
          <em>{{ promotionalPrice }}</em>
        </span>
      </span>
      <em v-else-if="price">{{ price }}</em>
    </span>
  </button>
</template>
