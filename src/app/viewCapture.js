import * as THREE from "three"
import { nextTick, watch } from "vue"
import { joinWords } from "../lib/link/titleLines.js"
import { finalShadows, scene, wordText } from "../lib/state/scene.js"
import { viewport } from "../lib/state/view.js"
import { paintedLines, showLayer } from "../render/layers.js"
import { renderPasses, renderTitle, screenBounds } from "../render/render.js"
import { vectorTitle } from "../render/vector/title.js"

export function useViewCapture(rig, { stage, host, props, refit }) {
  function titleRect() {
    refit()
    rig.camera.updateMatrixWorld()
    const bounds = screenBounds(stage.scene, rig.camera)
    if (!bounds) return null
    const { clientWidth: width, clientHeight: height } = host.value
    return { left: bounds.minX * width, top: bounds.minY * height, width: (bounds.maxX - bounds.minX) * width, height: (bounds.maxY - bounds.minY) * height }
  }

  function whenSharp() {
    if (props.items.every(item => item.sharp)) return Promise.resolve()
    return new Promise(resolve => {
      const stop = watch(() => props.items.every(item => item.sharp), ready => {
        if (!ready) return
        stop()
        resolve()
      })
    })
  }

  async function captured(work) {
    finalShadows.value = true
    try {
      await nextTick()
      await whenSharp()
      await nextTick()
      refit()
      stage.sort(rig.camera)
      return await work(rig.renderer.getSize(new THREE.Vector2()))
    } finally {
      finalShadows.value = false
    }
  }

  function capture(resolution, antialias, task) {
    return captured(size => renderTitle(size, stage.scene, rig.camera, resolution, antialias, task))
  }

  function stackedLayers() {
    const layers = []
    for (const ids of paintedLines(stage.entries)) {
      const words = ids.map(id => scene.objects.find(object => object.id === id))
      const last = layers.at(-1)
      if (words[0].group !== null && last?.words[0].group === words[0].group) last.words.push(...words)
      else layers.push({ words })
    }
    for (const layer of layers) layer.words.sort((a, b) => scene.objects.indexOf(a) - scene.objects.indexOf(b))
    return layers.map(({ words }) => ({ name: joinWords(words, wordText), ids: words.map(word => word.id) }))
  }

  function captureLayers(resolution, antialias, task) {
    return captured(async size => {
      const layers = stackedLayers()
      if (Array.from(stage.entries.values()).some(entry => entry.group.visible && entry.halo)) layers.unshift({ name: "Outline", ids: null })
      const passes = layers.map(({ ids }, index) => () => showLayer(stage.entries, { ids, below: layers.slice(0, index).flatMap(layer => layer.ids ?? []) }))
      task.layers(layers.map(({ name }) => name || "Line"))
      try {
        const shot = await renderPasses(size, stage.scene, rig.camera, resolution, antialias, task, passes)
        return shot && { image: shot.image, layers: layers.map(({ name }, index) => ({ name, image: shot.images[index] })) }
      } finally {
        viewport.redraw?.()
      }
    })
  }

  async function vector(resolution) {
    await whenSharp()
    await nextTick()
    refit()
    stage.sort(rig.camera)
    return vectorTitle(stage.scene, rig.camera, rig.renderer.getSize(new THREE.Vector2()), resolution)
  }

  return { capture, captureLayers, vector, titleRect }
}
