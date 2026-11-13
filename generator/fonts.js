import path from "node:path"
import { flattenFonts, fontFolder, fullOrder, parseMask, sheetOwner, stripsOf } from "../src/lib/font.js"
import { defaultBorder } from "../src/lib/settings.js"
import { mergeStrips, stripFolder, stripUse } from "../src/lib/strips.js"
import { readJson, readPng } from "./common.js"

export const ROOT = path.join(import.meta.dirname, "..")

export function publicDir(root = ROOT) {
  return path.join(root, "public")
}

export function readStripSet(item, root = ROOT) {
  const { id, offset, layer } = stripUse(item)
  const folder = path.join(publicDir(root), stripFolder(id))
  return { ...readJson(path.join(folder, "textures.json")), id, offset, layer, folder }
}

export function fontTextureList(entry, list, root = ROOT) {
  return mergeStrips(readJson(path.join(fontDir(sheetOwner(entry, list), root), "textures.json")), stripsOf(entry, list).map(item => readStripSet(item, root)))
}

export function fontDir(font, root = ROOT) {
  return path.join(publicDir(root), fontFolder(font))
}

export function publishedFonts(root = ROOT) {
  return flattenFonts(readJson(path.join(publicDir(root), "font/fonts.json")))
}

export function publishedShapes(root = ROOT) {
  return readJson(path.join(publicDir(root), "shapes/shapes.json")).filter(shape => shape.kind === "png").map(shape => ({ ...shape, folder: `shapes/${shape.id}`, preview: shape.order }))
}

export function publishedModels(root = ROOT) {
  return readJson(path.join(publicDir(root), "shapes/shapes.json")).filter(shape => shape.kind === "model").map(shape => shape.id)
}

export function readMask(entry, list, root = ROOT) {
  const folder = fontDir(entry, root)
  const file = path.join(folder, "font.png")
  const png = readPng(file)
  const { list: cells, capHeight, layers } = parseMask(png.data, png.width, png.height, fullOrder(entry, list), defaultBorder("top", entry))
  return { folder, file, png, cells, capHeight, layers }
}
