import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { sheetLayout } from "../src/lib/font.js"
import { setPixel, writeJson } from "./common.js"

const FACE = [255, 255, 255]
const UP = [176, 176, 176]
const DOWN = [84, 84, 84]

export function flatSheet(cells, capHeight, depth, density = 1) {
  const layout = sheetLayout(cells, capHeight, depth)
  let width = 0
  let height = 0
  for (const [glyph, at] of layout) {
    width = Math.max(width, at.x + glyph.width)
    height = Math.max(height, at.down + depth)
  }

  const sheet = new PNG({ width: width * density, height: height * density })
  sheet.data.fill(0)

  function paint(x, y, colour) {
    for (let j = 0; j < density; j++) {
      for (let i = 0; i < density; i++) setPixel(sheet, x * density + i, y * density + j, colour)
    }
  }

  for (const [glyph, at] of layout) {
    const solid = (row, column) => glyph.mask[row * glyph.width + column] === 1
    for (let r = 0; r < glyph.height; r++) {
      for (let c = 0; c < glyph.width; c++) if (solid(glyph.height - 1 - r, c)) paint(at.x + c, at.top + r, FACE)
    }
    for (let c = 0; c < glyph.width; c++) {
      for (let r = 0; r < depth; r++) {
        if (solid(glyph.height - 1, c)) paint(at.x + c, at.up + r, UP)
        if (solid(0, c)) paint(at.x + c, at.down + r, DOWN)
      }
    }
  }

  return { sheet, layout, width, height }
}

export function writeStarterTextures(folder) {
  const file = path.join(folder, "textures.json")
  if (!fs.existsSync(file)) writeJson(file, { textures: { flat: { border: "#000000" } }, overlays: {} })
}
