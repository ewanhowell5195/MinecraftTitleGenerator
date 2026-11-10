<script setup>
  import { computed, ref, toRaw, watch } from "vue"
  import { credit } from "../../lib/credits.js"
  import { clamp } from "../../lib/maths.js"
  import { GENERATED_SETTINGS, generatedSetting } from "../../lib/generated.js"
  import { titleCase } from "../../lib/names.js"
  import { usePanel } from "../../lib/panel.js"
  import { useReorderDrag } from "../../lib/reorder.js"
  import { library } from "../../lib/scene.js"
  import { BLEND_OPTIONS, OVERLAY_KINDS, activeOverlays, defaultOverlays, overlayLayer } from "../../lib/settings.js"
  import { popular } from "../../lib/stats.js"
  import { readFile, saveSheet, thumbnail, thumbnailHeight } from "../../lib/ui.js"
  import Button from "../Button.vue"
  import ColourPicker from "../ColourPicker.vue"
  import Dropdown from "../Dropdown.vue"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Tile from "../Tile.vue"
  import Toggle from "../Toggle.vue"

  const MODES = [{ value: "default", label: "Default" }, { value: "custom", label: "Custom" }]
  const KINDS = [{ value: "generated", label: "Generated" }, { value: "texture", label: "Texture" }, { value: "file", label: "File" }]

  const props = defineProps({ edge: { type: Boolean, default: false } })

  const listKey = props.edge ? "edgeOverlays" : "overlays"
  const modeKey = OVERLAY_KINDS[listKey]
  const { object, font, list, modified, reset } = usePanel(listKey)
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
  const kind = computed(() => !layer.value ? pending.value : layer.value.source === "file" ? "file" : generated.value ? "generated" : "texture")
  const shown = computed(() => overlays.value.filter(ofKind(kind.value)))
  const settings = computed(() => GENERATED_SETTINGS[generated.value] ?? [])
  const baseline = computed(() => layer.value ? { ...overlayLayer(layer.value.overlay, layer.value.source === "file" ? null : available.value[layer.value.overlay]), source: layer.value.source, file: layer.value.file } : null)
  const layerModified = computed(() => {
    if (!layer.value) return false
    if (["blend", "colour", "colourBlend", "opacity"].some(key => layer.value[key] !== baseline.value[key])) return true
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
  const { dragged, press } = useReorderDrag({ prevent: true, begin, point: event => event.clientY, reorder, follow, release: clearRows })

  function begin(event, index) {
    return { id: index, grab: event.clientY - rows[index].getBoundingClientRect().top }
  }

  function reorder(drag) {
    const to = layers.value.filter((item, index) => {
      if (index === drag.id) return false
      const rect = rows[index].getBoundingClientRect()
      return rect.top + rect.height / 2 < drag.point
    }).length
    if (to === drag.id) return
    moveLayer(drag.id, to)
    drag.id = to
  }

  function follow(drag) {
    clearRows()
    const row = rows[drag.id]
    const rect = row.getBoundingClientRect()
    const area = box.value.getBoundingClientRect()
    row.style.transform = `translateY(${clamp(drag.point - drag.grab, area.top, area.bottom - rect.height) - rect.top}px)`
  }

  function clearRows() {
    for (const row of rows.slice(0, layers.value.length)) row.style.transform = ""
  }

  watch(() => [object.value.id, object.value[modeKey], object.value.texture, object.value.textureVariant], () => {
    selected.value = 0
  })
</script>

<template>
  <Panel :title="edge ? 'Edge overlays' : 'Face overlays'" :modified="modified" @reset="reset">
    <Toggle v-if="!edge && object.textureSource !== 'premade' && font?.overlay" label="Hide the font's own overlay" v-model="object.disableFontOverlay" />
    <Segments :options="MODES" :model-value="object[modeKey]" @update:model-value="pickMode" />
    <p class="hint" v-if="edge">Paints the top and bottom faces around each letter.</p>
    <p class="hint" v-if="object[modeKey] === 'default'">The overlays this texture comes with. Editing switches to Custom.</p>
    <div ref="box" class="layers" v-if="layers.length">
      <div :ref="el => (rows[index] = el)" class="layer card" v-for="(item, index) of layers" :key="index" tabindex="0" @click="selected = index" @keydown.enter="selected = index" :class="{ selected: selected === index, dragged: dragged === index }">
        <span class="grip" @pointerdown="press($event, index)" title="Drag to reorder"><Icon name="grip" :size="14" /></span>
        <img :src="item.source === 'file' ? item.file : thumbnail(font, item.overlay)" alt="">
        <span class="grow ellipsis">{{ layerName(item) }}</span>
        <Button tiny ghost @click.stop="duplicateLayer(index)" title="Duplicate overlay"><template #icon><Icon name="copy" :size="14" /></template></Button>
        <Button tiny ghost @click.stop="removeLayer(index)" title="Remove overlay"><template #icon><Icon name="trash" :size="14" /></template></Button>
      </div>
    </div>
    <Button wide v-if="layer" @click="selected = null"><template #icon><Icon name="plus" :size="16" /></template><span>Add overlay</span></Button>

    <div class="row" v-if="layer">
      <h3 class="grow">Editing "{{ layerName(layer) }}"</h3>
      <Button ghost v-if="layerModified" @click="resetLayer" title="Reset this overlay">Reset</Button>
    </div>
    <Segments v-if="!edge" :options="KINDS" :model-value="kind" @update:model-value="pickKind" />
    <div class="grid scroll" v-if="kind !== 'file'">
      <Tile v-for="[id, data] of shown" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id)" :author="credit(data, font?.id, library.fonts)" :selected="layer?.overlay === id" :menu="overlayMenu(id, data)" :save="data.generated ? null : 'Download this overlay'" @pick="pickOverlay(id)" @save="saveSheet(font, 'overlays', id)" />
    </div>
    <template v-else>
      <div class="upload-preview">
        <img v-if="layer?.file" :src="layer.file" alt="">
        <div v-else class="empty">No file selected</div>
      </div>
      <Button file wide accept="image/png" @change="readFile($event, pickFile)">
        <span>Choose a PNG</span>
        
      </Button>
    </template>

    <template v-if="layer">
      <Slider v-for="item of settings" :key="item.key" :label="item.label" :model-value="generatedSetting(layer, item)" @update:model-value="set(item.key, $event)" :min="item.min" :max="item.max" />
      <Dropdown label="Blend mode" :options="BLEND_OPTIONS" :model-value="layer.blend" @update:model-value="set('blend', $event)" />
      <div class="field">
        <span class="label">Colour</span>
        <div class="row">
          <ColourPicker class="grow" :model-value="layer.colour" @update:model-value="set('colour', $event)" />
          <Dropdown class="grow" :options="BLEND_OPTIONS" :model-value="layer.colourBlend" @update:model-value="set('colourBlend', $event)" title="Colour blend mode" />
        </div>
      </div>
      <Slider label="Opacity" :model-value="layer.opacity" @update:model-value="set('opacity', $event)" :min="0" :max="100" />
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
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
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
