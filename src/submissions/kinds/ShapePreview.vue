<script setup>
  import { computed, ref } from "vue"
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
    url: { type: String, default: null },
    trial: { type: Object, default: null }
  })

  const emit = defineEmits(["update:trial"])

  const own = ref("image")
  const strips = computed(() => {
    const used = props.details.strips ?? []
    return props.trial ? used.filter(item => stripUse(item).id !== stripUse(props.trial.strip).id).concat([props.trial.strip]) : used
  })
  const { value: stripTextures, problem: listProblem } = useLoaded(() => JSON.stringify(strips.value), listed, [])
  const textures = computed(() => OWN_TEXTURES.concat(stripTextures.value))
  const texture = computed({
    get: () => props.trial ? keyOf(stripUse(props.trial.strip).id, props.trial.texture, props.trial.variant) : own.value,
    set(value) {
      const picked = stripTextures.value.find(option => option.value === value)
      if (!picked) own.value = value
      emit("update:trial", picked ? { strip: strips.value.find(item => stripUse(item).id === picked.set), texture: picked.texture, variant: picked.variant } : null)
    }
  })
  const { line, problem } = usePreviewLine(() => [props.kind, props.url, props.files.texture?.url, texture.value, JSON.stringify(strips.value)], build)

  function keyOf(set, id, variant) {
    return [set, id, variant ?? ""].join("/")
  }

  async function listed() {
    const sets = await Promise.all(strips.value.map(stripUse).map(async ({ id }) => [id, await (await fetched(`/${stripFolder(id)}/textures.json`, `the ${titleCase(id)} strip type`)).json()]))
    return sets.flatMap(([set, list]) => Object.entries(list.textures).flatMap(([id, data]) => [[null, data]].concat(Object.entries(data.variants ?? {})).map(([variant, entry]) => ({ value: keyOf(set, id, variant), label: entry.name ?? titleCase(variant ?? id), hint: titleCase(set), set, texture: id, variant }))))
  }

  async function modelLine() {
    const textureUrl = props.files.texture?.url ?? (props.initial ? submissionExtraUrl(props.initial, "texture") : null)
    if (!textureUrl) return null
    const stored = !!props.initial && props.url === submissionFileUrl(props.initial)
    const [model, image] = await Promise.all([fetched(props.url, "the model").then(response => stored ? response.json() : response.arrayBuffer().then(buffer => cleanModel(new Uint8Array(buffer)))), embedded(textureUrl)])
    return shapeModel.line({ details: props.details }, model, "", image)
  }

  async function imageLine() {
    const shape = shapeImage.line({ details: { ...props.details, strips: strips.value } }, await embedded(props.url))
    return { ...shape, textureSource: "premade", texture: props.trial?.texture ?? own.value, textureVariant: props.trial?.variant ?? null }
  }

  async function build() {
    if (!props.url) return null
    return props.kind === "shapeModel" ? modelLine() : imageLine()
  }

</script>

<template>
  <Dropdown v-if="kind === 'shapeImage' && url" v-model="texture" :options="textures" label="Preview texture" searchable />
  <p v-if="listProblem" class="hint bad">The strip textures couldn't be listed: {{ listProblem }}</p>
  <LiveTitle :fonts="fonts" :lines="line ? [line] : []" :message="problem || (kind === 'shapeModel' ? 'Choose the model and its texture to preview it' : 'Choose a PNG to preview it')" />
</template>
