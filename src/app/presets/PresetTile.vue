<script setup>
  import TitlePicture from "./TitlePicture.vue"

  defineProps({
    code: { type: String, required: true },
    fingerprint: { type: String, default: null },
    selected: { type: Boolean, default: false }
  })

  const emit = defineEmits(["pick"])
</script>

<template>
  <div class="card" :class="{ selected }" @click="emit('pick')">
    <TitlePicture :code="code" :fingerprint="fingerprint" @open="emit('pick')" />
    <div class="details">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 8px;
    font-size: var(--font-sm);
  }

  .details {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
</style>
