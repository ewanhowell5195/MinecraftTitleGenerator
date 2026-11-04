<script setup>
import RenderDialog from "./RenderDialog.vue"

defineProps({
  progress: { type: Number, required: true }
})

const emit = defineEmits(["close"])
</script>

<template>
  <RenderDialog title="Rendering" close-title="Cancel" @close="emit('close')">
    <div class="body">
      <div class="bar" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
        <div class="fill" :style="{ width: `${progress * 100}%` }"></div>
      </div>
      <span class="percent">{{ Math.floor(progress * 100) }}%</span>
    </div>
  </RenderDialog>
</template>

<style scoped>
.body {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
}

.bar {
  flex: 1;
  height: 8px;
  background: var(--field);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--accent);
}

.percent {
  min-width: 40px;
  text-align: right;
  font-size: var(--font-md);
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
</style>
