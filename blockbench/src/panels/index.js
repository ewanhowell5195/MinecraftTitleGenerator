import { watch } from "vue"
import { isMinecraftShape } from "../../../src/lib/geometry/shapes.js"
import { FACE_PANELS, FILTERS_PANEL, OUTLINE_PANEL } from "../../../src/lib/panels/colour.js"
import { CREEPER_PANEL, CURVES_PANEL, SPACING_PANEL, TERMINATORS_PANEL } from "../../../src/lib/panels/font.js"
import { ARC_PANEL, GEOMETRY_PANEL } from "../../../src/lib/panels/form.js"
import { layersPanel } from "../../../src/lib/panels/layers.js"
import { EDGE_OVERLAYS_PANEL, OVERLAYS_PANEL } from "../../../src/lib/panels/overlays.js"
import { PLACEMENT_PANEL } from "../../../src/lib/panels/placement.js"
import { TEXTURE_PANEL } from "../../../src/lib/panels/texture.js"
import { TILING_PANEL } from "../../../src/lib/panels/tiling.js"
import { MATCH_PANEL, SCALING_PANEL } from "../../../src/lib/panels/transform.js"
import { TWIST_PANELS } from "../../../src/lib/panels/twists.js"
import { PANELS } from "../../../src/lib/settings/defaults.js"
import { isModified, wordKey } from "../../../src/lib/settings/settings.js"
import { kindOf, selected, shownSettings } from "../host.js"
import { deleteTitlePanel, settleTabs, titlePanel } from "../mode.js"
import { homeElement } from "../words.js"
import { TitleGroup } from "./controls.js"
import { FontGroup } from "./font.js"
import { ShapeGroup } from "./shape.js"
import { STYLES } from "./styles.js"
import { FontNote, TitleWords } from "./words.js"

const SCALING = ["scaleMarked", "scaleOutline"]

const STRETCHING_PANEL = {
  ...SCALING_PANEL,
  title: "Scaling",
  modified: (get, { object, word }) => isModified(object, word ? "wordTransform" : "transform", {}, word ? SCALING.map(wordKey) : SCALING),
  reset({ set }) {
    const values = PANELS.transform()
    for (const key of SCALING) set(key, values[key])
  }
}

const UNSELECTED = { shape: null }
const isText = settings => settings.shape === null
const isDrawn = settings => !isMinecraftShape(settings.shape)

const BESIDE_TRANSFORM = { slot: "right_bar", sidebar_index: 2, attached_to: "transform", attached_index: 0 }

const SECTIONS = [
  { id: "minecraft_title_words", name: "Text", shapeName: "Shape", icon: "text_fields", groups: settings => [isText(settings) ? "title-words" : "shape-group"], panels: (settings, kind) => kind === "word" ? [] : [PLACEMENT_PANEL] },
  { id: "minecraft_title_font", name: "Font", icon: "font_download", shown: isText, groups: (settings, kind) => [kind === "word" ? "font-note" : "font-group"], panels: (settings, kind) => kind === "word" ? [CREEPER_PANEL] : [CURVES_PANEL, CREEPER_PANEL, TERMINATORS_PANEL, SPACING_PANEL] },
  { id: "minecraft_title_texture", name: "Texture", icon: "texture", shown: isDrawn, panels: () => [TEXTURE_LAYERS, TEXTURE_PANEL, TILING_PANEL] },
  { id: "minecraft_title_colour", name: "Color", icon: "palette", panels: () => [COLOUR_LAYERS, FILTERS_PANEL].concat(FACE_PANELS, OUTLINE_PANEL) },
  { id: "minecraft_title_overlays", name: "Overlay", icon: "layers", shown: isDrawn, panels: () => [OVERLAY_LAYERS, OVERLAYS_PANEL, EDGE_OVERLAYS_PANEL] },
  { id: "minecraft_title_form", name: "Form", icon: "deployed_code", place: BESIDE_TRANSFORM, shapes: true, panels: settings => [MATCH_PANEL, STRETCHING_PANEL, GEOMETRY_PANEL].concat(isDrawn(settings) ? [ARC_PANEL].concat(TWIST_PANELS) : []) }
]

const [COLOUR_LAYERS, TEXTURE_LAYERS, OVERLAY_LAYERS] = ["colour", "texture", "overlays"].map(layersPanel)
const made = new Map()
let styles = null
let following = null

function component({ place, shapes, shown, groups, panels }) {
  return {
    components: { FontGroup, FontNote, ShapeGroup, TitleGroup, TitleWords },
    computed: {
      filling: () => !place,
      element: () => selected.value,
      settings: () => selected.value && shownSettings(selected.value),
      kind: () => selected.value && kindOf(selected.value),
      home: () => selected.value && homeElement(selected.value).uuid,
      word() {
        return !!shapes && this.kind === "word"
      },
      applies() {
        return !!this.element && (!shown || shown(this.settings))
      },
      groups() {
        return groups?.(this.settings, this.kind) ?? []
      },
      panels() {
        return Object.freeze(panels(this.settings, this.kind))
      }
    },
    template: `
      <div class="mtg-panel" :class="{ filling }">
        <template v-if="applies">
          <component v-for="group of groups" :key="group + home" :is="group" />
          <title-group v-for="(panel, index) of panels" :key="panel.id + index + word" :panel="panel" :word="word" />
        </template>
        <p v-else-if="!element" class="mtg-hint mtg-none">Select a title text or shape to edit it.</p>
      </div>
    `
  }
}

function selectedSettings() {
  return selected.value ? shownSettings(selected.value) : UNSELECTED
}

function followKind() {
  const settings = selectedSettings()
  const [{ id, name, shapeName }] = SECTIONS
  const host = made.get(id)
  host.handle.firstElementChild.textContent = isText(settings) ? name : shapeName
  settleTabs(host)
  updateInterfacePanels()
}

export function registerPanels() {
  styles = Blockbench.addCSS(STYLES)
  for (const [index, section] of SECTIONS.entries()) {
    const { id, name, icon, place, shown } = section
    made.set(id, titlePanel(id, {
      name,
      icon,
      growable: !place,
      resizable: true,
      default_position: { slot: "left_bar", sidebar_index: 0, float_position: [0, 0], float_size: [320, 500], height: 400, ...(place ?? (index && { attached_to: SECTIONS[0].id, attached_index: SECTIONS.length - index })) },
      component: component(section)
    }, () => !shown || shown(selectedSettings())))
  }
  following = watch(() => [isText, isDrawn].map(test => test(selectedSettings())).join(), followKind)
}

export function unregisterPanels() {
  following()
  for (const panel of Array.from(made.values()).reverse()) deleteTitlePanel(panel)
  made.clear()
  styles?.delete()
}
