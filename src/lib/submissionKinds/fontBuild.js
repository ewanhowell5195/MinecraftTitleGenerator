import { SHEET_MAX_WIDTH, groupedKerning, parseMask, sheetLayout } from "../font.js"
import { exportJson, fontFromFiles, parseFontJson, buildSheet, sheetOrder } from "../fontEditor.js"
import { DEFAULT_ORDER } from "../order.js"
import { defaultBorder, defaultDepth } from "../settings.js"
import { marksFor, sheetMeasures } from "../stretchMarks.js"
import { decodePng } from "./png.js"

export const FONT_LIMITS = { capHeight: [8, 128], characters: 400, letters: 20 }
export const HOLDING_FOLDER = "submissions/fonts"

const GLYPH = [0, 0, 0]
const GRID = [255, 0, 0]
const BASELINE = [0, 255, 0]
const TOPLINE = [0, 0, 255]
const NOT_PREVIEWED = new Set([" ", "┫", "┣", "'"])
const read = new WeakMap()

const TEXT_FIELDS = ["id", "name", "author", "description", "basedOn", "order"]
const NUMBER_FIELDS = ["spaceWidth", "depth", "border", "characterSpacing", "terminatorSpaceWidth"]
const FLAG_FIELDS = ["terminatorSpace", "forcedTerminators", "autoBorder", "flat", "overlay"]
const EDITOR_NUMBERS = ["height", "width", "grid", "density"]

