<script setup>
  import { computed, ref, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import LiveTitle from "../../components/LiveTitle.vue"
  import { fullName } from "../../lib/font.js"
  import { embedded } from "../../lib/submissionLink.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import { previewFonts, stripLine } from "./strip.js"

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
  const chosen = defineModel("font", { type: String, default: "" })

  const options = computed(() => previewFonts({ target: props.target, details: props.details }, props.fonts).map(font => ({ value: font.id, label: fullName(font, props.fonts), image: fontThumbnail(props.fonts, font.id) })))
  const font = computed(() => options.value.some(option => option.value === chosen.value) ? chosen.value : options.value[0]?.value ?? "")

  watch(() => [props.target, JSON.stringify(props.details), props.url, props.text, font.value], async () => {
    if (!props.url || !font.value || !props.text.trim()) {
      line.value = null
      return
    }
    const asked = [props.url, props.target, JSON.stringify(props.details), font.value, props.text].join()
    try {
      const made = await stripLine({ target: props.target, details: props.details }, await embedded(props.url), props.text, font.value, props.fonts)
      if (asked !== [props.url, props.target, JSON.stringify(props.details), font.value, props.text].join()) return
      line.value = made
      problem.value = ""
    } catch (err) {
      line.value = null
      problem.value = err.message
    }
  }, { immediate: true })
</script>

<template>
  <Dropdown v-if="options.length > 1" v-model="chosen" :options="options" label="Preview font" searchable />
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (!font ? 'Pick a font to preview it on' : url ? 'Type some text to preview it' : 'Choose a PNG to preview it')" />
</template>
