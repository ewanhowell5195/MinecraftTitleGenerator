<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import LiveTitle from "../../components/LiveTitle.vue"
  import { titleCase } from "../../lib/names.js"
  import { stripFolder, stripUse } from "../../lib/strips.js"
  import { cleanModel } from "../../lib/submissionKinds/shape.js"
  import { embedded } from "../../lib/submissionLink.js"
  import { submissionExtraUrl } from "../../lib/submissionsApi.js"
  import { shapeImage, shapeModel } from "./shape.js"

  const OWN_TEXTURES = [{ value: "image", label: "Its own colours" }, { value: "flat", label: "Flat" }]

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    details: { type: Object, required: true },
    files: { type: Object, default: () => ({}) },
    initial: { type: Object, default: null },
    url: { type: String, default: null }
  })

  const line = shallowRef(null)
  const problem = ref("")
  const texture = ref("image")
  const stripTextures = shallowRef([])
  const strips = computed(() => props.details.strips ?? [])
  const textures = computed(() => OWN_TEXTURES.concat(stripTextures.value))

  async function modelLine() {
    const textureUrl = props.files.texture?.url ?? (props.initial ? submissionExtraUrl(props.initial, "texture") : null)
    if (!textureUrl) return null
    const [model, image] = await Promise.all([fetch(props.url).then(response => response.arrayBuffer()).then(buffer => cleanModel(new Uint8Array(buffer))), embedded(textureUrl)])
    return shapeModel.line({ details: props.details }, model, "", image)
  }

  async function imageLine() {
    const own = shapeImage.line({ details: props.details }, await embedded(props.url))
    return { ...own, textureSource: "premade", texture: texture.value }
  }

  watch(() => JSON.stringify(strips.value), async () => {
    const sets = await Promise.all(strips.value.map(stripUse).map(async ({ id }) => [id, await fetch(`/${stripFolder(id)}/textures.json`).then(response => response.json())]))
    stripTextures.value = sets.flatMap(([id, set]) => Object.entries(set.textures).flatMap(([name, data]) => [[name, data]].concat(Object.entries(data.variants ?? {}))).map(([name, data]) => ({ value: name, label: data.name ?? titleCase(name), hint: titleCase(id) })))
    if (!textures.value.some(option => option.value === texture.value)) texture.value = "image"
  }, { immediate: true })

  watch(() => [props.kind, props.url, props.files.texture?.url, texture.value, JSON.stringify(strips.value)], async () => {
    const asked = [props.kind, props.url, props.files.texture?.url, texture.value, JSON.stringify(strips.value)].join()
    try {
      const next = !props.url ? null : props.kind === "shapeModel" ? await modelLine() : await imageLine()
      if (asked !== [props.kind, props.url, props.files.texture?.url, texture.value, JSON.stringify(strips.value)].join()) return
      line.value = next
      problem.value = ""
    } catch (err) {
      line.value = null
      problem.value = err.message
    }
  }, { immediate: true })
</script>

<template>
  <Dropdown v-if="kind === 'shapeImage' && url" v-model="texture" :options="textures" label="Preview texture" searchable />
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (kind === 'shapeModel' ? 'Choose the model and its texture to preview it' : 'Choose a PNG to preview it')" />
</template>
