import * as THREE from "three"
import { usePlatform } from "#lib/core/platform.js"

const SITE = "https://mctitlegenerator.com/"
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
  usePlatform({
    createWebGLRenderer,
    asset: path => ABSOLUTE.test(path) ? path : SITE + path.replace(/^\//, ""),
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
