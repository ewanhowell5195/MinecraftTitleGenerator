import { quietly } from "../lib/state/history.js"
import { keepTexture, loadedFont } from "../lib/state/scene.js"
import { defaultBorder, defaultDepth, defaultSpacing, fontFaces } from "../lib/settings/defaults.js"
import { applyFontFaces, isSeparate, layerView } from "../lib/settings/layers.js"
import { defaultTexture, separateForDefaults, setTexture } from "../lib/settings/textureDefaults.js"
import { sameValue } from "../lib/core/values.js"

const loadedFaces = new WeakMap()

function layerViews(object, group) {
  const count = isSeparate(object, group) ? object.layerSettings.length + 1 : 1
  return Array.from({ length: count }, (_, layer) => layerView(object, layer, group))
}

export function applyFontDefaults(object, loaded, textures, before) {
  if (!keepTexture.has(object) && loadedFont.get(object) !== loaded.id) {
    quietly(() => {
      const values = { texture: defaultTexture(textures, object.type), textureVariant: null }
      for (const target of layerViews(object, "texture")) {
        const unfitting = target.textureSource === "custom" && !!target.customTexture && !["tileable", "cover"].includes(target.customTextureMode)
        if (target.textureSource === "premade" || unfitting) setTexture(target, unfitting ? { ...values, textureSource: "premade" } : values, { before, after: textures })
        else Object.assign(target, values)
      }
      for (const target of layerViews(object, "overlays")) target.overlays = target.overlays.filter(layer => layer.source === "file" || textures.overlays[layer.overlay])
      object.spacing = defaultSpacing(object.type, loaded)
      object.depth = defaultDepth(loaded)
      object.border = defaultBorder(object.type, loaded)
      object.wordDepth = null
      object.wordBorder = null
      const faces = fontFaces(object.type, loaded)
      if (!sameValue(faces, loadedFaces.get(object) ?? fontFaces(object.type, null))) applyFontFaces(object, faces)
    })
  } else if (object.texture === null) quietly(() => (object.texture = defaultTexture(textures, object.type)))
  if (object.textureVariant && !textures.textures[object.texture]?.variants?.[object.textureVariant]) quietly(() => (object.textureVariant = null))
  if (loaded.mesh && object.textureSource === "custom" && object.customTextureMode === "standard") quietly(() => setTexture(object, { textureSource: "premade" }))
  quietly(() => separateForDefaults(object, textures))
  keepTexture.delete(object)
  loadedFont.set(object, loaded.id)
  loadedFaces.set(object, fontFaces(object.type, loaded))
}
