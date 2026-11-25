import { nextTick } from "vue"
import { renderTitle } from "#render/render.js"
import { captureLayers, whenSharp } from "#render/titleCapture.js"
import { vectorTitle } from "#render/vector/title.js"
import { isTitle } from "../elements.js"
import { elementOf, holdSort, sortTitle, titleState } from "../titles.js"
import { pointsOf } from "./shot.js"
import { titleRect, viewCamera, viewSize } from "./view.js"

export function onlyTitlesShown() {
  return !Outliner.elements.some(element => !isTitle(element) && element.visibility && element.mesh && pointsOf(element.mesh)?.count)
}

async function captured(work) {
  const state = titleState()
  state.title.finalShadows.value = true
  try {
    await nextTick()
    await whenSharp(() => state.items.value)
    await nextTick()
    Project.model_3d.updateMatrixWorld(true)
    sortTitle(viewCamera())
    holdSort(true)
    return await work(viewSize(), state)
  } finally {
    holdSort(false)
    state.title.finalShadows.value = false
  }
}

function capture(resolution, antialias, task) {
  return captured(size => renderTitle(size, Project.model_3d, viewCamera(), resolution, antialias, task))
}

function layers(resolution, antialias, task) {
  return captured((size, { title, members }) => captureLayers({ objects: title.objects, entries: new Map(Array.from(members, ([id, member]) => [id, member.entry])), textOf: word => elementOf(word).describe(), size, scene: Project.model_3d, camera: viewCamera(), resolution, antialias, task }))
}

function vector(resolution) {
  return captured(size => vectorTitle(Project.model_3d, viewCamera(), size, resolution))
}

export const viewport = { capture, captureLayers: layers, titleRect, vector }
