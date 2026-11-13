import { fontTextures, loadTileables, modelTextures } from "./assets.js"
import { loadFontList, sheetFolder, stripsOf } from "./font.js"
import { LAYERS, OVERLAY_KINDS, typeDefaults } from "./settings.js"
import { isMinecraftShape, loadShapeList } from "./shapes.js"
import { lineWords } from "./titleFacts.js"

let library = null

export function loadLibrary() {
  library ??= Promise.all([loadFontList(), loadTileables(), loadShapeList()]).catch(err => {
    library = null
    throw err
  })
  return library
}

function variantProblem(label, entry, id, variant) {
  if (!entry) return `there is no ${label} called ${id}`
  if (variant && !entry.variants?.[variant]) return `the ${label} ${id} has no variant called ${variant}`
  return null
}

async function listOf(object, fonts, shapes) {
  if (object.shape !== null) {
    const shape = shapes.find(entry => entry.id === object.shape)
    if (!shape) return { problem: `there is no shape called ${object.shape}` }
    if (shape.kind === "model" && object.textureSource !== "premade") return { problem: `the shape ${shape.id} only takes its own textures` }
    return { owner: shape, list: await (shape.kind === "model" ? modelTextures(shape.folder) : fontTextures(shape.folder, shape.strips ?? [])) }
  }
  const font = fonts.find(entry => entry.id === object.font)
  if (!font) return { problem: `there is no font called ${object.font}` }
  return { owner: font, list: await fontTextures(sheetFolder(font, fonts), stripsOf(font, fonts)) }
}

export async function objectNameProblem(object, [fonts, tileables, shapes]) {
  if (isMinecraftShape(object.shape)) return null
  const { problem, owner, list } = await listOf(object, fonts, shapes)
  if (problem) return problem
  if (object.textureSource === "premade" && object.texture !== null) {
    const found = variantProblem(`${owner.id} texture`, list.textures[object.texture], object.texture, object.textureVariant)
    if (found) return found
  }
  if (object.textureSource === "tileable" && object.tileableSource !== "minecraft") {
    const found = variantProblem("tileable", tileables[object.tileable], object.tileable, object.tileableVariant)
    if (found) return found
  }
  for (const kind of LAYERS) {
    if (object[OVERLAY_KINDS[kind]] !== "custom") continue
    const missing = (object[kind] ?? []).find(layer => layer.source !== "file" && !list[kind][layer.overlay])
    if (missing) return `there is no ${owner.id} overlay called ${missing.overlay}`
  }
  return null
}

export async function titleNameProblem(lines) {
  const loaded = await loadLibrary()
  for (const line of lines) {
    for (const word of lineWords(line)) {
      const object = { ...typeDefaults(word.type ?? "top"), ...word }
      for (const shown of [object].concat((object.layerSettings ?? []).map(layer => ({ ...object, ...layer })))) {
        const problem = await objectNameProblem(shown, loaded)
        if (problem) return problem
      }
    }
  }
  return null
}
