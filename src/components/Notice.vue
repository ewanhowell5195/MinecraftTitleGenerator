<script setup>
  defineProps({ warn: Boolean })
</script>

<template>
  <div class="notice" :class="{ warn }" role="alert">
    <slot></slot>
  </div>
</template>

<style scoped>
  .notice {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px;
    font-size: var(--font-md);
    line-height: 1.45;
    color: var(--danger);
    background: var(--danger-soft);
    border: 1px solid var(--danger-line);
  }

  .notice.warn {
    color: var(--warn);
    background: var(--warn-soft);
    border-color: var(--warn-line);
  }

  .notice :slotted(p) {
    margin: 0;
  }
</style>
