<script setup>
  import { computed, ref, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import { fullName } from "../../lib/font.js"
  import LiveTitle from "../../components/LiveTitle.vue"
  import { popular } from "../../lib/stats.js"
  import { embedded } from "../../lib/submissionLink.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import { fontDefaults, usePreviewLine } from "./preview.js"
  import { TILEABLE_PREVIEW_FONT, tileable } from "./tileable.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    url: { type: String, default: null },
    text: { type: String, required: true }
  })

  const font = ref(TILEABLE_PREVIEW_FONT)

  const usable = computed(() => props.fonts.filter(entry => !entry.mesh))
  const options = computed(() => popular(usable.value, entry => entry.id, entry => fullName(entry, props.fonts), [TILEABLE_PREVIEW_FONT]).map(entry => ({ value: entry.id, label: fullName(entry, props.fonts), image: fontThumbnail(props.fonts, entry.id) })))

  watch(usable, fonts => {
    if (!fonts.some(entry => entry.id === font.value)) font.value = fonts[0]?.id ?? ""
  }, { immediate: true })

  const { line, problem } = usePreviewLine(() => [font.value, props.url, props.text], build)

  async function build() {
    const entry = props.fonts.find(item => item.id === font.value)
    if (!props.url || !entry || !props.text.trim()) return null
    const file = await embedded(props.url)
    return { ...tileable.line({ target: props.target, details: props.details }, file, props.text), font: entry.id, ...fontDefaults(entry) }
  }
</script>

<template>
  <Dropdown v-if="options.length" v-model="font" :options="options" label="Preview font" searchable />
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (url ? 'Type some text to preview it' : 'Choose a PNG to preview it')" />
</template>
