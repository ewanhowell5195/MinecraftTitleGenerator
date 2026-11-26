import { FORMAT } from "./format.js"
import { openPresets } from "./presets/index.js"
import { placeLater } from "./render/angle.js"

const PRESETS = "minecraft_title_presets"
const KEPT_FILE = ["open_model", "open_from_link", "new_window", "tab_overview"]
const KEPT_MISC = ["experimental_settings"]
const PROJECT_CATEGORIES = ["edit", "select", "transform", "textures", "uv", "animation", "layers", "paint", "display", "color", "tools"]
const PROJECT_VIEWS = ["focus_on_selection", "screenshot_model", "advanced_screenshot", "record_model_gif", "edit_reference_images", "add_reference_image", "reference_image_from_clipboard"]
const PROJECT_MENUS = ["edit", "tools", "filter"]

const browsing = new Set()
const wrapped = new Map()

export function isBrowsing() {
  return !!Project && browsing.has(Project.uuid)
}

function blocked(item) {
  if (item instanceof Mode) return item.id !== PRESETS
  if (item.category === "file") return !KEPT_FILE.includes(item.id)
  if (item.category === "misc") return !KEPT_MISC.includes(item.id)
  return PROJECT_CATEGORIES.includes(item.category) || PROJECT_VIEWS.includes(item.id)
}

function redraw() {
  Modes.vue?.$forceUpdate()
  MenuBar.update()
}

export function startBrowsing() {
  if (!newProject(Formats[FORMAT])) return
  browsing.add(Project.uuid)
  redraw()
  openPresets()
}

export function finishBrowsing() {
  if (!isBrowsing()) return
  browsing.delete(Project.uuid)
  Undo.history = []
  Undo.index = 0
  placeLater({ project: Project })
  redraw()
}

export function forgetBrowsing() {
  if (Project) browsing.delete(Project.uuid)
}

export function registerBrowsing() {
  const menus = PROJECT_MENUS.map(id => MenuBar.menus[id]).filter(Boolean)
  for (const item of Object.values(Modes.options).concat(Object.values(BarItems))) {
    if (!blocked(item) || wrapped.has(item)) continue
    wrapped.set(item, item.condition)
  }
  for (const item of menus) wrapped.set(item, item.condition)
  for (const [item, condition] of wrapped) item.condition = () => !isBrowsing() && Condition(condition)
}

export function unregisterBrowsing() {
  for (const [item, condition] of wrapped) item.condition = condition
  wrapped.clear()
  browsing.clear()
  redraw()
}
