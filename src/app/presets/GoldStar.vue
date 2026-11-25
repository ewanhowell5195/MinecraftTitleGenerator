<script setup>
  import Icon from "#c/Icon.vue"

  defineProps({
    size: { type: Number, required: true }
  })
</script>

<template>
  <Icon class="gold-star" name="star" :size="size" />
</template>

<style scoped>
  .gold-star :deep(path) {
    fill: var(--gold);
    stroke: none;
  }
</style>
