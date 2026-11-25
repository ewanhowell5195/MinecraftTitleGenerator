import { ref } from "vue"
import { CAMERA_PANEL } from "#lib/panels/camera.js"
import { isMinecraftShape } from "#lib/geometry/shapes.js"
import { FACE_PANELS, FILTERS_PANEL, OUTLINE_PANEL } from "#lib/panels/colour.js"
import { CREEPER_PANEL, CURVES_PANEL, SPACING_PANEL, TERMINATORS_PANEL } from "#lib/panels/font.js"
import { ARC_PANEL, GEOMETRY_PANEL } from "#lib/panels/form.js"
import { layersPanel } from "#lib/panels/layers.js"
import { EDGE_OVERLAYS_PANEL, OVERLAYS_PANEL } from "#lib/panels/overlays.js"
import { PLACEMENT_PANEL } from "#lib/panels/placement.js"
import { FRAMING_PANEL, IMAGE_PANEL, SECOND_OUTLINE_PANEL } from "#lib/panels/render.js"
import { TEXTURE_PANEL } from "#lib/panels/texture.js"
import { TILING_PANEL } from "#lib/panels/tiling.js"
import { MATCH_PANEL, SCALING_PANEL } from "#lib/panels/transform.js"
import { TWIST_PANELS } from "#lib/panels/twists.js"
import { PANELS } from "#lib/settings/defaults.js"
import { isModified, wordKey } from "#lib/settings/settings.js"
import { kindOf, selected, shownSettings } from "../host.js"
import { deleteTitlePanel, titlePanel } from "../mode.js"
import { inRenderMode, rendered } from "../render/mode.js"
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

const [COLOUR_LAYERS, TEXTURE_LAYERS, OVERLAY_LAYERS] = ["colour", "texture", "overlays"].map(layersPanel)

const TABS = [
  { id: "text", name: "Text", icon: "text_fields", shown: isText, groups: () => ["title-words"], panels: placement },
  { id: "shape", name: "Shape", icon: "interests", shown: settings => !isText(settings), groups: () => ["shape-group"], panels: placement },
  { id: "font", name: "Font", icon: "font_download", shown: isText, groups: kind => [kind === "word" ? "font-note" : "font-group"], panels: (settings, kind) => kind === "word" ? [CREEPER_PANEL] : [CURVES_PANEL, CREEPER_PANEL, TERMINATORS_PANEL, SPACING_PANEL] },
  { id: "texture", name: "Texture", icon: "texture", shown: isDrawn, panels: () => [TEXTURE_LAYERS, TEXTURE_PANEL, TILING_PANEL] },
  { id: "colour", name: "Color", icon: "palette", panels: () => [COLOUR_LAYERS, FILTERS_PANEL].concat(FACE_PANELS, OUTLINE_PANEL) },
  { id: "overlays", name: "Overlay", icon: "layers", shown: isDrawn, panels: () => [OVERLAY_LAYERS, OVERLAYS_PANEL, EDGE_OVERLAYS_PANEL] },
  { id: "form", name: "Form", icon: "deployed_code", shapes: true, panels: settings => [MATCH_PANEL, STRETCHING_PANEL, GEOMETRY_PANEL].concat(isDrawn(settings) ? [ARC_PANEL].concat(TWIST_PANELS) : []) }
]

const RENDER_PANELS = [
  { id: "minecraft_title_render", name: "Render", icon: "photo_camera", slot: "left_bar", groups: [FRAMING_PANEL, SECOND_OUTLINE_PANEL, IMAGE_PANEL] },
  { id: "minecraft_title_camera", name: "Camera", icon: "videocam", slot: "right_bar", groups: [CAMERA_PANEL] }
]

const chosen = ref("text")
const panels = []
let styles = null

function placement(settings, kind) {
  return kind === "word" ? [] : [PLACEMENT_PANEL]
}

function section({ shapes, shown, groups, panels }) {
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
        return groups?.(this.kind) ?? []
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

const SECTIONS = new Map(TABS.map(tab => [tab.id, section(tab)]))

const TitleSections = {
  computed: {
    element: () => selected.value,
    tabs() {
      const settings = this.element ? shownSettings(this.element) : UNSELECTED
      return TABS.filter(({ shown }) => !shown || shown(settings))
    },
    open() {
      return this.tabs.find(({ id }) => id === chosen.value) ?? this.tabs[0]
    },
    section() {
      return SECTIONS.get(this.open.id)
    }
  },
  methods: {
    choose({ id }) {
      chosen.value = id
    }
  },
  template: `
    <div class="mtg-sections">
      <div v-if="element" class="mtg-tabs">
        <div v-for="tab of tabs" :key="tab.id" class="mtg-tab" :class="{ open: tab === open }" @click="choose(tab)"><i class="material-icons">{{ tab.icon }}</i>{{ tab.name }}</div>
      </div>
      <keep-alive><component :is="section" :key="open.id" /></keep-alive>
    </div>
  `
}

function renderSection(groups) {
  return {
    components: { TitleGroup },
    data: () => ({ groups: Object.freeze(groups) }),
    computed: {
      project: () => rendered.value
    },
    template: `
      <div class="mtg-sections">
        <div v-if="project" :key="project" class="mtg-panel">
          <title-group v-for="group of groups" :key="group.id" :panel="group" />
        </div>
      </div>
    `
  }
}

const PLACE = { sidebar_index: 0, float_position: [0, 0], float_size: [320, 500], height: 400 }

export function registerPanels() {
  styles = Blockbench.addCSS(STYLES)
  panels.push(titlePanel("minecraft_title", {
    name: "Title",
    icon: "text_fields",
    growable: true,
    resizable: true,
    default_position: { ...PLACE, slot: "left_bar" },
    component: TitleSections
  }))
  for (const { id, name, icon, slot, groups } of RENDER_PANELS) {
    panels.push(new Panel(id, { name, icon, growable: true, resizable: true, default_position: { ...PLACE, slot }, condition: inRenderMode, component: renderSection(groups) }))
  }
}

export function unregisterPanels() {
  for (const panel of panels.splice(0)) deleteTitlePanel(panel)
  styles?.delete()
}
