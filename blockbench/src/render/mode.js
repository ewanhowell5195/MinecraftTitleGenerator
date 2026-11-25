import { ref } from "vue"
import { FORMAT } from "../format.js"
import { enterView, leaveView } from "./view.js"

const ID = "minecraft_title_render"

export const rendered = ref(null)

let mode = null
let unselected = []
let hidden = []

export function inRenderMode() {
  return !!mode && Mode.selected === mode
}

function guides() {
  return [three_grid, Canvas.side_grids?.x, Canvas.side_grids?.z, Canvas.pivot_marker].filter(guide => guide?.visible)
}

function enter() {
  unselected = Outliner.selected.slice()
  unselectAllElements()
  hidden = guides()
  for (const guide of hidden) guide.visible = false
  rendered.value = Project.uuid
  enterView()
}

function leave() {
  rendered.value = null
  for (const guide of hidden) guide.visible = true
  leaveView()
  if (!Project) return
  for (const element of unselected) {
    if (Outliner.elements.includes(element)) element.markAsSelected()
  }
  updateSelection()
}

export function registerRenderMode() {
  mode = new Mode(ID, {
    name: "Render",
    icon: "photo_camera",
    category: "navigate",
    condition: { formats: [FORMAT] },
    selectElements: false,
    hide_toolbars: true,
    hide_status_bar: true,
    onSelect: enter,
    onUnselect: leave
  })
}

export function unregisterRenderMode() {
  if (inRenderMode()) Modes.options.edit.select()
  for (const project of ModelProject.all) {
    if (project.mode === ID) project.mode = "edit"
  }
  Vue.delete(Modes.options, ID)
  mode = null
}
