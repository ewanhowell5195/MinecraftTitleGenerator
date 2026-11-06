<script setup>
  import { computed } from "vue"
  import FluidTabs from "fluid-tabs-vue"

  const props = defineProps({
    options: { type: Array, required: true },
    modelValue: { required: true }
  })

  const emit = defineEmits(["update:modelValue"])

  const tabs = computed(() => props.options.map(option => ({ ...option, id: String(option.value) })))

  function change(id) {
    const { value } = props.options.find(option => String(option.value) === id)
    if (value !== props.modelValue) emit("update:modelValue", value)
  }
</script>

<template>
  <FluidTabs :model-value="String(modelValue)" :tabs="tabs" tab-style="slide" @tab-changed="change">
    <template #label="{ tab }"><span :title="tab.title">{{ tab.label }}</span></template>
  </FluidTabs>
</template>
