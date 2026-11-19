import { lineText, scene } from "../../lib/state/scene.js"

function settingsOf(object) {
  return [object].concat((object.layerSettings ?? []).filter(Boolean))
}

function used(collect, keyOf = value => value) {
  const found = new Map()
  for (const object of scene.objects) {
    for (const value of collect(object)) {
      const key = keyOf(value)
      if (!found.has(key)) found.set(key, { key, value, label: lineText(object) })
    }
  }
  return Array.from(found.values())
}

export function usedTextures() {
  return used(object => settingsOf(object).filter(settings => settings.customTexture), settings => settings.customTexture).map(item => ({ ...item, value: item.value.customTexture, source: item.value }))
}

export function usedOverlayFiles() {
  return used(object => settingsOf(object).flatMap(settings => (settings.overlays ?? []).concat(settings.edgeOverlays ?? [])).filter(layer => layer.source === "file" && layer.file).map(layer => layer.file))
}

export function usedShapes() {
  return used(object => object.customFont?.kind === "silhouette" ? [object.customFont.data] : [])
}

export function usedFonts() {
  return used(object => object.customFont && object.customFont.kind !== "silhouette" && !object.customFont.google ? [object.customFont] : [], font => font.data)
}
