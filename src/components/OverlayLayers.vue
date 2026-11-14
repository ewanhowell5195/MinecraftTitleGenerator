<script setup>
  import { computed, ref, toRaw } from "vue"
  import { credit } from "../lib/credits.js"
  import { GENERATED_SETTINGS, WRAPPED_KINDS, generatedSetting } from "../lib/generated.js"
  import { titleCase } from "../lib/names.js"
  import { useListReorder } from "../lib/reorder.js"
  import { BLEND_OPTIONS, overlayLayer } from "../lib/settings.js"
  import { popular } from "../lib/stats.js"
  import { readImage, saveSheet, thumbnail, thumbnailHeight } from "../lib/ui.js"
  import Button from "./Button.vue"
  import ColourPicker from "./ColourPicker.vue"
  import Dropdown from "./Dropdown.vue"
  import Field from "./Field.vue"
  import Icon from "./Icon.vue"
  import Segments from "./Segments.vue"
  import Slider from "./Slider.vue"
  import Tile from "./Tile.vue"
  import TileGrid from "./TileGrid.vue"
  import Toggle from "./Toggle.vue"
  import UploadField from "./UploadField.vue"

  const KINDS = [{ value: "generated", label: "Generated" }, { value: "texture", label: "Texture" }, { value: "file", label: "File" }]

  const props = defineProps({
    layers: { type: Array, required: true },
    edit: { type: Function, required: true },
    available: { type: Object, required: true },
    font: { type: Object, default: null },
    fonts: { type: Array, default: () => [] },
    shownLayer: { type: Number, default: null },
    edge: { type: Boolean, default: false },
    files: { type: Boolean, default: true },
    sideFaces: { type: Boolean, default: false },
    tileMin: { type: Number, default: null }
  })

  const selected = defineModel("selected", { type: Number, default: 0 })
  const pending = ref("generated")

  const overlays = computed(() => popular(Object.entries(props.available), ([id]) => `${props.font?.id}.${id}`, ([id, data]) => data.name ?? titleCase(id)))
  const layer = computed(() => props.layers[selected.value] ?? null)
  const generated = computed(() => layer.value?.source === "premade" ? props.available[layer.value.overlay]?.generated ?? null : null)
  const kinds = computed(() => KINDS.filter(item => (item.value !== "generated" || !props.font?.model) && (item.value !== "file" || props.files)))
  const kind = computed(() => !layer.value ? kinds.value.find(item => item.value === pending.value)?.value ?? kinds.value[0].value : layer.value.source === "file" ? "file" : generated.value ? "generated" : "texture")
  const shown = computed(() => overlays.value.filter(ofKind(kind.value)))
  const settings = computed(() => GENERATED_SETTINGS[generated.value] ?? [])
  const wraps = computed(() => !props.edge && !props.font?.model && !WRAPPED_KINDS.has(generated.value))
  const baseline = computed(() => layer.value ? { ...overlayLayer(layer.value.overlay, layer.value.source === "file" ? null : props.available[layer.value.overlay]), source: layer.value.source, file: layer.value.file } : null)
  const layerModified = computed(() => {
    if (!layer.value) return false
    if (["blend", "colour", "colourBlend", "opacity"].some(key => layer.value[key] !== baseline.value[key])) return true
    if (["sideWrap", "edgeWrap"].some(key => !!layer.value[key] !== !!baseline.value[key])) return true
    return settings.value.some(item => item.key !== "seed" && generatedSetting(layer.value, item) !== generatedSetting(baseline.value, item))
  })

  function overlayMenu(id, data) {
    return data.generated ? null : [{ label: "Download overlay", icon: "download", action: () => saveSheet(props.font, "overlays", id) }]
  }

  function ofKind(value) {
    return ([, data]) => !!data.generated === (value === "generated")
  }

  function layerName(item) {
    if (item.source === "file") return "Custom file"
    return props.available[item.overlay]?.name ?? titleCase(item.overlay ?? "")
  }

  function set(key, value) {
    props.edit()[selected.value][key] = value
  }

  function addLayer(item) {
    const target = props.edit()
    target.push(item)
    selected.value = target.length - 1
  }

  function pickFile(file) {
    if (layer.value) set("file", file)
    else addLayer({ ...overlayLayer(null), source: "file", file })
  }

  function freshLayer(id, seed) {
    const fresh = overlayLayer(id, props.available[id])
    const setting = GENERATED_SETTINGS[props.available[id].generated]?.find(item => item.key === "seed")
    if (seed !== undefined) fresh.seed = seed
    else if (setting) fresh.seed = Math.floor(Math.random() * (setting.max + 1))
    return fresh
  }

  function pickOverlay(id) {
    if (!layer.value) return addLayer(freshLayer(id))
    if (layer.value.overlay === id) return
    const target = props.edit()
    const before = target[selected.value]
    target[selected.value] = { ...freshLayer(id, before.seed), source: before.source, file: before.file }
  }

  function pickKind(value) {
    if (value === kind.value) return
    if (!layer.value) {
      pending.value = value
      return
    }
    if (value === "file") {
      set("source", "file")
      return
    }
    const matches = ofKind(value)
    const first = overlays.value.find(matches)
    const own = overlays.value.find(entry => entry[0] === layer.value.overlay)
    set("source", "premade")
    if (first && !(own && matches(own))) pickOverlay(first[0])
  }

  function resetLayer() {
    const fresh = structuredClone(toRaw(baseline.value))
    if (layer.value.seed !== undefined) fresh.seed = layer.value.seed
    props.edit()[selected.value] = fresh
  }

  function removeLayer(index) {
    const target = props.edit()
    target.splice(index, 1)
    if (index < selected.value) selected.value--
    selected.value = Math.max(0, Math.min(selected.value, target.length - 1))
  }

  function duplicateLayer(index) {
    const target = props.edit()
    target.splice(index + 1, 0, structuredClone(toRaw(target[index])))
    selected.value = index + 1
  }

  function moveLayer(from, to) {
    const target = props.edit()
    const chosen = target[selected.value]
    target.splice(to, 0, target.splice(from, 1)[0])
    selected.value = target.indexOf(chosen)
  }

  const box = ref(null)
  const rows = []
  const { dragged, press } = useListReorder({ box, rows, ids: () => Array.from(props.layers.keys()), move: dragLayer })

  function dragLayer(drag, to) {
    moveLayer(drag.id, to)
    drag.id = to
  }
