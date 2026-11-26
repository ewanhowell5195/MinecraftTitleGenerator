import * as THREE from "three"
import { useApi } from "#lib/core/api.js"
import { usePlace } from "#lib/core/place.js"
import { usePlatform } from "#lib/core/platform.js"
import { reachable } from "#lib/core/reach.js"
import { keyHeaders } from "./account/key.js"

export const SITE = "https://mctitlegenerator.com"
const MIRRORS = [SITE, "https://raw.githubusercontent.com/ewanhowell5195/MinecraftTitleGenerator/main/public", "https://cdn.jsdelivr.net/gh/ewanhowell5195/MinecraftTitleGenerator@main/public"]
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i

const timers = new Set()
let mirror = 0

function mirrored(file) {
  const path = file.split(/[?#]/)[0]
  return !path.startsWith("api/") && /\.[a-z0-9]+$/i.test(path)
}

function asset(path, from = mirror) {
  if (ABSOLUTE.test(path)) return path
  const file = path.replace(/^\//, "")
  return `${mirrored(file) ? MIRRORS[from] : SITE}/${file}`
}

async function mirroredFetch(path, ...args) {
  if (ABSOLUTE.test(path) || !mirrored(path.replace(/^\//, ""))) return reachable(fetch(asset(path), ...args))
  for (let from = mirror; ; from++) {
    try {
      const response = await reachable(fetch(asset(path, from), ...args))
      mirror = from
      return response
    } catch (err) {
      if (!err.unreachable || from === MIRRORS.length - 1) throw err
    }
  }
}

function imageFrom(url, src) {
  return new Promise((fulfil, reject) => {
    const image = new Image()
    image.onload = () => fulfil(image)
    image.onerror = () => reject(new Error(`failed to load ${src}`))
    image.src = url
  })
}

async function loadImage(src) {
  if (ABSOLUTE.test(src)) return imageFrom(src, src)
  const response = await mirroredFetch(src)
  if (!response.ok) throw new Error(`failed to load ${src}`)
  const url = URL.createObjectURL(await response.blob())
  try {
    return await imageFrom(url, src)
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
    asset: path => asset(path),
    fetch: mirroredFetch,
    loadImage,
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
