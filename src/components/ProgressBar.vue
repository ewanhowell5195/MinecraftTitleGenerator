<script setup>
  defineProps({
    value: { type: Number, required: true }
  })
</script>

<template>
  <div class="progress-bar" role="progressbar" :aria-valuenow="Math.round(value * 100)" aria-valuemin="0" aria-valuemax="100">
    <div class="fill" :style="{ width: `${value * 100}%` }"></div>
  </div>
</template>

<style scoped>
  .progress-bar {
    height: 8px;
    background: var(--field);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
  }
</style>
