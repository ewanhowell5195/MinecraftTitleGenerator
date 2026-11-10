<script setup>
  import { computed } from "vue"

  const props = defineProps({
    min: { type: Number, default: null },
    columns: { type: Number, default: 3 },
    small: { type: Boolean, default: false }
  })

  const style = computed(() => ({ "--tile-columns": props.min ? `repeat(auto-fill, minmax(${props.min}px, 1fr))` : `repeat(${props.columns}, minmax(0, 1fr))` }))
</script>

<template>
  <div class="tile-grid" :class="{ small }" :style="style">
    <slot></slot>
  </div>
</template>

<style scoped>
  .tile-grid {
    display: grid;
    grid-template-columns: var(--tile-columns);
    gap: 8px;
  }

  .tile-grid.small {
    gap: 4px;
  }
</style>