export function holdingPath(id) {
  return `${HOLDING_FOLDER}/${id}.json`
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function picked(source, keys, type) {
  return Object.fromEntries(keys.filter(key => typeof source[key] === type && (type !== "number" || Number.isFinite(source[key]))).map(key => [key, source[key]]))
}

function stripField(item) {
  if (typeof item === "string") return item
  if (!isRecord(item) || typeof item.id !== "string") return null
  return Number.isFinite(item.offset) ? { id: item.id, offset: item.offset } : { id: item.id }
}

export function fontJsonFields(entry) {
  if (!isRecord(entry)) return entry
  const clean = { ...picked(entry, TEXT_FIELDS, "string"), ...picked(entry, NUMBER_FIELDS, "number"), ...picked(entry, FLAG_FIELDS, "boolean") }
  if (Array.isArray(entry.strips)) clean.strips = entry.strips.map(stripField).filter(Boolean)
  if (isRecord(entry.kerning)) clean.kerning = Object.fromEntries(Object.entries(entry.kerning).filter(([amount, pairs]) => Number.isFinite(Number(amount)) && Array.isArray(pairs)).map(([amount, pairs]) => [amount, pairs.filter(pair => typeof pair === "string")]))
  if (isRecord(entry.editor)) clean.editor = { ...picked(entry.editor, EDITOR_NUMBERS, "number"), ...picked(entry.editor, ["texture"], "string") }
  return clean
}

function sheetBytes(url) {
  const match = typeof url === "string" && url.match(/^data:image\/png;base64,(.*)$/s)
  if (!match) throw new Error("This JSON has no font sheet in it. Download the JSON from the font editor.")
  return Uint8Array.from(atob(match[1]), char => char.charCodeAt(0))
}

function readFont(bytes) {
  let fields
  let json
  try {
    fields = fontJsonFields(JSON.parse(new TextDecoder().decode(bytes)))
    json = parseFontJson(JSON.stringify(fields))
  } catch (err) {
    throw new Error(`This isn't a font editor JSON file: ${err.message}.`)
  }
  const png = sheetBytes(json.editor?.texture)
  let sheet
  try {
    sheet = decodePng(png)
  } catch (err) {
    throw new Error(`The font sheet inside this JSON can't be read: ${err.message}.`)
  }
  if (sheet.width > SHEET_MAX_WIDTH * 2 || sheet.height > 4096) throw new Error(`The font sheet inside this JSON is ${sheet.width}x${sheet.height}, which is too big for a font.`)
  try {
    return { fields, json, font: fontFromFiles({ sheet, json }) }
  } catch (err) {
    throw new Error(`The font sheet inside this JSON can't be read: ${err.message}.`)
  }
}

export function submittedFont(bytes) {
  if (!read.has(bytes)) {
    try {
      read.set(bytes, readFont(bytes))
    } catch (err) {
      read.set(bytes, err)
    }
  }
  const result = read.get(bytes)
  if (result instanceof Error) throw result
  return result
}

function withMarks(cells, capHeight) {
  const measures = { capHeight, ...sheetMeasures(cells) }
  return cells.map(cell => cell.stretch ? cell : { ...cell, stretch: marksFor(cell, measures) })
}

export function drawnCells(font) {
  const sheet = buildSheet(font)
  const { list, capHeight } = parseMask(sheet.data, sheet.width, sheet.height, sheetOrder(font), 0)
  return { cells: list.filter(cell => cell.width), blank: list.filter(cell => !cell.width).map(cell => cell.char), capHeight }
}

function setPixel(data, width, x, y, colour) {
  const at = (y * width + x) * 4
  data[at] = colour[0]
  data[at + 1] = colour[1]
  data[at + 2] = colour[2]
  data[at + 3] = 255
}

export function sheetRows(cells, capHeight, { maxWidth = SHEET_MAX_WIDTH, flatWidth = Infinity, keepRows = false } = {}) {
  const rows = []
  for (const cell of cells) {
    const row = rows.at(-1)
    const wraps = !row || (keepRows ? row.at !== cell.row : row.width + cell.advance + 1 > maxWidth || row.flat + 2 + cell.width > flatWidth)
    if (wraps) rows.push({ cells: [cell], width: 1 + cell.advance + 1, flat: cell.width, at: cell.row })
    else {
      row.cells.push(cell)
      row.width += cell.advance + 1
      row.flat += 2 + cell.width
    }
  }
  for (const row of rows) {
    const marks = row.cells.flatMap(cell => cell.stretch ?? [])
    row.top = Math.max(capHeight, ...row.cells.map(cell => cell.top), ...marks.map(y => y + 1))
    row.bottom = Math.min(0, ...row.cells.map(cell => cell.bottom), ...marks)
  }
  return rows
}

export function drawSheet(cells, capHeight, { width: fixed = null, ...limits } = {}) {
  const rows = sheetRows(cells, capHeight, limits)
  const width = fixed ?? Math.max(...rows.map(row => row.width))
  if (rows.some(row => row.width > width)) throw new Error(`a character is too wide for a sheet ${width} pixels wide`)
  const height = rows.reduce((sum, row) => sum + row.top - row.bottom + 1, 1)
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  let y = 0
  for (const row of rows) {
    for (let x = 0; x < width; x++) setPixel(data, width, x, y, GRID)
    const top = y + 1
    const bottom = top + row.top - row.bottom - 1
    const baseline = top + row.top - 1
    const topline = baseline - capHeight + 1
    for (let line = top; line <= bottom; line++) setPixel(data, width, 0, line, line === baseline && line !== bottom ? BASELINE : line === topline && line !== top ? TOPLINE : GRID)
    let x = 1
    for (const cell of row.cells) {
      for (let r = 0; r < cell.height; r++) {
        for (let c = 0; c < cell.width; c++) if (cell.mask[r * cell.width + c]) setPixel(data, width, x + cell.originX + c, baseline - cell.bottom - r, GLYPH)
      }
      x += cell.advance
      for (let line = top; line <= bottom; line++) setPixel(data, width, x, line, GRID)
      for (const mark of cell.stretch ?? []) setPixel(data, width, x, baseline - mark, BASELINE)
      x++
    }
    y = bottom + 1
  }
  for (let x = 0; x < width; x++) setPixel(data, width, x, height - 1, GRID)
  return { width, height, data }
}

function previewOf(chars) {
  const shown = chars.filter(char => !NOT_PREVIEWED.has(char))
  return (shown.length ? shown : chars).slice(0, 3).join("")
}

function previewFor(drawn) {
  if (["a", "b", "c"].every(char => drawn.includes(char))) return null
  const letters = drawn.filter(char => /^\p{L}$/u.test(char))
  return previewOf(letters.length ? letters : drawn)
}

function ownKerning(font, drawn) {
  return Object.fromEntries(Object.entries(font.kerning).filter(([pair, amount]) => amount && Array.from(pair).every(char => drawn.includes(char))))
}

export function exported(font) {
  const { id, name, author, editor, ...entry } = exportJson(font, "")
  return entry
}

export function ownFont(font, parentId = null) {
  const { cells, blank, capHeight } = drawnCells(font)
  const drawn = cells.map(cell => cell.char)
  const { order, kerning, ...settings } = exported(font)
  if (settings.basedOn === parentId) delete settings.basedOn
  const pairs = ownKerning(font, drawn)
  const entry = { ...settings }
  if (drawn.join("") !== DEFAULT_ORDER) entry.order = drawn.join("")
  const preview = previewFor(drawn)
  if (preview) entry.preview = preview
  if (Object.keys(pairs).length) entry.kerning = groupedKerning(pairs)
  const marked = withMarks(cells, capHeight)
  const sheet = drawSheet(marked, capHeight, { keepRows: true })
  const published = parseMask(sheet.data, sheet.width, sheet.height, drawn.join(""), defaultBorder("top", entry)).list
  return { cells: marked, blank, capHeight, entry, sheet, published, template: fontTemplate(published, capHeight, defaultDepth(entry)) }
}

export function fontTemplate(cells, capHeight, depth) {
  let width = 0
  let height = 0
  for (const [glyph, at] of sheetLayout(cells, capHeight, depth)) {
    width = Math.max(width, at.x + glyph.width)
    height = Math.max(height, at.down + depth)
  }
  const top = Math.max(capHeight, ...cells.map(cell => cell.top))
  const bottom = Math.min(0, ...cells.map(cell => cell.bottom))
  return { width, height, rows: depth * 2 + top - bottom }
}

export function finalEntry(skeleton, derived) {
  const { id, name, author, ...rest } = skeleton
  return { id, ...(name !== undefined && { name }), author, ...rest, ...derived }
}
