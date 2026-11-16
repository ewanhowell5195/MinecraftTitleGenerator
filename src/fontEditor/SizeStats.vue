<script setup>
  import { TARGET_PIXEL_HEIGHT } from "../lib/font/editor/defaults.js"

  defineProps({
    pixels: { type: [Number, String], default: "" }
  })
</script>

<template>
  <div class="stat">
    <span class="stat-label">Pixel height</span>
    <span class="stat-value">{{ pixels }}</span>
  </div>
  <div class="stat">
    <span class="stat-label">Target pixel height</span>
    <span class="stat-value">{{ TARGET_PIXEL_HEIGHT[0] }} to {{ TARGET_PIXEL_HEIGHT[1] }}</span>
  </div>
</template>

<style scoped>
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: var(--font-sm);
    color: var(--muted);
  }

  .stat-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
  }
</style>
