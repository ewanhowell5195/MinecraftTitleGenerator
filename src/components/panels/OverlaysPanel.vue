<script setup>
  import { computed, ref, toRaw, watch } from "vue"
  import { credit } from "../../lib/credits.js"
  import { GENERATED_SETTINGS, WRAPPED_KINDS, generatedSetting } from "../../lib/generated.js"
  import { titleCase } from "../../lib/names.js"
  import { layerShown, usePanel } from "../../lib/panel.js"
  import { useListReorder } from "../../lib/reorder.js"
  import { library } from "../../lib/scene.js"
  import { BLEND_OPTIONS, OVERLAY_KINDS, activeOverlays, defaultOverlays, overlayLayer } from "../../lib/settings.js"
  import { popular } from "../../lib/stats.js"
  import { readFile, saveSheet, thumbnail, thumbnailHeight } from "../../lib/ui.js"
  import Button from "../Button.vue"
  import ColourPicker from "../ColourPicker.vue"
  import Dropdown from "../Dropdown.vue"
  import Field from "../Field.vue"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Tile from "../Tile.vue"
  import TileGrid from "../TileGrid.vue"
  import UploadField from "../UploadField.vue"
  import Toggle from "../Toggle.vue"

  const MODES = [{ value: "default", label: "Default" }, { value: "custom", label: "Custom" }]
  const KINDS = [{ value: "generated", label: "Generated" }, { value: "texture", label: "Texture" }, { value: "file", label: "File" }]

  const props = defineProps({ edge: { type: Boolean, default: false } })

  const listKey = props.edge ? "edgeOverlays" : "overlays"
  const modeKey = OVERLAY_KINDS[listKey]
  const { object, font, list, modified, reset } = usePanel(listKey)
  const shownLayer = layerShown("overlays")
  const available = computed(() => list.value?.[listKey] ?? {})
  const overlays = computed(() => popular(Object.entries(available.value), ([id]) => `${font.value?.id}.${id}`, ([id, data]) => data.name ?? titleCase(id)))
  const selected = ref(0)
  const pending = ref("generated")

  function overlayMenu(id, data) {
    return data.generated ? null : [{ label: "Download overlay", icon: "download", action: () => saveSheet(font.value, "overlays", id) }]
  }
  const defaults = computed(() => defaultOverlays(list.value, object.value, listKey))
  const layers = computed(() => activeOverlays(list.value, object.value, listKey))
  const layer = computed(() => layers.value[selected.value] ?? null)
  const generated = computed(() => layer.value?.source === "premade" ? available.value[layer.value.overlay]?.generated ?? null : null)
  const kinds = computed(() => font.value?.model ? KINDS.filter(item => item.value !== "generated") : KINDS)
  const kind = computed(() => !layer.value ? kinds.value.find(item => item.value === pending.value)?.value ?? kinds.value[0].value : layer.value.source === "file" ? "file" : generated.value ? "generated" : "texture")
  const shown = computed(() => overlays.value.filter(ofKind(kind.value)))
  const settings = computed(() => GENERATED_SETTINGS[generated.value] ?? [])
  const wraps = computed(() => !props.edge && !font.value?.model && !WRAPPED_KINDS.has(generated.value))
  const baseline = computed(() => layer.value ? { ...overlayLayer(layer.value.overlay, layer.value.source === "file" ? null : available.value[layer.value.overlay]), source: layer.value.source, file: layer.value.file } : null)
  const layerModified = computed(() => {
    if (!layer.value) return false
    if (["blend", "colour", "colourBlend", "opacity"].some(key => layer.value[key] !== baseline.value[key])) return true
    if (["sideWrap", "edgeWrap"].some(key => !!layer.value[key] !== !!baseline.value[key])) return true
    return settings.value.some(item => item.key !== "seed" && generatedSetting(layer.value, item) !== generatedSetting(baseline.value, item))
  })

  function ofKind(value) {
    return ([, data]) => !!data.generated === (value === "generated")
  }

  function layerName(item) {
    if (item.source === "file") return "Custom file"
    return available.value[item.overlay]?.name ?? titleCase(item.overlay ?? "")
  }

  function custom() {
    if (object.value[modeKey] !== "custom") {
      object.value[listKey] = structuredClone(toRaw(defaults.value))
      object.value[modeKey] = "custom"
    }
    return object.value[listKey]
  }

  function set(key, value) {
    custom()[selected.value][key] = value
  }

  function pickMode(mode) {
    if (mode === "custom" && !object.value[listKey].length) object.value[listKey] = structuredClone(toRaw(defaults.value))
    object.value[modeKey] = mode
    selected.value = 0
  }

  function resetLayers() {
    reset()
    selected.value = 0
  }

  function addLayer(item) {
    custom().push(item)
    selected.value = object.value[listKey].length - 1
  }

  function pickFile(file) {
    if (layer.value) set("file", file)
    else addLayer({ ...overlayLayer(null), source: "file", file })
  }

  function freshLayer(id, seed) {
    const fresh = overlayLayer(id, available.value[id])
    const setting = GENERATED_SETTINGS[available.value[id].generated]?.find(item => item.key === "seed")
    if (seed !== undefined) fresh.seed = seed
    else if (setting) fresh.seed = Math.floor(Math.random() * (setting.max + 1))
    return fresh
  }

  function pickOverlay(id) {
    if (!layer.value) return addLayer(freshLayer(id))
    if (layer.value.overlay === id) return
    const target = custom()[selected.value]
    custom()[selected.value] = { ...freshLayer(id, target.seed), source: target.source, file: target.file }
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
    custom()[selected.value] = fresh
  }

  function removeLayer(index) {
    custom().splice(index, 1)
    if (index < selected.value) selected.value--
    selected.value = Math.max(0, Math.min(selected.value, object.value[listKey].length - 1))
  }

  function duplicateLayer(index) {
    const target = custom()
    target.splice(index + 1, 0, structuredClone(toRaw(target[index])))
    selected.value = index + 1
  }

  function moveLayer(from, to) {
    const target = custom()
    const chosen = target[selected.value]
    target.splice(to, 0, target.splice(from, 1)[0])
    selected.value = target.indexOf(chosen)
  }

  const box = ref(null)
  const rows = []
  const { dragged, press } = useListReorder({ box, rows, ids: () => Array.from(layers.value.keys()), move: dragLayer })

  function dragLayer(drag, to) {
    moveLayer(drag.id, to)
    drag.id = to
  }

  watch(() => [object.value.id, object.value.textureSource, object.value.texture, object.value.textureVariant], () => {
    selected.value = 0
  })
