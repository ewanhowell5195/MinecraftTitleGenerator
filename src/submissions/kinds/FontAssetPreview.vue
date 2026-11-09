<script setup>
  import { ref, watch } from "vue"
  import { defaultBorder, defaultDepth, defaultSpacing } from "../../lib/settings.js"
  import { embedded } from "../../lib/submissionLink.js"
  import TitleRender from "../TitleRender.vue"
  import { CLIENT_KINDS } from "./index.js"

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    url: { type: String, default: null },
    text: { type: String, required: true }
  })

  const line = ref(null)
  const problem = ref("")

  watch(() => [props.kind, props.target, props.details.border, props.url, props.text], async () => {
    const entry = props.fonts.find(font => font.id === props.target)
    if (!props.url || !entry || !props.text.trim()) {
      line.value = null
      return
    }
    const asked = props.url
    try {
      const file = await embedded(asked)
      if (asked !== props.url) return
      line.value = { ...CLIENT_KINDS[props.kind].line({ target: props.target, details: props.details }, file, props.text), depth: defaultDepth(entry), border: defaultBorder("top", entry), spacing: defaultSpacing("top", entry) }
      problem.value = ""
    } catch (err) {
      line.value = null
      problem.value = err.message
    }
  }, { immediate: true })
</script>

<template>
  <TitleRender :fonts="fonts" :line="line" :message="problem || (url ? 'Type some text to preview it' : 'Choose a PNG to preview it')" />
</template>
