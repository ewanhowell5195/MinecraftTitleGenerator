import { sameValue } from "../core/values.js"
import { cameraChanges } from "../settings/camera.js"
import { defaultBorder, defaultDepth, defaultSpacing, fontFaces, typeDefaults } from "../settings/defaults.js"
import { defaultTexture } from "../settings/textureDefaults.js"
import { trimUnused } from "./titleData.js"

function reference(list, font) {
  return { ...typeDefaults("top"), texture: defaultTexture(list, "top"), spacing: defaultSpacing("top", font), depth: defaultDepth(font), border: defaultBorder("top", font), ...fontFaces("top", font) }
}

function sameSettings(a, b) {
  return Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).every(key => sameValue(a[key], b[key]))
}

export function isDefaultCamera({ camera }) {
  return !Object.keys(cameraChanges(camera)).length
}

export function hasDefaultSettings(values, title, list, font) {
  return sameSettings(trimUnused(values, title), trimUnused(reference(list, font), title))
}

export function isDefaultTitle(title, values = title.objects[0]) {
  if (title.objects.length !== 1 || !isDefaultCamera(title)) return false
  const { list, font } = title.runtime[title.objects[0].id] ?? {}
  return !!list && !!font && hasDefaultSettings(values, title, list, font)
}
