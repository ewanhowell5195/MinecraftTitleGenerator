import { nextTick, watch } from "vue"
import { joinWords } from "../../../src/lib/link/titleLines.js"
import { paintedLines, showLayer } from "../../../src/render/layers.js"
import { renderPasses, renderTitle } from "../../../src/render/render.js"
import { vectorTitle } from "../../../src/render/vector/title.js"
import { isTitle } from "../elements.js"
import { elementOf, holdSort, sortTitle, titleState } from "../titles.js"
import { pointsOf, titleRect, viewCamera, viewSize } from "./view.js"

export function onlyTitlesShown() {
  return !Outliner.elements.some(element => !isTitle(element) && element.visibility && element.mesh && pointsOf(element.mesh)?.count)
}

function whenSharp({ items }) {
  const ready = () => items.value.every(item => item.sharp)
  if (ready()) return Promise.resolve()
  return new Promise(resolve => {
    const stop = watch(ready, sharp => {
      if (!sharp) return
      stop()
      resolve()
    })
  })
}

async function captured(work) {
  const state = titleState()
  state.title.finalShadows.value = true
  try {
    await nextTick()
    await whenSharp(state)
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

function stackedLayers({ objects }, entries) {
  const layers = []
  for (const ids of paintedLines(entries)) {
    const words = ids.map(id => objects.find(object => object.id === id))
    const last = layers.at(-1)
    if (words[0].group !== null && last?.words[0].group === words[0].group) last.words.push(...words)
    else layers.push({ words })
  }
  for (const layer of layers) layer.words.sort((a, b) => objects.indexOf(a) - objects.indexOf(b))
  return layers.map(({ words }) => ({ name: joinWords(words, word => elementOf(word).describe()), ids: words.map(word => word.id) }))
}

function captureLayers(resolution, antialias, task) {
  return captured(async (size, { title, members }) => {
    const entries = new Map(Array.from(members, ([id, member]) => [id, member.entry]))
    const layers = stackedLayers(title, entries)
    if (Array.from(entries.values()).some(entry => entry.group.visible && entry.halo)) layers.unshift({ name: "Outline", ids: null })
    const passes = layers.map(({ ids }, index) => () => showLayer(entries, { ids, below: layers.slice(0, index).flatMap(layer => layer.ids ?? []) }))
    task.layers(layers.map(({ name }) => name || "Line"))
    const shot = await renderPasses(size, Project.model_3d, viewCamera(), resolution, antialias, task, passes)
    return shot && { image: shot.image, layers: layers.map(({ name }, index) => ({ name, image: shot.images[index] })) }
  })
}

function vector(resolution) {
  return captured(size => vectorTitle(Project.model_3d, viewCamera(), size, resolution))
}

export const viewport = { capture, captureLayers, titleRect, vector }
