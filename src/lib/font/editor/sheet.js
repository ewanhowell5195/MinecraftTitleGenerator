import { parseMask } from "../font.js"
import { drawSheet } from "../sheet.js"
import { marksFor, sheetMeasures } from "../stretchMarks.js"
import { charactersOf } from "./characters.js"
import { depthOf, fontLayers } from "./depths.js"
import { fontRows, glyphOf, inkExtent, isBlank, rowOfY, setGlyph, trimmed, widthOf } from "./glyph.js"

const SHEETS_KEPT = 8
const sheets = new Map()

function sheetCell(font, glyph, layers = null) {
  const d = font.density
  const trim = trimmed(font, glyph)
  const width = widthOf(font, trim) * d
  const stretch = trim.stretch.flatMap(y => Array.from({ length: d }, (_, index) => y * d + index))
  const { top, bottom } = inkExtent(font, trim)
  if (top === null) return { advance: width, width: 0, height: 0, mask: new Uint8Array(0), originX: 0, top: 0, bottom: 0, stretch }
  const mask = new Uint8Array(width * (top - bottom) * d)
  const depths = layers ? new Uint8Array(mask.length) : null
  for (let y = bottom; y < top; y++) {
    const text = trim.rows[rowOfY(font, trim, y)]
    for (let column = 0; column < text.length; column++) {
      if (text[column] === "0") continue
      const layer = layers ? layers.indexOf(depthOf(font, text[column])) : 0
      for (let j = 0; j < d; j++) {
        const from = ((y - bottom) * d + j) * width + column * d
        mask.fill(1, from, from + d)
        depths?.fill(layer, from, from + d)
      }
    }
  }
  return { advance: width, width, height: (top - bottom) * d, mask, ...(depths ? { depths } : {}), originX: 0, top: top * d, bottom: bottom * d, stretch }
}

function drawnSheet(font, chars) {
  const glyphs = chars.map(char => glyphOf(font, char))
  const layers = fontLayers(font, glyphs)
  return drawSheet(glyphs.map(glyph => sheetCell(font, glyph, layers)), font.height * font.density, { layers })
}

function builtSheet(font) {
  const key = `${font.height},${font.width},${font.density},${font.letterCase},${font.creeper},${font.defineSpace},${font.extras.join("")},${(font.depths ?? []).join()}`
  let built = sheets.get(font.glyphs)
  if (built?.key !== key) {
    const capHeight = font.height * font.density
    built = { key, sheet: { ...drawnSheet(font, charactersOf(font)), capHeight }, parsed: new Map() }
    sheets.set(font.glyphs, built)
    if (sheets.size > SHEETS_KEPT) sheets.delete(sheets.keys().next().value)
  }
  return built
}

export function buildSheet(font) {
  return builtSheet(font).sheet
}

export function sheetOrder(font) {
  return charactersOf(font).join("")
}

export function savedCharacters(font) {
  const all = charactersOf(font)
  const drawn = all.filter(char => !isBlank(glyphOf(font, char)))
  return drawn.length ? drawn : all
}

export function savedSheet(font) {
  return drawnSheet(font, savedCharacters(font))
}

export function parsedSheet(font, gap = font.border) {
  const { sheet, parsed } = builtSheet(font)
  if (!parsed.has(gap)) parsed.set(gap, { sheet, ...parseMask(sheet.data, sheet.width, sheet.height, sheetOrder(font), gap) })
  return parsed.get(gap)
}

export function autoStretch(font, characters = charactersOf(font)) {
  const { list, capHeight } = parsedSheet(font, 0)
  const measures = { capHeight, ...sheetMeasures(list.filter(cell => cell.width)), block: font.grid * font.density }
  let next = font
  for (const cell of list) {
    if (!cell.width || !characters.includes(cell.char)) continue
    next = setGlyph(next, cell.char, { ...glyphOf(next, cell.char), stretch: fontRows(marksFor(cell, measures), font.density) })
  }
  return next
}
