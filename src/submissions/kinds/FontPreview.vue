<script setup>
  import { computed } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import LiveTitle from "../../components/LiveTitle.vue"
  import { embedded } from "../../lib/submissionLink.js"
  import { submissionExtraUrl } from "../../lib/submissionsApi.js"
  import { CLIENT_KINDS } from "./index.js"
  import { usePreviewLine } from "./preview.js"

  defineOptions({ inheritAttrs: false })

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

  const flat = computed(() => (props.details.extras ?? []).find(extra => extra.kind === "flat" && extraUrl(extra.key)) ?? null)
  const extras = computed(() => (props.details.extras ?? []).filter(extra => extra.kind !== "flat" && extraUrl(extra.key)))
  const options = computed(() => [{ value: "", label: "Flat" }].concat(extras.value.map(extra => ({ value: extra.key, label: extra.name || extra.key, hint: extra.kind }))))
  const picked = computed(() => extras.value.find(extra => extra.key === chosen.value) ?? null)

  function extraUrl(key) {
    return props.files[key]?.url ?? (props.initial ? submissionExtraUrl(props.initial, key) : null)
  }

  const { line, problem } = usePreviewLine(() => [props.kind, props.url, props.text, picked.value, picked.value && extraUrl(picked.value.key), flat.value, flat.value && extraUrl(flat.value.key)], build)

  async function build() {
    if (!props.url || !props.text.trim()) return null
    const extra = picked.value
    const file = await embedded(props.url)
    const type = CLIENT_KINDS[props.kind]
    const plain = type.line({ target: props.target, details: props.details }, file, props.text)
    const base = flat.value && (!extra || extra.kind === "overlay") ? type.dressed(plain, flat.value, await embedded(extraUrl(flat.value.key))) : plain
    return extra ? type.dressed(base, extra, await embedded(extraUrl(extra.key))) : base
  }
</script>

<template>
  <div class="font-preview">
    <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (url ? 'Type some text to preview it' : 'Choose a font JSON file to preview it')" />
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
