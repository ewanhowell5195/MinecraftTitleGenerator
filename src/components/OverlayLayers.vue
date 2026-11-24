<script setup>
  import { ref } from "vue"
  import { credit } from "../lib/font/credits.js"
  import { generatedSetting } from "../lib/texture/overlays/settings.js"
  import { titleCase } from "../lib/core/names.js"
  import { COLOUR_HINTS, COLOUR_MODES, useOverlayLayers } from "../lib/panels/overlayLayers.js"
  import { useListReorder } from "./composables/reorder.js"
  import { BLEND_OPTIONS } from "../lib/settings/defaults.js"
  import { popular } from "../lib/title/popularity.js"
  import { readImage, saveSheet } from "../lib/state/imageFiles.js"
  import { thumbnail, thumbnailHeight } from "../lib/font/thumbnailUrls.js"
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
  import UploadReuse from "./UploadReuse.vue"

  const props = defineProps({
    layers: { type: Array, required: true },
    edit: { type: Function, required: true },
    available: { type: Object, required: true },
    font: { type: Object, default: null },
    statScope: { type: String, default: null },
    fonts: { type: Array, default: () => [] },
    shownLayer: { type: Number, default: null },
    edge: { type: Boolean, default: false },
    files: { type: Boolean, default: true },
    sideFaces: { type: Boolean, default: false },
    tileMin: { type: Number, default: null },
    reuse: { type: Array, default: () => [] },
    hideable: { type: Boolean, default: true }
  })

  const selected = defineModel("selected", { type: Number, default: 0 })

  const { colourAt, colourMode, duplicateLayer, kind, kinds, layer, layerModified, layerName, moveLayer, palette, pickFile, pickKind, pickOverlay, removeLayer, resetLayer, reusable, set, setColour, setColourMode, shown, shownSettings, toggleLayer, wraps } = useOverlayLayers(props, selected, popular)

  function overlayMenu(id, data) {
    return data.generated ? null : [{ label: "Download overlay", icon: "download", action: () => saveSheet(props.font, "overlays", id) }]
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
    <div :ref="el => (rows[index] = el)" class="layer card card-row small" v-for="(item, index) of layers" :key="index" tabindex="0" role="button" :aria-pressed="selected === index" @click="selected = index" @keydown.enter="selected = index" @keydown.space.self.prevent="selected = index" :class="{ selected: selected === index, dragged: dragged === index, hidden: item.hidden }">
      <span class="grip" @pointerdown="press($event, index)"><Icon name="grip" :size="14" /></span>
      <img :src="item.source === 'file' ? item.file : thumbnail(font, item.overlay, shownLayer)" alt="">
      <span class="name grow ellipsis">{{ layerName(item) }}</span>
      <span class="actions">
        <Button ghost v-if="hideable" :icon="item.hidden ? 'hidden' : 'eye'" :title="item.hidden ? 'Show this overlay' : 'Hide this overlay'" :aria-pressed="!!item.hidden" @click.stop="toggleLayer(index)" />
        <Button ghost icon="copy" title="Duplicate overlay" @click.stop="duplicateLayer(index)" />
        <Button ghost icon="trash" title="Remove overlay" @click.stop="removeLayer(index)" />
      </span>
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
    <UploadReuse :items="reusable" @pick="pickFile" />
  </template>

  <template v-if="layer">
    <template v-for="item of shownSettings" :key="item.key">
      <Dropdown v-if="item.options" :label="item.label" :options="item.options" :model-value="generatedSetting(layer, item)" @update:model-value="set(item.key, $event)" />
      <Slider v-else :label="item.label" :model-value="generatedSetting(layer, item)" @update:model-value="set(item.key, $event)" :min="item.min" :max="item.max" :step="item.step ?? 1" :steps="item.steps ?? null" />
    </template>
    <Dropdown label="Blend mode" :options="BLEND_OPTIONS" :model-value="layer.blend" @update:model-value="set('blend', $event)" />
    <Field group :label="palette.anchors.length > 1 && !palette.complex ? 'Colours' : 'Colour'">
      <template v-if="palette.complex">
        <Segments :options="COLOUR_MODES" :model-value="colourMode" @update:model-value="setColourMode" />
        <p class="hint">{{ COLOUR_HINTS[colourMode] }}</p>
      </template>
      <div v-if="colourMode === 'colours'" class="colours">
        <ColourPicker v-for="(anchor, index) of palette.anchors" :key="index" :model-value="colourAt(index)" @update:model-value="setColour(index, $event)" />
      </div>
      <div v-else-if="colourMode === 'tint'" class="row">
        <ColourPicker class="grow" :model-value="layer.tint" @update:model-value="set('tint', $event)" />
        <Dropdown class="grow" :options="BLEND_OPTIONS" :model-value="layer.tintBlend" @update:model-value="set('tintBlend', $event)" v-tooltip="'Tint mode'" />
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

  .layer.hidden img {
    opacity: 0.3;
  }

  .layer.hidden .name {
    color: var(--faint);
  }

  .actions {
    display: flex;
    gap: 2px;
  }

  .scroll {
    max-height: 360px;
  }

  .colours {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
</style>
