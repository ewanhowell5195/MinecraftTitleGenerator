<template>
  <div class="notice" role="alert">
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

  .notice :slotted(p) {
    margin: 0;
  }
</style>
