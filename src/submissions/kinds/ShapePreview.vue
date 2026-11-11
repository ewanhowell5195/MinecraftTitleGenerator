<script setup>
  import { computed, ref, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import LiveTitle from "../../components/LiveTitle.vue"
  import { fetched } from "../../lib/api.js"
  import { titleCase } from "../../lib/names.js"
  import { stripFolder, stripUse } from "../../lib/strips.js"
  import { cleanModel } from "../../lib/submissionKinds/shape.js"
  import { embedded } from "../../lib/submissionLink.js"
  import { submissionExtraUrl, submissionFileUrl } from "../../lib/submissionsApi.js"
  import { useLoaded, usePreviewLine } from "./preview.js"
  import { shapeImage, shapeModel } from "./shape.js"

  const OWN_TEXTURES = [{ value: "image", label: "Its own colours" }, { value: "flat", label: "Flat" }]

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    details: { type: Object, required: true },
    files: { type: Object, default: () => ({}) },
    initial: { type: Object, default: null },
    url: { type: String, default: null }
  })

  const texture = ref("image")
  const strips = computed(() => props.details.strips ?? [])
  const { value: stripTextures, problem: listProblem } = useLoaded(() => JSON.stringify(strips.value), listed, [])
  const textures = computed(() => OWN_TEXTURES.concat(stripTextures.value))
  const { line, problem } = usePreviewLine(() => [props.kind, props.url, props.files.texture?.url, texture.value, JSON.stringify(strips.value)], build)

  async function listed() {
    const sets = await Promise.all(strips.value.map(stripUse).map(async ({ id }) => [id, await (await fetched(`/${stripFolder(id)}/textures.json`, `the ${titleCase(id)} strip type`)).json()]))
    return sets.flatMap(([id, set]) => Object.entries(set.textures).flatMap(([name, data]) => [[name, data]].concat(Object.entries(data.variants ?? {}))).map(([name, data]) => ({ value: name, label: data.name ?? titleCase(name), hint: titleCase(id) })))
  }

  async function modelLine() {
    const textureUrl = props.files.texture?.url ?? (props.initial ? submissionExtraUrl(props.initial, "texture") : null)
    if (!textureUrl) return null
    const stored = !!props.initial && props.url === submissionFileUrl(props.initial)
    const [model, image] = await Promise.all([fetched(props.url, "the model").then(response => stored ? response.json() : response.arrayBuffer().then(buffer => cleanModel(new Uint8Array(buffer)))), embedded(textureUrl)])
    return shapeModel.line({ details: props.details }, model, "", image)
  }

  async function imageLine() {
    const own = shapeImage.line({ details: props.details }, await embedded(props.url))
    return { ...own, textureSource: "premade", texture: texture.value }
  }

  async function build() {
    if (!props.url) return null
    return props.kind === "shapeModel" ? modelLine() : imageLine()
  }

  watch(textures, options => {
    if (!options.some(option => option.value === texture.value)) texture.value = "image"
  })
</script>

<template>
  <Dropdown v-if="kind === 'shapeImage' && url" v-model="texture" :options="textures" label="Preview texture" searchable />
  <p v-if="listProblem" class="hint bad">The strip textures couldn't be listed: {{ listProblem }}</p>
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (kind === 'shapeModel' ? 'Choose the model and its texture to preview it' : 'Choose a PNG to preview it')" />
</template>
