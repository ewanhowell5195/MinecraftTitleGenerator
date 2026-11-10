<script setup>
  import { computed } from "vue"
  import FluidTabs from "fluid-tabs-vue"
  import Field from "./Field.vue"

  const props = defineProps({
    options: { type: Array, required: true },
    modelValue: { required: true },
    label: { type: String, default: "" },
    hint: { type: String, default: "" }
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
    <FluidTabs :model-value="String(modelValue)" :tabs="tabs" tab-style="slide" @tab-changed="change">
      <template #label="{ tab }"><span v-tooltip="tab.title">{{ tab.label }}</span></template>
    </FluidTabs>
  </Field>
  <FluidTabs v-else :model-value="String(modelValue)" :tabs="tabs" tab-style="slide" @tab-changed="change">
    <template #label="{ tab }"><span v-tooltip="tab.title">{{ tab.label }}</span></template>
  </FluidTabs>
</template>
