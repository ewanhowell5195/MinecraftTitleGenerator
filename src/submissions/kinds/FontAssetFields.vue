<script setup>
  import { computed, ref, shallowRef, toRaw, watch } from "vue"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Field from "../../components/Field.vue"
  import OverlayLayers from "../../components/OverlayLayers.vue"
  import Toggle from "../../components/Toggle.vue"
  import { fetched } from "../../lib/api.js"
  import { fontFolder, fullName } from "../../lib/font.js"
  import { fontFaces, overlayLayer } from "../../lib/settings.js"
  import { popular } from "../../lib/stats.js"
  import { DEFAULT_OVERLAY_LIMIT, fontOwners, overlayChoices, texturesList } from "../../lib/submissionKinds/fontAsset.js"
  import { DEFAULT_ROLES, SUBMISSION_LIMITS, pngProblem, pngSize } from "../../lib/submissions.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import { detectFont } from "./detectFont.js"
  import VariantOf from "./VariantOf.vue"

  const DEFAULT_FONT = "minecraft-ten"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    file: { type: Object, default: null },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:target", "update:details", "problem"])

  const owners = computed(() => fontOwners(props.fonts))
  const options = computed(() => popular(owners.value, font => font.id, font => fullName(font, props.fonts), [DEFAULT_FONT]).map(font => ({ value: font.id, label: fullName(font, props.fonts), image: fontThumbnail(props.fonts, font.id) })))
  const entry = computed(() => props.fonts.find(font => font.id === props.target))
  const template = computed(() => entry.value ? `/${fontFolder(entry.value)}/textures/flat.png` : null)
  const noun = computed(() => props.kind === "overlay" ? "overlay" : "texture")
  const border = computed({
    get: () => props.details.border ?? "#000000",
    set: value => emit("update:details", { ...props.details, border: value })
  })
  const font = computed({
    get: () => props.target,
    set: value => emit("update:target", value)
  })

  watch(() => [props.kind, props.target], () => {
    if (!owners.value.some(item => item.id === props.target)) emit("update:target", owners.value.find(item => item.id === DEFAULT_FONT)?.id ?? owners.value[0]?.id ?? "")
    if (props.kind === "texture" && !props.details.border) emit("update:details", { ...props.details, border: "#000000" })
  }, { immediate: true })

  const fontList = shallowRef(null)
  const listError = ref("")
  const openRoles = computed(() => props.kind === "texture" && !props.details.variantOf && fontList.value ? DEFAULT_ROLES.filter(role => !fontList.value[role]) : [])

  watch(() => entry.value ? texturesList(entry.value) : null, async url => {
    fontList.value = null
    listError.value = ""
    if (!url) return
    try {
      const loaded = await (await fetched(url, "the font's textures")).json()
      if (entry.value && url === texturesList(entry.value)) fontList.value = loaded
    } catch (err) {
      listError.value = err.message
    }
  }, { immediate: true })

  watch(() => [openRoles.value, fontList.value, props.details.variantOf], () => {
    if (!fontList.value && !props.details.variantOf) return
    const dropped = DEFAULT_ROLES.filter(role => props.details[role] && !openRoles.value.includes(role))
    if (!dropped.length) return
    const kept = { ...props.details }
    for (const role of dropped) delete kept[role]
    emit("update:details", kept)
  })

  const LAYER_KEYS = ["overlays", "edgeOverlays"]
  const choices = computed(() => overlayChoices(fontList.value))
  const fontView = computed(() => entry.value ? { ...entry.value, folder: `/${fontFolder(entry.value)}` } : null)
  const faces = computed(() => entry.value ? fontFaces("top", entry.value) : {})
  const hasDefaults = computed(() => props.details.overlays !== undefined)
  const layers = { overlays: ref([]), edgeOverlays: ref([]) }
  const selected = { overlays: ref(0), edgeOverlays: ref(0) }
  const sent = { overlays: "", edgeOverlays: "" }

  watch(() => [props.details.overlays, props.details.edgeOverlays, choices.value], () => {
    for (const key of LAYER_KEYS) {
      const given = (props.details[key] ?? []).map(layer => ({ ...overlayLayer(layer.overlay, choices.value[key][layer.overlay]), ...layer }))
      const text = JSON.stringify(given)
      if (text === sent[key]) continue
      sent[key] = text
      layers[key].value = given
      selected[key].value = 0
    }
  }, { immediate: true })

  for (const key of LAYER_KEYS) {
    watch(layers[key], value => {
      const text = JSON.stringify(value)
      if (text === sent[key] || !hasDefaults.value) return
      sent[key] = text
      emit("update:details", { ...props.details, [key]: structuredClone(toRaw(value)) })
    }, { deep: true })
  }

  function setDefaults(on) {
    const kept = { ...props.details }
    if (on) kept.overlays = []
    else for (const key of LAYER_KEYS) delete kept[key]
    emit("update:details", kept)
  }

  function setRole(role, on) {
    const kept = { ...props.details }
    if (on) kept[role] = true
    else delete kept[role]
    emit("update:details", kept)
  }

  watch(() => props.file, async file => {
    emit("problem", null)
    if (!file?.bytes || pngProblem(file.bytes, noun.value)) return
    const size = pngSize(file.bytes)
    const found = await detectFont(props.kind, file.blob, size, owners.value)
    if (file !== props.file) return
    if (found) emit("update:target", found.id)
    else emit("problem", `This ${noun.value} doesn't match any font's template. Paint over the template of the font it's for, at its size or a whole number of times bigger. This one is ${size.width}x${size.height}.`)
  })
