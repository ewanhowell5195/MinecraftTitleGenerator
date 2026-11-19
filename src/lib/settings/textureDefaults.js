import { sameValue } from "../core/values.js"
import { PANELS, TYPED_KEYS } from "./defaults.js"
import { isSeparate, layerTarget, layerView, separateLayers, viewed } from "./layers.js"

export const LAYER = { source: "premade", file: null, blend: "overlay", colours: null, tint: null, tintBlend: "multiply", opacity: 100 }

export function overlayLayer(overlay, definition) {
  return { ...LAYER, overlay, ...structuredClone(definition?.default ?? {}) }
}

export const OVERLAY_KINDS = {
  overlays: "overlayMode",
  edgeOverlays: "edgeOverlayMode"
}

export const LAYERS = Object.keys(OVERLAY_KINDS)

export function textureEntry(list, object) {
  const entry = list.textures[object.texture]
  if (!entry) return null
  return object.textureVariant ? { ...entry, ...entry.variants?.[object.textureVariant] } : entry
}

export const FACE_PANELS = ["faces", "inner", "sides"]

const TEXTURE_DEFAULTS = LAYERS.concat(FACE_PANELS)

export function perLayerDefault(value, key) {
  if (!Array.isArray(value)) return false
  return LAYERS.includes(key) ? value.length > 0 && value.every(Array.isArray) : true
}

export function layerDefault(value, key, layer = 0) {
  return perLayerDefault(value, key) ? value[layer] : value
}

function textureDefault(list, object, key, layer) {
  if (!list || object.textureSource !== "premade") return undefined
  return layerDefault(textureEntry(list, object)?.[key], key, layer)
}

function defaultsLayers(list, object) {
  const merged = list && object.textureSource === "premade" ? textureEntry(list, object) : null
  return Math.max(1, ...TEXTURE_DEFAULTS.map(key => perLayerDefault(merged?.[key], key) ? merged[key].length : 1))
}

export function defaultOverlays(list, object, kind, layer = 0) {
  return (textureDefault(list, object, kind, layer) ?? []).map(entry => {
    if (!list[kind][entry.overlay]) throw new Error(`${object.textureVariant ?? object.texture} has ${kind === "overlays" ? `a default overlay "${entry.overlay}" that this font does not have` : `a default edge overlay "${entry.overlay}" that does not exist`}`)
    return { ...overlayLayer(entry.overlay, list[kind][entry.overlay]), ...structuredClone(entry) }
  })
}

export function activeOverlays(list, object, kind, layer = 0) {
  return object[OVERLAY_KINDS[kind]] === "custom" ? object[kind] : defaultOverlays(list, object, kind, layer)
}

export const FACE_COLOURS = {
  faces: { custom: "customEdge", colour: "edgeColour" },
  inner: { custom: "customInternal", colour: "internalColour" },
  sides: { custom: "customSide", colour: "sideColour" }
}

export function textureFaces(list, object, name, layer = 0) {
  const colour = textureDefault(list, object, name, layer)
  if (colour == null) return {}
  if (typeof colour !== "string" || !/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`${object.textureVariant ?? object.texture} gives ${name} the colour ${JSON.stringify(colour)}, which isn't a #rrggbb colour`)
  const { custom, colour: key } = FACE_COLOURS[name]
  return { [custom]: true, [key]: colour }
}

export function untouchedTileable(object) {
  const values = PANELS.texture()
  return ["tileable", "tileableVariant", "tileableSource", "minecraftVersion"].every(key => object[key] === values[key])
}

function textureDefaults(list, object, count) {
  return Array.from({ length: count }, (_, layer) => {
    const target = layerTarget(object, layer)
    return {
      overlays: Object.fromEntries(LAYERS.map(kind => [kind, defaultOverlays(list, target, kind, layer)])),
      faces: Object.fromEntries(FACE_PANELS.map(name => [name, textureFaces(list, target, name, layer)]))
    }
  })
}

export function separateForDefaults(object, list, layers = defaultsLayers(list, object)) {
  const merged = list && object.textureSource === "premade" ? textureEntry(list, object) : null
  const base = viewed(object)
  for (const group of ["overlays", "colour"]) {
    const keys = group === "overlays" ? LAYERS : FACE_PANELS
    if (!isSeparate(base, group) && keys.some(key => perLayerDefault(merged?.[key], key))) separateLayers(base, group, true, layers)
  }
}

export function setTexture(object, values, { before = null, after = before } = {}) {
  const base = viewed(object)
  const count = Math.max(base.layerSettings?.length ?? 0, defaultsLayers(before, object) - 1) + 1
  const old = textureDefaults(before, base, count)
  let changed = false
  for (const [key, value] of Object.entries(values)) {
    if (object[key] === value) continue
    object[key] = value
    changed = true
  }
  if (!changed) return
  if (!after) {
    for (const kind of LAYERS) object[OVERLAY_KINDS[kind]] = "default"
    return
  }
  const layers = Math.max(count, defaultsLayers(after, object))
  separateForDefaults(object, after, layers)
  const fresh = textureDefaults(after, base, layers)
  if (isSeparate(base, "texture")) {
    if (!isSeparate(base, "overlays")) separateLayers(base, "overlays", true, layers)
    const faces = old.concat(fresh).some(defaults => FACE_PANELS.some(name => Object.keys(defaults.faces[name]).length))
    if (faces && !isSeparate(base, "colour")) separateLayers(base, "colour", true, layers)
  }
  for (let layer = 0; layer < layers; layer++) {
    const overlays = layerView(base, isSeparate(base, "overlays") ? layer : 0, "overlays")
    for (const kind of LAYERS) {
      if (!before || !sameValue(old[layer]?.overlays[kind] ?? [], fresh[layer].overlays[kind])) overlays[OVERLAY_KINDS[kind]] = "default"
    }
    if (layer && !isSeparate(base, "colour")) continue
    const colours = layerView(base, layer, "colour")
    for (const name of FACE_PANELS) {
      const now = fresh[layer].faces[name]
      if (before && sameValue(old[layer]?.faces[name] ?? {}, now)) continue
      const values = { ...PANELS[name](), ...now }
      for (const key of Object.keys(values)) if (!TYPED_KEYS.includes(key)) colours[key] = structuredClone(values[key])
    }
  }
}

export function defaultTexture(list, type) {
  for (const id of [type === "bottom" ? list.secondary : null, list.primary, "flat"]) if (id && list.textures[id]) return id
  return Object.keys(list.textures)[0] ?? null
}

export function pinnedTextures(list) {
  return ["flat", defaultTexture(list, "top"), defaultTexture(list, "bottom")]
}
