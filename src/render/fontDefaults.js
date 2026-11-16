import { quietly } from "../lib/state/history.js"
import { keepTexture, loadedFont } from "../lib/state/scene.js"
import { defaultBorder, defaultDepth, defaultSpacing, fontFaces } from "../lib/settings/defaults.js"
import { applyFontFaces } from "../lib/settings/layers.js"
import { defaultTexture, sameValue, separateForDefaults, setTexture } from "../lib/settings/settings.js"

const loadedFaces = new WeakMap()

export function applyFontDefaults(object, loaded, textures, before) {
  if (!keepTexture.has(object) && loadedFont.get(object) !== loaded.id) {
    quietly(() => {
      const values = { texture: defaultTexture(textures, object.type), textureVariant: null }
      if (object.textureSource === "premade") setTexture(object, values, { before, after: textures })
      else Object.assign(object, values)
      object.overlays = object.overlays.filter(layer => layer.source === "file" || textures.overlays[layer.overlay])
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
  if (loaded.mesh && object.textureSource === "custom") quietly(() => setTexture(object, { textureSource: "premade" }))
  quietly(() => separateForDefaults(object, textures))
  keepTexture.delete(object)
  loadedFont.set(object, loaded.id)
  loadedFaces.set(object, fontFaces(object.type, loaded))
}
