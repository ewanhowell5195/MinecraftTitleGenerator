<script setup>
  import { computed } from "vue"
  import Dropdown from "#c/Dropdown.vue"
  import LiveTitle from "#c/LiveTitle.vue"
  import { embedded } from "../submissionLink.js"
  import { submissionExtraUrl } from "#lib/submissions/submissionsApi.js"
  import { fontOptions } from "./fontOptions.js"
  import { usePreviewLine } from "./preview.js"
  import { previewFonts, stripLine } from "./strip.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    url: { type: String, default: null },
    files: { type: Object, default: () => ({}) },
    initial: { type: Object, default: null },
    text: { type: String, required: true }
  })

  const chosen = defineModel("font", { type: String, default: "" })

  const options = computed(() => fontOptions(previewFonts({ target: props.target, details: props.details }, props.fonts), props.fonts))
  const font = computed(() => options.value.some(option => option.value === chosen.value) ? chosen.value : options.value[0]?.value ?? "")

  const overlayUrl = computed(() => props.details.overlayStrip ? props.files.overlay?.url ?? (props.initial ? submissionExtraUrl(props.initial, "overlay") : null) : null)
  const { line, problem, pending } = usePreviewLine(() => [props.target, JSON.stringify(props.details), props.url, overlayUrl.value, props.text, font.value], build)

  async function build() {
    if (!props.url || !font.value || !props.text.trim()) return null
    return stripLine({ target: props.target, details: props.details }, await embedded(props.url), props.text, font.value, props.fonts, overlayUrl.value && await embedded(overlayUrl.value))
  }
</script>

<template>
  <Dropdown v-if="options.length > 1" :model-value="font" @update:model-value="chosen = $event" :options="options" label="Preview font" searchable />
  <LiveTitle popup :fonts="fonts" :lines="line ? [line] : []" :loading="pending" :message="problem || (!font ? 'Pick a font to preview it on' : !url ? 'Choose a PNG to preview it' : !text.trim() ? 'Type some text to preview it' : '')" />
</template>
