import * as THREE from "three"
import { nextTick, watch } from "vue"
import { finalShadows } from "../lib/state/scene.js"
import { renderTitle, screenBounds } from "../render/render.js"
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

  async function capture(resolution, antialias, task) {
    finalShadows.value = true
    try {
      await nextTick()
      await whenSharp()
      await nextTick()
      refit()
      stage.sort(rig.camera)
      return await renderTitle(rig.renderer.getSize(new THREE.Vector2()), stage.scene, rig.camera, resolution, antialias, task)
    } finally {
      finalShadows.value = false
    }
  }

  async function vector(resolution) {
    await whenSharp()
    await nextTick()
    refit()
    stage.sort(rig.camera)
    return vectorTitle(stage.scene, rig.camera, rig.renderer.getSize(new THREE.Vector2()), resolution)
  }

  return { capture, vector, titleRect }
}
