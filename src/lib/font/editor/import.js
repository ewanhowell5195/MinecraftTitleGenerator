import { authorList } from "../../core/authors.js"
import { kerningPairs } from "../kerning.js"
import { parseMask, scanMask } from "../sheetParse.js"
import { titleCase } from "../../core/names.js"
import { mostCommon } from "../../core/maths.js"
import { CREEPER, DEFAULT_ORDER } from "../order.js"
import { ALWAYS_REQUIRED, REQUIRED_CHARACTERS, SPACE_CHAR, characterName, extrasOf, isOptional } from "./characters.js"
import { DEFAULT_BORDER, createFont } from "./defaults.js"
import { depthCode } from "./depths.js"
import { slug } from "./export.js"
import { fontRows, isBlank, mapGlyphs, rowsOf, widthOf } from "./glyph.js"
import { autoStretch } from "./sheet.js"
import { resizeFont } from "./sizes.js"

const GRID_SIZES = [8, 6, 5, 4, 3, 2]
const META_KEYS = ["authors", "description", "preview", "basedOn", "spaceWidth", "depth", "border", "characterSpacing", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "autoBorder", "flat", "overlay", "allFaces", "layerDepth", "strips", "kerning"]

function maskCells({ width, height, mask }) {
  const cells = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) if (mask[r * width + c]) cells.push([c, r])
  }
  return cells
}

function exactDivide(value, density, what) {
  if (value % density) throw new Error(`this sheet can't be read at density ${density}: ${what} is ${value}, which doesn't divide by it`)
  return value / density
}

function usualWidth(widths, fallback) {
  return mostCommon(widths.toSorted((a, b) => b - a)) ?? fallback
}

function detectGrid(glyphs) {
  const runs = Object.values(glyphs).flatMap(glyph => glyph.rows.flatMap(row => row.match(/[^0]+/g) ?? []).map(run => run.length))
  if (!runs.length) return 1
  return GRID_SIZES.find(size => runs.filter(length => length % size === 0).length >= runs.length * 0.95) ?? 1
}

function glyphFromCell(cell, height, width, density, codes) {
  const cellWidth = exactDivide(cell.advance, density, `the width of ${characterName(cell.char)}`)
  const above = Math.max(0, Math.ceil(cell.top / density) - height)
  const below = Math.max(0, -Math.floor(cell.bottom / density))
  const ink = maskCells(cell).map(([c, r]) => [Math.floor((cell.originX + c) / density), above + height - 1 - Math.floor((cell.bottom + r) / density), codes[cell.depths?.[r * cell.width + c] ?? 0]])
  return { width: cellWidth === width ? null : cellWidth, above, below, stretch: fontRows(cell.stretch ?? [], density), rows: rowsOf(cellWidth, above + height + below, ink) }
}

function cellsFromSheet({ data, width, height }, order, density) {
  const count = scanMask(data, width, height).rows.reduce((total, row) => total + row.cells.length, 0)
  const defaults = Array.from(DEFAULT_ORDER)
  const listed = order ? Array.from(order) : count > defaults.length ? defaults.concat(SPACE_CHAR) : count < defaults.length ? REQUIRED_CHARACTERS : defaults
  const { list, capHeight, layers } = parseMask(data, width, height, listed.slice(0, count).join(""), 0)
  return { list, layers, height: exactDivide(capHeight, density, "the cap height") }
}

function depthCodes(font, layers) {
  let next = { ...font, depths: [] }
  const codes = (layers ?? [1]).map(depth => {
    const found = depthCode(next, depth)
    next = found.font
    return found.code
  })
  return { font: next, codes }
}

function applyCells(source, list, height, density, layers = null) {
  const { font, codes } = depthCodes(source, layers)
  const width = usualWidth(list.map(cell => cell.advance / density), font.width)
  const glyphs = Object.fromEntries(list.map(cell => [cell.char, glyphFromCell(cell, height, width, density, codes)]))
  return { ...font, height, width, density, glyphs, creeper: CREEPER in glyphs, extras: extrasOf(list.map(cell => cell.char)), defineSpace: !!glyphs[SPACE_CHAR] && !isBlank(glyphs[SPACE_CHAR]) || font.defineSpace }
}

function metaFrom(font, entry) {
  const next = { ...font, terminatorSpace: false }
  for (const key of META_KEYS) if (entry[key] !== undefined) next[key] = entry[key]
  return { ...next, authors: authorList(entry.authors ?? entry.author) }
}

