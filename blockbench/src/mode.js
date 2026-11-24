import { FORMAT } from "./format.js"

const ID = "minecraft_title"
const OUTLINER_HEIGHT = 260
const KEPT_PANELS = ["outliner", "transform"]

let mode = null
let nativeId = null
const ours = new Set()
const hidden = new Map()

export function inTitleMode() {
  return !!mode && Mode.selected === mode
}

export function titlePanel(id, options, shown) {
  ours.add(id)
  return new Panel(id, { ...options, condition: () => inTitleMode() && shown() })
}

export function deleteTitlePanel(panel) {
  ours.delete(panel.id)
  panel.inside_vue.$destroy()
  panel.delete()
}

export function openTitleMode() {
  if (Format?.id === FORMAT) mode.select()
}

function outlinerPosition(position) {
  const { default_configuration, mode_position_data } = Panels.outliner
  default_configuration.mode_positions = { ...default_configuration.mode_positions, [ID]: position }
  delete mode_position_data[ID]
}

function hidePanels() {
  for (const [id, panel] of Object.entries(Panels)) {
    if (ours.has(id) || KEPT_PANELS.includes(id)) continue
    hidden.set(panel, panel.condition)
    panel.condition = () => false
  }
}

function showPanels() {
  for (const [panel, condition] of hidden) panel.condition = condition
  hidden.clear()
}

function putFirst() {
  const modes = { [ID]: mode, ...Modes.options }
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
      hidePanels()
    },
    onUnselect() {
      Modes.edit = false
      showPanels()
    }
  })
  putFirst()
  outlinerPosition({ fixed_height: true, height: OUTLINER_HEIGHT })
}

export function unregisterMode() {
  if (inTitleMode()) Modes.options.edit.select()
  for (const project of ModelProject.all) {
    if (project.mode === ID) project.mode = "edit"
  }
  outlinerPosition(undefined)
  Vue.delete(Modes.options, ID)
  mode = null
  Object.defineProperty(Modes, "id", nativeId)
}
