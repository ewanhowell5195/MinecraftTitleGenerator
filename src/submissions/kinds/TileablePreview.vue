<script setup>
  import { computed, ref, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import { fullName } from "../../lib/font.js"
  import LiveTitle from "../../components/LiveTitle.vue"
  import { defaultBorder, defaultDepth, defaultSpacing } from "../../lib/settings.js"
  import { popular } from "../../lib/stats.js"
  import { embedded } from "../../lib/submissionLink.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import { TILEABLE_PREVIEW_FONT, tileable } from "./tileable.js"

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    url: { type: String, default: null },
    text: { type: String, required: true }
  })

  const font = ref(TILEABLE_PREVIEW_FONT)
  const line = ref(null)
  const problem = ref("")

  const usable = computed(() => props.fonts.filter(entry => !entry.mesh))
  const options = computed(() => popular(usable.value, entry => entry.id, entry => fullName(entry, props.fonts), [TILEABLE_PREVIEW_FONT]).map(entry => ({ value: entry.id, label: fullName(entry, props.fonts), image: fontThumbnail(props.fonts, entry.id) })))

  watch(usable, fonts => {
    if (!fonts.some(entry => entry.id === font.value)) font.value = fonts[0]?.id ?? ""
  }, { immediate: true })

  watch(() => [font.value, props.url, props.text], async () => {
    const entry = props.fonts.find(item => item.id === font.value)
    if (!props.url || !entry || !props.text.trim()) {
      line.value = null
      return
    }
    const asked = props.url
    try {
      const file = await embedded(asked)
      if (asked !== props.url) return
      line.value = { ...tileable.line({ target: props.target, details: props.details }, file, props.text), font: entry.id, depth: defaultDepth(entry), border: defaultBorder("top", entry), spacing: defaultSpacing("top", entry) }
      problem.value = ""
    } catch (err) {
      line.value = null
      problem.value = err.message
    }
  }, { immediate: true })
</script>

<template>
  <Dropdown v-if="options.length" v-model="font" :options="options" label="Preview font" searchable />
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (url ? 'Type some text to preview it' : 'Choose a PNG to preview it')" />
</template>
