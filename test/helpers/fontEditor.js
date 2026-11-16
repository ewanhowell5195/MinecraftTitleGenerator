import { parseMask } from "../../src/lib/font/font.js"
import { glyphOf, setGlyph } from "../../src/lib/font/editor/glyph.js"
import { paint } from "../../src/lib/font/editor/painting.js"
import { buildSheet, sheetOrder } from "../../src/lib/font/editor/sheet.js"

export function drawn(font, char, cells) {
  return setGlyph(font, char, paint(glyphOf(font, char), cells, true))
}

export function sheetOf(font) {
  const sheet = buildSheet(font)
  return { ...parseMask(sheet.data, sheet.width, sheet.height, sheetOrder(font), 0), sheet }
}

export function comparable(cell) {
  return [cell.char, cell.advance, cell.originX, cell.bottom, cell.top, cell.width, cell.height, Array.from(cell.mask), cell.stretch ?? null]
}
