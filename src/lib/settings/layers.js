import { PANELS } from "./defaults.js"
import { withoutKeys } from "../core/values.js"

const LAYER_GROUPS = {
  texture: Object.keys(PANELS.texture()),
  overlays: Object.keys(PANELS.overlays()).concat(Object.keys(PANELS.edgeOverlays())),
  colour: Object.keys(PANELS.colour()).concat(Object.keys(PANELS.outline()), Object.keys(PANELS.faces()), Object.keys(PANELS.inner()), Object.keys(PANELS.sides()))
}

export const SEPARATE_KEYS = { texture: "separateTexture", overlays: "separateOverlays", colour: "separateColour" }

export const LAYER_KEYS = Object.values(LAYER_GROUPS).flat()

export function copied(value) {
  if (ArrayBuffer.isView(value)) return value.slice()
  if (Array.isArray(value)) return value.map(copied)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copied(item)]))
  return value
}

export function layerValues(object) {
  return Object.fromEntries(LAYER_KEYS.map(key => [key, copied(object[key])]))
}

export function isSeparate(object, group) {
  return !!object?.[SEPARATE_KEYS[group]]
}

function separatedKeys(object, group = null) {
  const groups = group ? [group] : Object.keys(LAYER_GROUPS)
  return new Set(groups.filter(name => isSeparate(object, name)).flatMap(name => LAYER_GROUPS[name]))
}

const VIEWED = Symbol("viewed")

export function viewed(object) {
  return object[VIEWED] ?? object
}

export function layerView(object, layer, group = null) {
  const keys = separatedKeys(object, group)
  const settings = layer && keys.size ? object.layerSettings[layer - 1] : null
  if (!settings) return object
  return new Proxy(object, {
    get: (target, key) => key === VIEWED ? target : keys.has(key) ? target.layerSettings[layer - 1][key] : target[key],
    set: (target, key, value) => {
      if (keys.has(key)) target.layerSettings[layer - 1][key] = value
      else target[key] = value
      return true
    }
  })
}

export function overlayFits(data, layer, used) {
  if (layer === null) return !data.layered || used.length > 1
  return (!data.layered || used.some(other => other < layer)) && (!data.layers || data.layers.includes(layer))
}

export function separateLayers(object, group, on, count, fits = null) {
  const keys = LAYER_GROUPS[group]
  const kept = (value, key, layer) => fits && key === "overlays" && Array.isArray(value) ? value.filter(item => fits(layer, item)) : value
  if (on) {
    object.layerSettings = Array.from({ length: count - 1 }, (_, index) => ({ ...object.layerSettings[index], ...Object.fromEntries(keys.map(key => [key, kept(copied(object[key]), key, index + 1)])) }))
    for (const key of keys) object[key] = kept(object[key], key, 0)
  } else object.layerSettings = object.layerSettings.map(layer => withoutKeys(layer, keys))
  object[SEPARATE_KEYS[group]] = on
  if (!Object.keys(LAYER_GROUPS).some(name => isSeparate(object, name))) object.layerSettings = []
}

export function layerTarget(object, layer) {
  const own = layer ? object.layerSettings?.[layer - 1] : null
  if (!own) return object
  return { ...object, ...Object.fromEntries(Array.from(separatedKeys(object)).filter(key => key in own).map(key => [key, own[key]])) }
}

export function applyFontFaces(object, faces) {
  const base = viewed(object)
  const layers = isSeparate(base, "colour") ? base.layerSettings.length + 1 : 1
  for (let layer = 0; layer < layers; layer++) Object.assign(layerView(base, layer, "colour"), faces)
}
