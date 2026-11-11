<script setup>
  import LiveTitle from "../../components/LiveTitle.vue"
  import { embedded } from "../../lib/submissionLink.js"
  import { CLIENT_KINDS } from "./index.js"
  import { fontDefaults, usePreviewLine } from "./preview.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    url: { type: String, default: null },
    text: { type: String, required: true }
  })

  const { line, problem } = usePreviewLine(() => [props.kind, props.target, props.details.border, props.url, props.text], build)

  async function build() {
    const entry = props.fonts.find(font => font.id === props.target)
    if (!props.url || !entry || !props.text.trim()) return null
    const file = await embedded(props.url)
    return { ...CLIENT_KINDS[props.kind].line({ target: props.target, details: props.details }, file, props.text), ...fontDefaults(entry) }
  }
</script>

<template>
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (url ? 'Type some text to preview it' : 'Choose a PNG to preview it')" />
</template>
