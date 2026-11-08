import path from "node:path"
import { flattenFonts, fullOrder, parseMask, stripsOf } from "../src/lib/font.js"
import { defaultBorder } from "../src/lib/settings.js"
import { mergeStrips, stripFolder, stripUse } from "../src/lib/strips.js"
import { readJson, readPng } from "./common.js"

export const PUBLIC = path.join(import.meta.dirname, "../public")
const out = path.join(PUBLIC, "font")

export function readStripSet(item) {
  const { id, offset } = stripUse(item)
  const folder = path.join(PUBLIC, stripFolder(id))
  return { ...readJson(path.join(folder, "textures.json")), id, offset, folder }
}

export function fontTextureList(entry, list) {
  const owner = entry.inherits ? list.find(font => font.id === entry.variant) : entry
  return mergeStrips(readJson(path.join(fontDir(owner), "textures.json")), stripsOf(entry, list).map(readStripSet))
}

export function fontDir(font) {
  return font.variant ? path.join(out, font.variant, font.id) : path.join(out, font.id)
}

export function publishedFonts() {
  return flattenFonts(readJson(path.join(out, "fonts.json")))
}

export function readMask(entry, list) {
  const folder = fontDir(entry)
  const file = path.join(folder, "font.png")
  const png = readPng(file)
  const { list: cells, capHeight } = parseMask(png.data, png.width, png.height, fullOrder(entry, list), defaultBorder("top", entry))
  return { folder, file, png, cells, capHeight }
}

export const EMPTY = [255, 255, 255]
export const GLYPH = [0, 0, 0]
export const GRID = [255, 0, 0]
export const BASELINE = [0, 255, 0]
export const TOPLINE = [0, 0, 255]
