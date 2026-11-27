import { isTitle } from "./elements.js"
import { FORMAT } from "./format.js"

const ID = "minecraft_title"
const KEPT_PANELS = ["outliner", "transform", "element"]

let mode = null
let nativeId = null
const ours = new Set()
const hidden = new Map()
const left = new Map()
let elementCondition = null
let elementShown = true

export function isSelected(own) {
  return !!own && Mode.selected === own
}

export function leaveMode(own, id) {
  if (isSelected(own)) Modes.options.edit.select()
  for (const project of ModelProject.all) {
    if (project.mode === id) project.mode = "edit"
  }
}

export function inTitleMode() {
  return isSelected(mode)
}

export function titlePanel(id, options) {
  ours.add(id)
  return new Panel(id, { ...options, condition: inTitleMode })
}

export function deleteTitlePanel(panel) {
  ours.delete(panel.id)
  panel.inside_vue.$destroy()
  panel.delete()
}

export function openTitleMode() {
  if (Format?.id === FORMAT) mode.select()
}

function hasElementTab() {
  return !Outliner.selected.length || Group.multi_selected.length > 0 || !Outliner.selected.every(isTitle)
}

function settleTabs(host) {
  const open = host.open_attached_panel
  if (!Condition(open.condition)) {
    left.set(host, open)
    host.selectTab(host)
  } else if (open === host && left.has(host) && Condition(left.get(host).condition)) {
    host.selectTab(left.get(host))
    left.delete(host)
  }
}

export function followElementTab() {
  if (!Project || elementShown === hasElementTab()) return
  elementShown = !elementShown
  settleTabs(Panels.element.getContainerPanel())
  updateInterfacePanels()
}

export function hidePanels(kept = []) {
  for (const [id, panel] of Object.entries(Panels)) {
    if (ours.has(id) || kept.includes(id)) continue
    hidden.set(panel, panel.condition)
    panel.condition = () => false
  }
}

export function showPanels() {
  for (const [panel, condition] of hidden) panel.condition = condition
  hidden.clear()
}

export function putFirst(id) {
  const modes = { [id]: Modes.options[id], ...Modes.options }
  for (const id of Object.keys(Modes.options)) Vue.delete(Modes.options, id)
  for (const [id, option] of Object.entries(modes)) Vue.set(Modes.options, id, option)
}

export function registerMode() {
  nativeId = Object.getOwnPropertyDescriptor(Modes, "id")
  // the native move, resize, rotate and outliner tools only work while the mode's id is edit
  Object.defineProperty(Modes, "id", { configurable: true, enumerable: true, get: () => inTitleMode() ? "edit" : nativeId.get.call(Modes) })
  mode = new Mode(ID, {
    name: "Title",
    icon: "text_fields",
    default_tool: "move_tool",
    category: "navigate",
    condition: { formats: [FORMAT] },
    onSelect() {
      Modes.edit = true
      hidePanels(KEPT_PANELS)
    },
    onUnselect() {
      Modes.edit = false
      showPanels()
    }
  })
  elementCondition = Panels.element.condition
  Panels.element.condition = () => Condition(elementCondition) && hasElementTab()
  putFirst(ID)
}

export function unregisterMode() {
  leaveMode(mode, ID)
  Panels.element.condition = elementCondition
  left.clear()
  Vue.delete(Modes.options, ID)
  mode = null
  Object.defineProperty(Modes, "id", nativeId)
}
