import * as THREE from "three"
import { nextTick } from "vue"
import { editorTitle, scene, wordText } from "../lib/state/scene.js"
import { viewport } from "../lib/state/view.js"
import { renderTitle, screenBounds } from "../render/render.js"
import { captureLayers, whenSharp } from "../render/titleCapture.js"
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

  async function captured(work) {
    editorTitle.finalShadows.value = true
    try {
      await nextTick()
      await whenSharp(() => props.items)
      await nextTick()
      refit()
      stage.sort(rig.camera)
      return await work(rig.renderer.getSize(new THREE.Vector2()))
    } finally {
      editorTitle.finalShadows.value = false
    }
  }

  function capture(resolution, antialias, task) {
    return captured(size => renderTitle(size, stage.scene, rig.camera, resolution, antialias, task))
  }

  function layers(resolution, antialias, task) {
    return captured(async size => {
      try {
        return await captureLayers({ objects: scene.objects, entries: stage.entries, textOf: wordText, size, scene: stage.scene, camera: rig.camera, resolution, antialias, task })
      } finally {
        viewport.redraw?.()
      }
    })
  }

  async function vector(resolution) {
    await whenSharp(() => props.items)
    await nextTick()
    refit()
    stage.sort(rig.camera)
    return vectorTitle(stage.scene, rig.camera, rig.renderer.getSize(new THREE.Vector2()), resolution)
  }

  return { capture, captureLayers: layers, vector, titleRect }
}