</script>

<template>
  <div ref="box" class="layers" v-if="layers.length">
    <div :ref="el => (rows[index] = el)" class="layer card card-row small" v-for="(item, index) of layers" :key="index" tabindex="0" role="button" :aria-pressed="selected === index" @click="selected = index" @keydown.enter="selected = index" @keydown.space.self.prevent="selected = index" :class="{ selected: selected === index, dragged: dragged === index }">
      <span class="grip" @pointerdown="press($event, index)"><Icon name="grip" :size="14" /></span>
      <img :src="item.source === 'file' ? item.file : thumbnail(font, item.overlay, shownLayer)" alt="">
      <span class="grow ellipsis">{{ layerName(item) }}</span>
      <Button ghost icon="copy" title="Duplicate overlay" @click.stop="duplicateLayer(index)" />
      <Button ghost icon="trash" title="Remove overlay" @click.stop="removeLayer(index)" />
    </div>
  </div>
  <Button wide icon="plus" v-if="layer" @click="selected = null"><span>Add overlay</span></Button>

  <div class="row" v-if="layer">
    <h3 class="grow">Editing "{{ layerName(layer) }}"</h3>
    <Button ghost v-if="layerModified" @click="resetLayer">Reset</Button>
  </div>
  <Segments v-if="!edge && kinds.length > 1" :options="kinds" :model-value="kind" @update:model-value="pickKind" />
  <TileGrid class="scroll" v-if="kind !== 'file'" :min="tileMin">
    <Tile v-for="[id, data] of shown" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id, shownLayer)" :author="credit(data, font?.id, fonts)" :selected="layer?.overlay === id" :menu="overlayMenu(id, data)" @pick="pickOverlay(id)" />
  </TileGrid>
  <template v-else>
    <UploadField accept="image/*" :label="layer?.file ? 'Replace image' : 'Choose an image'" empty="No file selected" :image="layer?.file" @change="readImage($event, pickFile)" />
  </template>

  <template v-if="layer">
    <Slider v-for="item of settings" :key="item.key" :label="item.label" :model-value="generatedSetting(layer, item)" @update:model-value="set(item.key, $event)" :min="item.min" :max="item.max" :step="item.step ?? 1" />
    <Dropdown label="Blend mode" :options="BLEND_OPTIONS" :model-value="layer.blend" @update:model-value="set('blend', $event)" />
    <Field group label="Colour">
      <div class="row">
        <ColourPicker class="grow" :model-value="layer.colour" @update:model-value="set('colour', $event)" />
        <Dropdown class="grow" :options="BLEND_OPTIONS" :model-value="layer.colourBlend" @update:model-value="set('colourBlend', $event)" v-tooltip="'Colour blend mode'" />
      </div>
    </Field>
    <Slider label="Opacity" :model-value="layer.opacity" @update:model-value="set('opacity', $event)" :min="0" :max="100" />
    <template v-if="wraps">
      <Toggle v-if="sideFaces" label="Wrap onto inner and side faces" hint="Carries the overlay from the letter's edge back along its inner and side faces." :model-value="!!layer.sideWrap" @update:model-value="set('sideWrap', $event)" />
      <Toggle label="Wrap onto top and bottom faces" hint="Carries the overlay from the letter's top and bottom edges back along its top and bottom faces." :model-value="!!layer.edgeWrap" @update:model-value="set('edgeWrap', $event)" />
    </template>
  </template>
</template>

<style scoped>
  .layers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .layer {
    font-size: var(--font-md);
    font-weight: 600;
    color: var(--muted);
  }

  .layer.dragged {
    position: relative;
    z-index: 1;
    box-shadow: var(--drag-shadow);
  }

  .grip {
    align-self: stretch;
    margin-right: -4px;
  }

  .layer.dragged,
  .layer.dragged .grip {
    cursor: grabbing;
  }

  .layer img {
    width: 64px;
    height: 30px;
    padding: 3px;
    object-fit: contain;
    image-rendering: pixelated;
    background: var(--field);
  }

  .scroll {
    max-height: 360px;
  }
</style>
