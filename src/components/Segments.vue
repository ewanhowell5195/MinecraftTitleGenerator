<script setup>
  import { computed } from "vue"
  import FluidTabs from "fluid-tabs-vue"
  import Field from "./Field.vue"

  const props = defineProps({
    options: { type: Array, required: true },
    modelValue: { required: true },
    label: { type: String, default: "" },
    hint: { type: String, default: "" },
    radio: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:modelValue"])

  const tabs = computed(() => props.options.map(option => ({ ...option, id: String(option.value) })))

  function change(id) {
    const { value } = props.options.find(option => String(option.value) === id)
    if (value !== props.modelValue) emit("update:modelValue", value)
  }
</script>

<template>
  <Field v-if="label" group :label="label" :hint="hint">
    <FluidTabs :model-value="String(modelValue)" :tabs="tabs" :tab-style="radio ? 'card' : 'slide'" :class="{ radio }" wrap @tab-changed="change">
      <template #label="{ tab }"><span :class="{ current: tab.id === String(modelValue) }" v-tooltip="tab.title">{{ tab.label }}</span></template>
    </FluidTabs>
  </Field>
  <FluidTabs v-else :model-value="String(modelValue)" :tabs="tabs" :tab-style="radio ? 'card' : 'slide'" :class="{ radio }" wrap @tab-changed="change">
    <template #label="{ tab }"><span :class="{ current: tab.id === String(modelValue) }" v-tooltip="tab.title">{{ tab.label }}</span></template>
  </FluidTabs>
</template>

<style scoped>
  .radio :deep(.tab-bar.tab-style-card) {
    --tab-tease-x: 0px;
    gap: 6px;
    margin-bottom: -1px;
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button) {
    flex: 1 1 auto;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-width: min-content;
    height: var(--control);
    padding: 0 10px;
    font-size: var(--font-md);
    color: var(--faint);
    white-space: nowrap;
    border: 1px solid var(--line-strong);
    border-radius: 0;
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button::before) {
    content: "";
    flex: none;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    transition: border-color var(--duration), box-shadow var(--duration), background var(--duration);
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button:hover),
  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button.active),
  .radio :deep(.tab-bar.tab-style-card:not(.tab-bar-ready) > .tab-bar-button:has(> .current)) {
    color: var(--text);
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button:hover) {
    border-color: var(--faint);
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button.active::before),
  .radio :deep(.tab-bar.tab-style-card:not(.tab-bar-ready) > .tab-bar-button:has(> .current)::before) {
    border-color: var(--accent);
    background: var(--accent);
    box-shadow: inset 0 0 0 2.5px var(--bg);
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button > span) {
    color: inherit;
    font-size: inherit;
    font-weight: inherit;
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button > .tab-bar-button-reveal::before) {
    border: 1.5px solid var(--accent);
    border-radius: 0;
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button > .tab-bar-button-reveal) {
    z-index: -1;
  }

  .radio :deep(.tab-bar.tab-style-card > .tab-bar-button > .tab-bar-button-reveal::after) {
    content: "";
    position: absolute;
    inset: 2px;
    background: var(--accent-soft);
  }
</style>
