<script setup>
  import ProgressBar from "./ProgressBar.vue"
  import Dialog from "../components/Dialog.vue"

  defineProps({
    progress: { type: Number, required: true },
    layers: { type: Array, default: () => [] },
    layer: { type: Number, default: 0 }
  })

  const emit = defineEmits(["close"])
</script>

<template>
  <Dialog title="Rendering" close-title="Cancel" @close="emit('close')">
    <div class="dialog-body body">
      <template v-if="layers.length">
        <span class="name ellipsis">{{ layer ? layers[layer - 1] : "Preparing" }}</span>
        <span class="amount">{{ layer ? `${layer}/${layers.length}` : "" }}</span>
      </template>
      <ProgressBar :value="progress" />
      <span class="amount">{{ Math.floor(progress * 100) }}%</span>
    </div>
  </Dialog>
</template>

<style scoped>
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 40px;
    align-items: center;
    gap: 8px 12px;
  }

  .name {
    font-size: var(--font-md);
    font-weight: 600;
    color: var(--text);
  }

  .amount {
    text-align: right;
    font-size: var(--font-md);
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
</style>
