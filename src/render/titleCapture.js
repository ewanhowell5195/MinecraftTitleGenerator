import { watch } from "vue"
import { joinWords } from "#lib/link/titleLines.js"
import { paintedLines, showLayer } from "./layers.js"
import { renderPasses } from "./render.js"

export function whenSharp(items) {
  const ready = () => items().every(item => item.sharp)
  if (ready()) return Promise.resolve()
  return new Promise(resolve => {
    const stop = watch(ready, sharp => {
      if (!sharp) return
      stop()
      resolve()
    })
  })
}

function stackedLayers(objects, entries, textOf) {
  const layers = []
  for (const ids of paintedLines(entries)) {
    const words = ids.map(id => objects.find(object => object.id === id))
    const last = layers.at(-1)
    if (words[0].group !== null && last?.words[0].group === words[0].group) last.words.push(...words)
    else layers.push({ words })
  }
  for (const layer of layers) layer.words.sort((a, b) => objects.indexOf(a) - objects.indexOf(b))
  return layers.map(({ words }) => ({ name: joinWords(words, textOf), ids: words.map(word => word.id) }))
}

export async function captureLayers({ objects, entries, textOf, size, scene, camera, resolution, antialias, task }) {
  const layers = stackedLayers(objects, entries, textOf)
  if (Array.from(entries.values()).some(entry => entry.group.visible && entry.halo)) layers.unshift({ name: "Outline", ids: null })
  const passes = layers.map(({ ids }, index) => () => showLayer(entries, { ids, below: layers.slice(0, index).flatMap(layer => layer.ids ?? []) }))
  task.layers(layers.map(({ name }) => name || "Line"))
  const shot = await renderPasses(size, scene, camera, resolution, antialias, task, passes)
  return shot && { image: shot.image, layers: layers.map(({ name }, index) => ({ name, image: shot.images[index] })) }
}
