<script setup>
  import FluidTabs from "fluid-tabs-vue"

  defineProps({
    tabs: { type: Array, required: true }
  })

  const model = defineModel({ type: String, required: true })
</script>

<template>
  <FluidTabs v-model="model" :tabs="tabs" tab-style="nav" class="nav-tabs" />
</template>

<style scoped>
  .nav-tabs {
    border-bottom: 1px solid var(--line);
  }

  .nav-tabs :deep(.tab-bar) {
    justify-content: flex-start;
    gap: 24px;
    box-shadow: none;
  }

  .nav-tabs :deep(.tab-bar-button) {
    flex: none;
    padding: 10px 2px;
    font-size: var(--font-base);
    font-weight: 600;
    color: var(--faint);
  }

  .nav-tabs :deep(.tab-bar-button)::before {
    content: "";
    position: absolute;
    top: 0;
    right: -12px;
    bottom: 0;
    left: -12px;
  }

  .nav-tabs :deep(.tab-bar-button:first-of-type)::before {
    left: 0;
  }

  .nav-tabs :deep(.tab-bar-button:last-of-type)::before {
    right: 0;
  }

  .nav-tabs :deep(.tab-bar-button:hover),
  .nav-tabs :deep(.tab-bar-button.active) {
    color: var(--text);
  }

  .nav-tabs :deep(.tab-bar-active) {
    bottom: 0;
    border-top: none;
    border-bottom: 2px solid var(--accent);
  }
</style>