</script>

<template>
  <Panel :title="edge ? 'Edge overlays' : font?.model ? 'Overlays' : 'Face overlays'" :modified="modified" @reset="resetLayers">
    <Toggle v-if="!edge && object.textureSource !== 'premade' && font?.overlay" label="Hide the font's own overlay" v-model="object.disableFontOverlay" />
    <Segments :options="MODES" :model-value="object[modeKey]" @update:model-value="pickMode" />
    <p class="hint" v-if="edge">Paints the top and bottom faces around each letter.</p>
    <p class="hint" v-if="object[modeKey] === 'default'">The overlays this texture comes with. Editing switches to Custom.</p>
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
    <Segments v-if="!edge" :options="kinds" :model-value="kind" @update:model-value="pickKind" />
    <TileGrid class="scroll" v-if="kind !== 'file'">
      <Tile v-for="[id, data] of shown" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id, shownLayer)" :author="credit(data, font?.id, library.fonts)" :selected="layer?.overlay === id" :menu="overlayMenu(id, data)" @pick="pickOverlay(id)" />
    </TileGrid>
    <template v-else>
      <UploadField accept="image/png" :label="layer?.file ? 'Replace PNG' : 'Choose a PNG'" empty="No file selected" :image="layer?.file" @change="readFile($event, pickFile)" />
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
        <Toggle v-if="object.internalFaces || object.sideFaces" label="Wrap onto inner and side faces" hint="Carries the overlay from the letter's edge back along its inner and side faces." :model-value="!!layer.sideWrap" @update:model-value="set('sideWrap', $event)" />
        <Toggle label="Wrap onto top and bottom faces" hint="Carries the overlay from the letter's top and bottom edges back along its top and bottom faces." :model-value="!!layer.edgeWrap" @update:model-value="set('edgeWrap', $event)" />
      </template>
    </template>
  </Panel>
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
