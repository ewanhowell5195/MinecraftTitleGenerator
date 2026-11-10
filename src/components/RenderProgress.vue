<script setup>
  import ProgressBar from "./ProgressBar.vue"
  import RenderDialog from "./RenderDialog.vue"

  defineProps({
    progress: { type: Number, required: true }
  })

  const emit = defineEmits(["close"])
</script>

<template>
  <RenderDialog title="Rendering" close-title="Cancel" @close="emit('close')">
    <div class="dialog-body body">
      <ProgressBar class="grow" :value="progress" />
      <span class="percent">{{ Math.floor(progress * 100) }}%</span>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .body {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .percent {
    min-width: 40px;
    text-align: right;
    font-size: var(--font-md);
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
</style>
