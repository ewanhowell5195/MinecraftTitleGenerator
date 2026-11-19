import { LAYERS, isCustomFont } from "../settings/settings.js"
import { CUSTOM_SHAPE, FALLBACK_SHAPE } from "../geometry/shapes.js"

export const UPLOAD_KEYS = ["customTexture", "customTextureMode", "customFont"]

function fileOverlays(entry) {
  return LAYERS.flatMap(key => entry[key] ?? []).filter(overlay => overlay.source === "file" && overlay.file).length
}

function layerUploads(layer) {
  return fileOverlays(layer) + (layer.textureSource === "custom" && layer.customTexture ? 1 : 0)
}

export function countUploads(entry) {
  const own = fileOverlays(entry) + (entry.textureSource === "custom" && (entry.customTexture || (entry.words ?? []).some(word => word.customTexture)) ? 1 : 0) + (isCustomFont(entry.font) && !entry.customFont?.google || entry.shape === CUSTOM_SHAPE ? 1 : 0)
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

export function withoutUploads(entry) {
  const stripped = layerWithoutUploads(entry)
  if (entry.customFont?.google) stripped.customFont = entry.customFont
  else if (isCustomFont(entry.font)) delete stripped.font
  if (entry.shape === CUSTOM_SHAPE) {
    stripped.shape = FALLBACK_SHAPE
    delete stripped.texture
    delete stripped.textureVariant
  }
  if (entry.layerSettings) stripped.layerSettings = entry.layerSettings.map(layerWithoutUploads)
  if (entry.words) stripped.words = entry.words.map(withoutUploads)
  return stripped
}
