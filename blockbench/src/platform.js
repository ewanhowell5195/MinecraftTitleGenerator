import * as THREE from "three"
import { useApi } from "#lib/core/api.js"
import { usePlace } from "#lib/core/place.js"
import { usePlatform } from "#lib/core/platform.js"
import { keyHeaders } from "./account/key.js"

const SITE = "https://mctitlegenerator.com"
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i

const timers = new Set()

function withoutGizmos(work) {
  let failure = null
  Canvas.withoutGizmos(() => {
    try {
      work()
    } catch (err) {
      failure = err
    }
  })
  if (failure) throw failure
}

function createWebGLRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
  const { outputEncoding, toneMapping } = main_preview.renderer
  Object.assign(renderer, { outputEncoding, toneMapping })
  const { render } = renderer
  renderer.render = (...args) => withoutGizmos(() => render.apply(renderer, args))
  return renderer
}

export function useBlockbench() {
  useApi(SITE, keyHeaders)
  usePlace("Blockbench", "from Blockbench")
  usePlatform({
    createWebGLRenderer,
    asset: path => ABSOLUTE.test(path) ? path : `${SITE}/${path.replace(/^\//, "")}`,
    frame(callback) {
      if (!document.hidden) return requestAnimationFrame(callback)
      const timer = setTimeout(callback, 16)
      timers.add(timer)
      return timer
    },
    cancelFrame(id) {
      if (timers.delete(id)) clearTimeout(id)
      else cancelAnimationFrame(id)
    }
  })
}