</script>

<template>
  <Field group label="Font" :error="tried ? problems.target : ''">
    <Dropdown v-model="font" :options="options" searchable />
    <template #hint>Paint over the font's <a v-if="template" :href="template" :download="`${target}-template.png`">template</a>. It can be the same size or a whole number of times bigger, up to {{ SUBMISSION_LIMITS.side }} pixels on each side.</template>
  </Field>
  <Field group v-if="kind === 'texture'" label="Border colour" :error="problems.border">
    <ColourPicker v-model="border" />
  </Field>
  <VariantOf v-if="kind === 'texture'" noun="texture" :details="details" :list="entry ? texturesList(entry) : null" :folder="entry ? fontFolder(entry) : null" :problem="tried ? problems.variantOf ?? '' : ''" @update:details="emit('update:details', $event)" />
  <Field group v-if="openRoles.length || listError" label="Font defaults" :error="listError || problems.primary || problems.secondary">
    <Toggle v-if="openRoles.includes('primary')" label="Primary texture" hint="What top and small lines start with" :model-value="!!details.primary" @update:model-value="setRole('primary', $event)" />
    <Toggle v-if="openRoles.includes('secondary')" label="Secondary texture" hint="What bottom lines start with, or the primary if there isn't one" :model-value="!!details.secondary" @update:model-value="setRole('secondary', $event)" />
  </Field>
  <template v-if="kind === 'texture' && fontList">
    <Field group :error="tried ? problems.overlays : ''">
      <Toggle label="This texture has default overlays" :hint="`Overlays that come with it when someone picks it, up to ${DEFAULT_OVERLAY_LIMIT} of each kind.`" :model-value="hasDefaults" @update:model-value="setDefaults" />
    </Field>
    <template v-if="hasDefaults">
      <div class="overlay-group wide">
        <h3>Face overlays</h3>
        <OverlayLayers v-model:selected="selected.overlays.value" :layers="layers.overlays.value" :edit="() => layers.overlays.value" :available="choices.overlays" :font="fontView" :fonts="fonts" :files="false" :side-faces="!!(faces.internalFaces || faces.sideFaces)" :tile-min="110" />
      </div>
      <div class="overlay-group wide">
        <h3>Edge overlays</h3>
        <p class="hint">Paints the top and bottom faces around each letter.</p>
        <OverlayLayers v-model:selected="selected.edgeOverlays.value" :layers="layers.edgeOverlays.value" :edit="() => layers.edgeOverlays.value" :available="choices.edgeOverlays" :font="fontView" :fonts="fonts" :files="false" :tile-min="110" edge />
      </div>
    </template>
  </template>
</template>

<style scoped>
  .overlay-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--field);
  }

  .overlay-group h3 {
    margin: 0;
  }
</style>