export function parseFontJson(text) {
  let entry
  try {
    entry = JSON.parse(text)
  } catch (err) {
    throw new Error(`that JSON file can't be read: ${err.message}`)
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("that JSON file isn't a font entry")
  return entry.kerning === undefined ? entry : { ...entry, kerning: kerningPairs(entry.kerning, "that JSON file") }
}

function resizeDefaultWidth(font, width) {
  const glyphs = mapGlyphs(font.glyphs, glyph => {
    const own = widthOf(font, glyph)
    return { ...glyph, width: own === width ? null : own }
  })
  return { ...font, width, glyphs }
}

function onCanvas(font, char, glyph, canvas) {
  const width = canvas.width ?? font.width
  const marks = canvas.stretch ?? glyph.stretch
  const fits = [width, canvas.left, canvas.above, canvas.below].concat(marks).every(Number.isInteger) && canvas.left >= 0 && canvas.left + widthOf(font, glyph) <= width && canvas.above >= glyph.above && canvas.below >= glyph.below
  if (!fits) throw new Error(`that JSON file's canvas for ${characterName(char)} doesn't fit the character on the sheet`)
  const blank = "0".repeat(width)
  const rows = Array.from({ length: canvas.above - glyph.above }, () => blank).concat(glyph.rows.map(row => `${"0".repeat(canvas.left)}${row}`.padEnd(width, "0")), Array.from({ length: canvas.below - glyph.below }, () => blank))
  return { ...glyph, width: width === font.width ? null : width, above: canvas.above, below: canvas.below, stretch: marks, rows }
}

function withCanvases(font, canvases) {
  return { ...font, glyphs: Object.fromEntries(Object.entries(font.glyphs).map(([char, glyph]) => [char, canvases[char] ? onCanvas(font, char, glyph, canvases[char]) : glyph])) }
}

export function fontFromFiles({ sheet = null, json = null }) {
  if (!sheet && !json) throw new Error("choose a font.png, a font JSON file, or both")
  const editor = json?.editor ?? {}
  const density = editor.density ?? 1
  const border = json?.border ?? DEFAULT_BORDER
  const height = editor.height ?? (json?.height ? json.height - border * 2 : 40)
  let font = createFont({ height, width: editor.width ?? 24, grid: editor.grid ?? 4, density, letterCase: json?.multicase ? "both" : editor.letterCase === "lower" ? "lower" : "upper" })
  if (json) font = metaFrom({ ...font, name: json.name ?? (json.id ? titleCase(json.id) : font.name), id: json.id ?? "" }, json)
  if (editor.template) font = { ...font, template: templateFrom(editor.template) }
  if (editor.requireCharacters === false) font = { ...font, requireCharacters: false, omitted: Array.from(editor.omitted ?? "").filter(char => !isOptional(char) && !ALWAYS_REQUIRED.includes(char)) }
  if (json?.order) {
    const listed = Array.from(json.order)
    font = { ...font, creeper: listed.includes(CREEPER), defineSpace: listed.includes(SPACE_CHAR), extras: extrasOf(listed) }
  }
  if (!sheet) return font
  const { list, layers, height: sheetHeight } = cellsFromSheet(sheet, json?.order ?? null, density)
  font = applyCells(font, list, sheetHeight, density, layers)
  if (editor.width) font = resizeDefaultWidth(font, editor.width)
  if (editor.canvas) font = withCanvases(font, editor.canvas)
  return editor.grid ? font : { ...font, grid: detectGrid(font.glyphs) }
}

export function fontFromPublished(entry, cells, capHeight, layers = null) {
  const { width, grid, density = 1 } = entry.editor ?? {}
  const height = exactDivide(capHeight, density, "the cap height")
  const copy = metaFrom({ ...createFont({ height, letterCase: entry.multicase ? "both" : "upper" }), name: `${entry.name} Copy` }, entry)
  let font = applyCells({ ...copy, authors: [], description: "", preview: "", basedOn: entry.id, flat: !!entry.flat, overlay: false, strips: entry.strips ?? [] }, cells, height, density, layers)
  if (width) font = resizeDefaultWidth(font, width)
  return { ...font, grid: grid ?? detectGrid(font.glyphs) }
}

function glyphFromShape(shape, height, fallbackWidth) {
  if (!shape) return { width: fallbackWidth, above: 0, below: 0, stretch: [], rows: rowsOf(fallbackWidth, height, []) }
  const above = Math.max(0, shape.top - height)
  const below = Math.max(0, -shape.bottom)
  const ink = maskCells(shape).map(([c, r]) => [c, above + height - shape.top + r])
  return { width: shape.width, above, below, stretch: [], rows: rowsOf(shape.width, above + height + below, ink) }
}

export function fontFromShapes(shapes, { name, authors = [], capHeight, grid = null, spaceWidth, letterCase = "both" }) {
  const fallback = usualWidth(Array.from(shapes.values()).filter(Boolean).map(shape => shape.width), Math.max(1, Math.round(capHeight / 2)))
  const glyphs = Object.fromEntries(Array.from(shapes, ([char, shape]) => {
    const glyph = glyphFromShape(shape, capHeight, fallback)
    return [char, glyph.width === fallback ? { ...glyph, width: null } : glyph]
  }))
  const font = { ...createFont({ height: capHeight, width: fallback, grid: grid ?? detectGrid(glyphs), letterCase }), name, id: slug(name), authors: authorList(authors), spaceWidth, glyphs }
  const marked = autoStretch(font)
  return { ...marked, imported: { ...marked.glyphs, [SPACE_CHAR]: glyphFromShape(null, capHeight, fallback) } }
}

export function glyphFromTemplate(font, shape, capHeight) {
  const glyph = glyphFromShape(shape, capHeight, font.width)
  const sized = { ...font, height: capHeight, imported: null, hidden: null, glyphs: { glyph: { ...glyph, width: glyph.width === font.width ? null : glyph.width } } }
  return resizeFont(sized, { height: font.height }).glyphs.glyph
}

function templateFrom(value) {
  const valid = value && typeof value === "object" && typeof value.name === "string" && typeof value.data === "string" && value.data.startsWith("data:") && Number.isInteger(value.square) && value.square >= 1
  if (!valid) throw new Error("that JSON file's template font isn't valid")
  return { name: value.name, data: value.data, square: value.square }
}
