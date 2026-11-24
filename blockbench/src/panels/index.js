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
const isShape = settings => settings.shape !== null
const isDrawn = settings => !isMinecraftShape(settings.shape)

const STACKS = [
  {
    slot: "left_bar",
    sidebar_index: 0,
    sections: [
      { id: "minecraft_title_words", name: "Text", shapeName: "Shape", icon: "text_fields", groups: settings => [isText(settings) ? "title-words" : "shape-group"], panels: (settings, kind) => isText(settings) && kind !== "word" ? [PLACEMENT_PANEL] : [] },
      { id: "minecraft_title_font", name: "Font", icon: "font_download", shown: isText, groups: (settings, kind) => [kind === "word" ? "font-note" : "font-group"], panels: (settings, kind) => kind === "word" ? [CREEPER_PANEL] : [CURVES_PANEL, CREEPER_PANEL, TERMINATORS_PANEL, SPACING_PANEL] },
      { id: "minecraft_title_placement", name: "Placement", icon: "table_rows", shown: isShape, panels: () => [PLACEMENT_PANEL] }
    ]
  },
  {
    slot: "left_bar",
    sidebar_index: 1,
    sections: [
      { id: "minecraft_title_texture", name: "Texture", icon: "texture", shown: isDrawn, panels: () => [TEXTURE_LAYERS, TEXTURE_PANEL, TILING_PANEL] },
      { id: "minecraft_title_overlays", name: "Overlays", icon: "layers", shown: isDrawn, panels: () => [OVERLAY_LAYERS, OVERLAYS_PANEL, EDGE_OVERLAYS_PANEL] }
    ]
  },
  {
    slot: "right_bar",
    sidebar_index: 9,
    sections: [
      { id: "minecraft_title_colour", name: "Colour", icon: "palette", panels: () => [COLOUR_LAYERS, FILTERS_PANEL].concat(FACE_PANELS, OUTLINE_PANEL) },
      { id: "minecraft_title_form", name: "Form", icon: "deployed_code", shapes: true, panels: settings => [MATCH_PANEL, STRETCHING_PANEL, GEOMETRY_PANEL].concat(isDrawn(settings) ? [ARC_PANEL].concat(TWIST_PANELS) : []) }
    ]
  }
]

const [COLOUR_LAYERS, TEXTURE_LAYERS, OVERLAY_LAYERS] = ["colour", "texture", "overlays"].map(layersPanel)
const made = new Map()
let styles = null
let following = null

function component({ shapes, shown, groups, panels }) {
  return {
    components: { FontGroup, FontNote, ShapeGroup, TitleGroup, TitleWords },
    computed: {
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
      <div class="mtg-panel">
        <template v-if="applies">
          <component v-for="group of groups" :key="group + home" :is="group" />
          <title-group v-for="(panel, index) of panels" :key="panel.id + index + word" :panel="panel" :word="word" />
        </template>
        <p v-else-if="!element" class="mtg-hint mtg-none">Select a title text or shape to edit it.</p>
      </div>
    `
  }
}

function followKind() {
  if (!selected.value) return
  const settings = shownSettings(selected.value)
  for (const { sections: [host] } of STACKS) {
    const panel = made.get(host.id)
    if (host.shapeName) panel.handle.firstElementChild.textContent = isText(settings) ? host.name : host.shapeName
    settleTabs(panel)
  }
  updateInterfacePanels()
}

export function registerPanels() {
  styles = Blockbench.addCSS(STYLES)
  for (const { slot, sidebar_index, sections } of STACKS) {
    for (const [index, section] of sections.entries()) {
      const { id, name, icon, shown } = section
      made.set(id, titlePanel(id, {
        name,
        icon,
        growable: true,
        resizable: true,
        default_position: { slot, sidebar_index, float_position: [0, 0], float_size: [320, 500], height: 400, ...(index && { attached_to: sections[0].id, attached_index: sections.length - index }) },
        component: component(section)
      }, () => !shown || shown(selected.value ? shownSettings(selected.value) : UNSELECTED)))
    }
  }
  following = watch(() => selected.value && [isText, isDrawn].map(test => test(shownSettings(selected.value))).join(), followKind)
}

export function unregisterPanels() {
  following()
  for (const panel of Array.from(made.values()).reverse()) deleteTitlePanel(panel)
  made.clear()
  styles?.delete()
}
