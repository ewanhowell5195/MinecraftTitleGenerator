<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import { overlayLayer } from "../../lib/settings.js"
  import { embedded } from "../../lib/submissionLink.js"
  import { submissionExtraUrl } from "../../lib/submissionsApi.js"
  import TitleRender from "../TitleRender.vue"
  import { CLIENT_KINDS } from "./index.js"

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    files: { type: Object, default: () => ({}) },
    initial: { type: Object, default: null },
    url: { type: String, default: null },
    text: { type: String, required: true }
  })

  const chosen = defineModel("texture", { type: String, default: "" })
  const line = shallowRef(null)
  const problem = ref("")

  const extras = computed(() => (props.details.extras ?? []).filter(extra => extraUrl(extra.key)))
  const options = computed(() => [{ value: "", label: "Flat" }].concat(extras.value.map(extra => ({ value: extra.key, label: extra.name || extra.key, hint: extra.kind }))))
  const picked = computed(() => extras.value.find(extra => extra.key === chosen.value) ?? null)

  function extraUrl(key) {
    return props.files[key]?.url ?? (props.initial ? submissionExtraUrl(props.initial, key) : null)
  }

  function dressed(base, extra, image) {
    if (extra.kind === "overlay") return { ...base, overlayMode: "custom", overlays: [{ ...overlayLayer(null), source: "file", file: image }] }
    return { ...base, textureSource: "custom", customTexture: image, customTextureMode: extra.kind === "strip" ? "strip" : "standard", customBorder: true, borderColour: extra.border ?? "#000000" }
  }

  watch(() => [props.kind, props.url, props.text, picked.value, picked.value && extraUrl(picked.value.key)], async () => {
    if (!props.url || !props.text.trim()) {
      line.value = null
      return
    }
    const asked = props.url
    const extra = picked.value
    try {
      const file = await embedded(asked)
      const image = extra ? await embedded(extraUrl(extra.key)) : null
      if (asked !== props.url || extra !== picked.value) return
      const base = CLIENT_KINDS[props.kind].line({ target: props.target, details: props.details }, file, props.text)
      line.value = extra ? dressed(base, extra, image) : base
      problem.value = ""
    } catch (err) {
      line.value = null
      problem.value = err.message
    }
  }, { immediate: true })
</script>

<template>
  <div class="font-preview">
    <TitleRender :fonts="fonts" :line="line" :message="problem || (url ? 'Type some text to preview it' : 'Choose a font JSON file to preview it')" />
    <Dropdown v-if="extras.length" v-model="chosen" class="texture-pick" :options="options" label="Texture" />
  </div>
</template>

<style scoped>
  .font-preview {
    display: contents;
  }

  .texture-pick {
    order: 1;
  }
</style>
