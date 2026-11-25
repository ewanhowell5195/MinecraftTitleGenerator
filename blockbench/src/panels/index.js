import { ref } from "vue"
import { CAMERA_PANEL } from "#lib/panels/camera.js"
import { CREEPER_PANEL } from "#lib/panels/font.js"
import { FONT_PANEL } from "#lib/panels/fontSource.js"
import { RENDER_PANELS, SECTION_PANELS, sectionFits, sectionPanels } from "#lib/panels/sections.js"
import { SHAPE_PANEL } from "#lib/panels/shapeSource.js"
import { MATCH_PANEL, SCALING_PANEL } from "#lib/panels/transform.js"
import { PANELS } from "#lib/settings/defaults.js"
import { isModified, wordKey } from "#lib/settings/settings.js"
import { kindOf, selected, shownSettings } from "../host.js"
import { deleteTitlePanel, titlePanel } from "../mode.js"
import { inRenderMode, rendered } from "../render/mode.js"
import { homeElement } from "../words.js"
import { TitleGroup } from "./controls.js"
import { closeFontBrowser } from "./fontBrowser.js"
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

const TABS = [
  { id: "text", name: "Text", icon: "text_fields", groups: () => ["title-words"], panels: lineOnly },
  { id: "shape", name: "Shape", icon: "interests", panels: () => SECTION_PANELS.shape.concat(SECTION_PANELS.placement) },
  { id: "font", name: "Font", icon: "font_download", groups: kind => kind === "word" ? ["font-note"] : [], panels: (panels, kind) => kind === "word" ? [CREEPER_PANEL] : panels },
  { id: "texture", name: "Texture", icon: "texture" },
  { id: "colour", name: "Color", icon: "palette" },
  { id: "overlays", name: "Overlay", icon: "layers" },
  { id: "form", name: "Form", icon: "deployed_code", shapes: true, panels: panels => [MATCH_PANEL, STRETCHING_PANEL].concat(panels) }
]

const RENDER_TABS = [
  { id: "minecraft_title_render", name: "Render", icon: "photo_camera", slot: "left_bar", groups: RENDER_PANELS },
  { id: "minecraft_title_camera", name: "Camera", icon: "videocam", slot: "right_bar", groups: [CAMERA_PANEL] }
]

const REMADE = [FONT_PANEL, SHAPE_PANEL]

const chosen = ref("text")
const panels = []
let styles = null

function lineOnly(panels, kind) {
  return kind === "word" ? [] : panels
}

function section({ id, shapes, groups, panels }) {
  return {
    components: { FontNote, TitleGroup, TitleWords },
    computed: {
      element: () => selected.value,
      settings: () => selected.value && shownSettings(selected.value),
      kind: () => selected.value && kindOf(selected.value),
      home: () => selected.value && homeElement(selected.value).uuid,
      word() {
        return !!shapes && this.kind === "word"
      },
      applies() {
        return !!this.element && sectionFits(id, this.settings.shape)
      },
      groups() {
        return groups?.(this.kind) ?? []
      },
      panels() {
        const own = sectionPanels(id, this.settings.shape)
        return Object.freeze(panels?.(own, this.kind) ?? own)
      }
    },
    methods: {
      remade(panel) {
        return REMADE.includes(panel) ? this.home : ""
      }
    },
    template: `
      <div class="mtg-panel">
        <template v-if="applies">
          <component v-for="group of groups" :key="group + home" :is="group" />
          <title-group v-for="(panel, index) of panels" :key="panel.id + index + word + remade(panel)" :panel="panel" :word="word" />
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
      return TABS.filter(({ id }) => sectionFits(id, settings.shape))
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
  for (const { id, name, icon, slot, groups } of RENDER_TABS) {
    panels.push(new Panel(id, { name, icon, growable: true, resizable: true, default_position: { ...PLACE, slot }, condition: inRenderMode, component: renderSection(groups) }))
  }
}

export function unregisterPanels() {
  closeFontBrowser()
  for (const panel of panels.splice(0)) deleteTitlePanel(panel)
  styles?.delete()
}
