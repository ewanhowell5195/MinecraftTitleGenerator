import { glyphOf, hasInk, inRows, isBlank, rowOfY, rowsOf, setGlyph, trimmed, widthOf, yOfRow } from "./glyph.js"

export const NOTHING_OUTSIDE = { cells: [], stretch: [] }

function inkCells(font, glyph) {
  return glyph.rows.flatMap((text, row) => Array.from(text).flatMap((value, x) => value !== "0" ? [[x, yOfRow(font, glyph, row), value]] : []))
}

function placed(font, glyph, cells, stretch) {
  const width = widthOf(font, glyph)
  const inside = inRows({ height: font.height, above: glyph.above, below: glyph.below })
  const fits = ([x, y]) => x >= 0 && x < width && inside(y)
  const rows = rowsOf(width, font.height + glyph.above + glyph.below, cells.filter(fits).map(([x, y, code]) => [x, rowOfY(font, glyph, y), code]))
  return { glyph: { ...glyph, rows, stretch: stretch.filter(inside) }, outside: { cells: cells.filter(cell => !fits(cell)), stretch: stretch.filter(y => !inside(y)) } }
}

export function moveGlyph(font, glyph, dx, dy, outside = NOTHING_OUTSIDE) {
  const cells = inkCells(font, glyph).concat(outside.cells).map(([x, y, code]) => [x + dx, y + dy, code])
  return placed(font, glyph, cells, glyph.stretch.concat(outside.stretch).map(y => y + dy))
}

export function reshapeGlyph(font, char, { width, above, below }, outside = NOTHING_OUTSIDE) {
  const glyph = glyphOf(font, char)
  const changed = { ...glyph }
  if (width !== undefined) changed.width = width === font.width ? null : width
  if (above !== undefined) changed.above = above
  if (below !== undefined) changed.below = below
  const cut = widthOf(font, glyph) - widthOf(font, changed)
  const inked = (start, end) => glyph.rows.some(row => hasInk(row.slice(start, end)))
  const start = cut > 0 && inked(widthOf(font, changed), widthOf(font, glyph)) && !inked(0, cut) ? cut : 0
  const cells = inkCells(font, glyph).concat(outside.cells).map(([x, y, code]) => [x - start, y, code])
  const result = placed(font, changed, cells, glyph.stretch.concat(outside.stretch))
  return { font: setGlyph(font, char, result.glyph), outside: result.outside }
}

export function trimGlyph(font, char) {
  const glyph = glyphOf(font, char)
  return isBlank(glyph) ? font : setGlyph(font, char, trimmed(font, glyph))
}

export function changeGlyph(font, char, change) {
  return reshapeGlyph(font, char, change).font
}
