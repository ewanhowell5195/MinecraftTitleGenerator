<script setup>
  import FluidTabs from "fluid-tabs-vue"
  import Icon from "./Icon.vue"

  defineProps({
    tabs: { type: Array, required: true },
    icons: { type: Boolean, default: false }
  })

  const model = defineModel({ type: String, required: true })
</script>

<template>
  <FluidTabs v-model="model" :tabs="tabs" tab-style="nav" class="nav-tabs" :class="{ icons }" wrap>
    <template #label="{ tab }">
      <Icon v-if="icons" :name="tab.icon" :size="20" />
      <span :class="{ current: tab.id === model }">{{ tab.label }}</span>
    </template>
  </FluidTabs>
</template>

<style scoped>
  .nav-tabs {
    border-bottom: 1px solid var(--line);
  }

  .nav-tabs :deep(.tab-bar) {
    box-shadow: none;
  }

  .nav-tabs:where(:not(.icons)) :deep(.tab-bar) {
    justify-content: flex-start;
    gap: 24px;
  }

  .nav-tabs :deep(.tab-bar-button) {
    font-weight: 600;
    color: var(--faint);
  }

  .nav-tabs:where(:not(.icons)) :deep(.tab-bar-button) {
    flex: none;
    padding: 10px 2px;
    font-size: var(--font-base);
  }

  .nav-tabs:where(.icons) :deep(.tab-bar-button) {
    gap: 4px;
    min-width: 0;
    padding: 10px 0 9px;
    font-size: var(--font-xs);
  }

  .nav-tabs:where(:not(.icons)) :deep(.tab-bar-button)::before {
    content: "";
    position: absolute;
    top: 0;
    right: -12px;
    bottom: 0;
    left: -12px;
  }

  .nav-tabs:where(:not(.icons)) :deep(.tab-bar-button:first-of-type)::before {
    left: 0;
  }

  .nav-tabs:where(:not(.icons)) :deep(.tab-bar-button:last-of-type)::before {
    right: 0;
  }

  .nav-tabs :deep(.tab-bar-button:hover),
  .nav-tabs :deep(.tab-bar-button.active),
  .nav-tabs :deep(.tab-bar:not(.tab-bar-ready) > .tab-bar-button:has(> .current)) {
    color: var(--text);
  }

  .nav-tabs:where(.icons) :deep(.tab-bar-button.active),
  .nav-tabs:where(.icons) :deep(.tab-bar:not(.tab-bar-ready) > .tab-bar-button:has(> .current)) {
    color: var(--accent);
  }

  .nav-tabs :deep(.tab-bar:not(.tab-bar-ready) > .tab-bar-button:has(> .current)) {
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .nav-tabs:where(.icons) :deep(.tab-bar-button svg) {
    width: 20px;
    height: 20px;
  }

  .nav-tabs :deep(.tab-bar-active) {
    bottom: 0;
    border-top: none;
    border-bottom: 2px solid var(--accent);
  }
</style>
