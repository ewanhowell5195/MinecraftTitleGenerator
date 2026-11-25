<script setup>
  import { computed, ref, watch } from "vue"
  import Dropdown from "#c/Dropdown.vue"
  import LiveTitle from "#c/LiveTitle.vue"
  import { DEFAULT_FONT } from "#lib/settings/defaults.js"
  import { embedded } from "../submissionLink.js"
  import { popularFontOptions } from "./fontOptions.js"
  import { fontDefaults, usePreviewLine } from "./preview.js"
  import { tileable } from "./tileable.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    url: { type: String, default: null },
    text: { type: String, required: true }
  })

  const font = ref(DEFAULT_FONT)

  const usable = computed(() => props.fonts.filter(entry => !entry.mesh))
  const options = computed(() => popularFontOptions(usable.value, props.fonts))

  watch(usable, fonts => {
    if (!fonts.some(entry => entry.id === font.value)) font.value = fonts[0]?.id ?? ""
  }, { immediate: true })

  const { line, problem, pending } = usePreviewLine(() => [font.value, props.url, props.text], build)

  async function build() {
    const entry = props.fonts.find(item => item.id === font.value)
    if (!props.url || !entry || !props.text.trim()) return null
    const file = await embedded(props.url)
    return { ...tileable.line({ target: props.target, details: props.details }, file, props.text), font: entry.id, ...fontDefaults(entry) }
  }
</script>

<template>
  <Dropdown v-if="options.length" v-model="font" :options="options" label="Preview font" searchable />
  <LiveTitle popup :fonts="fonts" :lines="line ? [line] : []" :loading="pending" :message="problem || (!url ? 'Choose a PNG to preview it' : !text.trim() ? 'Type some text to preview it' : '')" />
</template>
