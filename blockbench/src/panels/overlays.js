import { titleCase } from "../../../src/lib/core/names.js"
import { platform } from "../../../src/lib/core/platform.js"
import { credit } from "../../../src/lib/font/credits.js"
import { thumbnail, thumbnailHeight } from "../../../src/lib/font/thumbnailUrls.js"
import { COLOUR_HINTS, COLOUR_MODES, useOverlayLayers } from "../../../src/lib/panels/overlayLayers.js"
import { usedOverlayFiles } from "../../../src/lib/panels/uploads.js"
import { BLEND_OPTIONS } from "../../../src/lib/settings/defaults.js"
import { generatedSetting } from "../../../src/lib/texture/overlays/settings.js"
import { popular } from "../../../src/lib/title/popularity.js"
import { statScope } from "../../../src/lib/title/statIds.js"
import { selectedElements } from "../host.js"
import { library } from "../library.js"
import { beginEdit, edit, finishEdit } from "../undo.js"
import { sortRows } from "./drag.js"
import { INPUTS } from "./inputs.js"
import { TILES, readImage } from "./tiles.js"

const LABEL = "Change title overlays"

export const OverlaysBlock = {
  components: { ...INPUTS, ...TILES },
  props: { context: Object, panel: Object },
  setup({ context, panel }) {
    const { available, edit: editLayers, layers, selected, shownLayer } = context.state
    const edge = panel.id === "edgeOverlays"
    const stack = useOverlayLayers({
      get layers() {
        return layers.value
      },
      get available() {
        return available.value
      },
      get font() {
        return context.font
      },
      get statScope() {
        return statScope(context.object, context.font?.id)
      },
      get reuse() {
        return usedOverlayFiles()
      },
      edit: editLayers,
      edge,
      files: true
    }, selected, popular)

    function change(action) {
      edit(selectedElements(), LABEL, action)
    }

    function slide(key, action) {
      beginEdit(selectedElements(), `${panel.id}-${key}`)
      action()
    }

    function done() {
      finishEdit(LABEL)
    }

    function upload(files) {
      readImage(files, data => change(() => stack.pickFile(data)))
    }

    function picture(item) {
      const source = item.source === "file" ? item.file : thumbnail(context.font, item.overlay, shownLayer.value)
      return source && platform.asset(source)
    }

    function sort(event, from) {
      sortRows(event, event.target.closest(".mtg-rows"), from, { move: (at, to) => slide("order", () => stack.moveLayer(at, to)), end: done })
    }

    return {
      ...stack, BLEND_OPTIONS, COLOUR_HINTS, COLOUR_MODES, change, done, edge, generatedSetting, layers, picture, selected, slide, sort, titleCase, upload,
      overlayCredit: data => credit(data, context.font?.id, library.fonts),
      sideFaces: () => !!(context.object.internalFaces || context.object.sideFaces),
      thumb: id => thumbnail(context.font, id, shownLayer.value),
      unit: () => thumbnailHeight(context.font)
    }
  },
  template: `
    <div class="mtg-controls">
      <div v-if="layers.length" class="mtg-rows">
        <div v-for="(item, index) of layers" :key="index" class="mtg-layer" :class="{ selected: selected === index, off: item.hidden }" @click="selected = index">
          <i class="material-icons mtg-grip" @pointerdown="sort($event, index)">drag_handle</i>
          <img :src="picture(item)" alt="">
          <span class="mtg-fill">{{ layerName(item) }}</span>
          <div class="tool" :title="item.hidden ? 'Show this overlay' : 'Hide this overlay'" @click.stop="change(() => toggleLayer(index))"><i class="material-icons">{{ item.hidden ? 'visibility_off' : 'visibility' }}</i></div>
          <div class="tool" title="Duplicate overlay" @click.stop="change(() => duplicateLayer(index))"><i class="material-icons">content_copy</i></div>
          <div class="tool" title="Remove overlay" @click.stop="change(() => removeLayer(index))"><i class="material-icons">delete</i></div>
        </div>
      </div>
      <button v-if="layer" class="mtg-button" @click="selected = null"><i class="material-icons">add</i><span>Add overlay</span></button>

      <div v-if="layer" class="mtg-row">
        <h4 class="mtg-fill">Editing "{{ layerName(layer) }}"</h4>
        <div v-if="layerModified" class="tool" title="Reset" @click="change(resetLayer)"><i class="material-icons">replay</i></div>
      </div>
      <segments-control v-if="!edge && kinds.length > 1" :options="kinds" :value="kind" @change="change(() => pickKind($event))" />
      <div v-if="kind !== 'file'" class="mtg-grid mtg-scroll">
        <title-tile v-for="[id, data] of shown" :key="id" :label="data.name || titleCase(id)" :unit="unit()" :image="thumb(id)" :author="overlayCredit(data)" :selected="!!layer && layer.overlay === id" @pick="change(() => pickOverlay(id))" />
      </div>
      <template v-else>
        <upload-control accept="image/*" :label="layer && layer.file ? 'Replace image' : 'Choose an image'" empty="No file selected" :image="layer && layer.file" @files="upload" />
        <reuse-tiles :items="reusable" @pick="change(() => pickFile($event))" />
      </template>

      <template v-if="layer">
        <template v-for="item of shownSettings">
          <dropdown-control v-if="item.options" :key="item.key" :label="item.label" :options="item.options" :value="generatedSetting(layer, item)" @change="change(() => set(item.key, $event))" />
          <slider-control v-else :key="item.key" :label="item.label" :value="generatedSetting(layer, item)" :min="item.min" :max="item.max" :step="item.step || 1" :steps="item.steps || null" @change="slide(item.key, () => set(item.key, $event))" @done="done" />
        </template>
        <dropdown-control label="Blend mode" :options="BLEND_OPTIONS" :value="layer.blend" @change="change(() => set('blend', $event))" />
        <div class="mtg-field">
          <label>{{ palette.anchors.length > 1 && !palette.complex ? 'Colours' : 'Colour' }}</label>
          <template v-if="palette.complex">
            <segments-control :options="COLOUR_MODES" :value="colourMode" @change="change(() => setColourMode($event))" />
            <p class="mtg-hint">{{ COLOUR_HINTS[colourMode] }}</p>
          </template>
          <div v-if="colourMode === 'colours'" class="mtg-colours">
            <colour-control v-for="(anchor, index) of palette.anchors" :key="index" :value="colourAt(index)" @change="slide('colours', () => setColour(index, $event))" @done="done" />
          </div>
          <div v-else-if="colourMode === 'tint'" class="mtg-row">
            <colour-control :value="layer.tint" @change="slide('tint', () => set('tint', $event))" @done="done" />
            <dropdown-control :options="BLEND_OPTIONS" :value="layer.tintBlend" title="Tint mode" @change="change(() => set('tintBlend', $event))" />
          </div>
        </div>
        <slider-control label="Opacity" :value="layer.opacity" :min="0" :max="100" @change="slide('opacity', () => set('opacity', $event))" @done="done" />
        <template v-if="wraps">
          <toggle-control v-if="sideFaces()" label="Wrap onto inner and side faces" hint="Carries the overlay from the letter's edge back along its inner and side faces." :value="!!layer.sideWrap" @change="change(() => set('sideWrap', $event))" />
          <toggle-control label="Wrap onto top and bottom faces" hint="Carries the overlay from the letter's top and bottom edges back along its top and bottom faces." :value="!!layer.edgeWrap" @change="change(() => set('edgeWrap', $event))" />
        </template>
      </template>
    </div>
  `
}
