import { LAYERS, isCustomFont } from "../settings/settings.js"
import { CUSTOM_SHAPE, FALLBACK_SHAPE } from "../geometry/shapes.js"

function layerUploads(layer) {
  return LAYERS.flatMap(key => layer[key] ?? []).filter(overlay => overlay.source === "file" && overlay.file).length + (layer.textureSource === "custom" && layer.customTexture ? 1 : 0)
}

export function countUploads(entry) {
  const own = LAYERS.flatMap(key => entry[key] ?? []).filter(layer => layer.source === "file" && layer.file).length + (entry.textureSource === "custom" && (entry.customTexture || (entry.words ?? []).some(word => word.customTexture)) ? 1 : 0) + (isCustomFont(entry.font) || entry.shape === CUSTOM_SHAPE ? 1 : 0)
  const layered = (entry.layerSettings ?? []).reduce((total, layer) => total + layerUploads(layer), own)
  return (entry.words ?? []).reduce((total, word) => total + countUploads(word), layered)
}

function layerWithoutUploads(layer) {
  const stripped = Object.fromEntries(Object.entries(layer).filter(([key]) => !UPLOAD_KEYS.includes(key)))
  if (layer.textureSource === "custom") delete stripped.textureSource
  for (const key of LAYERS) {
    if (layer[key]) stripped[key] = layer[key].filter(overlay => overlay.source !== "file").map(({ file, ...overlay }) => overlay)
  }
  return stripped
}

export const UPLOAD_KEYS = ["customTexture", "customTextureMode", "customFont"]

export function withoutUploads(entry) {
  const stripped = Object.fromEntries(Object.entries(entry).filter(([key]) => !UPLOAD_KEYS.includes(key)))
  if (entry.textureSource === "custom") delete stripped.textureSource
  if (isCustomFont(entry.font)) delete stripped.font
  if (entry.shape === CUSTOM_SHAPE) {
    stripped.shape = FALLBACK_SHAPE
    delete stripped.texture
    delete stripped.textureVariant
  }
  for (const key of LAYERS) {
    if (entry[key]) stripped[key] = entry[key].filter(layer => layer.source !== "file").map(({ file, ...layer }) => layer)
  }
  if (entry.layerSettings) stripped.layerSettings = entry.layerSettings.map(layerWithoutUploads)
  if (entry.words) stripped.words = entry.words.map(withoutUploads)
  return stripped
}
