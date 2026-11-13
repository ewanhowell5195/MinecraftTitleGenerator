import { authorList } from "../authors.js"
import { SHEET_MAX_WIDTH, groupedKerning, parseMask, sheetLayout } from "../font.js"
import { autoStretch, charactersOf, exportJson, fontFromFiles, glyphOf, isBlank, parseFontJson, parsedSheet, savedJson } from "../fontEditor.js"
import { DEFAULT_ORDER, TERMINATOR_CLOSE, TERMINATOR_OPEN } from "../order.js"
import { defaultBorder, defaultDepth } from "../settings.js"
import { flatLayers, layerSlices } from "../flatSheet.js"
import { drawSheet } from "../sheet.js"
import { pngSize } from "../submissions.js"
import { decodePng, encodePng } from "./png.js"

export const FONT_LIMITS = { capHeight: [8, 128], characters: 400, letters: 20 }
export const HOLDING_FOLDER = "submissions/fonts"

const NOT_PREVIEWED = new Set([" ", TERMINATOR_OPEN, TERMINATOR_CLOSE, "'"])
const read = new WeakMap()

const TEXT_FIELDS = ["id", "name", "description", "basedOn", "order"]
const NUMBER_FIELDS = ["spaceWidth", "depth", "border", "characterSpacing", "terminatorSpaceWidth"]
const FLAG_FIELDS = ["multicase", "terminatorSpace", "forcedTerminators", "autoBorder", "flat", "overlay", "allFaces"]
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
  return { id: item.id, ...(Number.isFinite(item.offset) && { offset: item.offset }), ...(Number.isInteger(item.layer) && item.layer > 0 && { layer: item.layer }) }
}

export function fontJsonFields(entry) {
  if (!isRecord(entry)) return entry
  const clean = { ...picked(entry, TEXT_FIELDS, "string"), ...picked(entry, NUMBER_FIELDS, "number"), ...picked(entry, FLAG_FIELDS, "boolean") }
  const authors = authorList(entry.authors ?? entry.author)
  if (authors.length) clean.authors = authors
  if (Array.isArray(entry.strips)) clean.strips = entry.strips.map(stripField).filter(Boolean)
  if (isRecord(entry.kerning)) clean.kerning = Object.fromEntries(Object.entries(entry.kerning).filter(([amount, pairs]) => Number.isFinite(Number(amount)) && Array.isArray(pairs)).map(([amount, pairs]) => [amount, pairs.filter(pair => typeof pair === "string")]))
  if (isRecord(entry.editor)) clean.editor = { ...picked(entry.editor, EDITOR_NUMBERS, "number"), ...picked(entry.editor, ["letterCase", "texture"], "string") }
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
  const size = pngSize(png)
  if (!size) throw new Error("The font sheet inside this JSON can't be read: it isn't a PNG.")
  if (size.width > SHEET_MAX_WIDTH * 2 || size.height > 4096) throw new Error(`The font sheet inside this JSON is ${size.width}x${size.height}, which is too big for a font.`)
  let sheet
  try {
    sheet = decodePng(png)
  } catch (err) {
    throw new Error(`The font sheet inside this JSON can't be read: ${err.message}.`)
  }
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

function withMarks(font) {
  const unmarked = charactersOf(font).filter(char => !glyphOf(font, char).stretch.length)
  return unmarked.length ? autoStretch(font, unmarked) : font
}

export function drawnCells(font) {
  const { list, capHeight, layers } = parsedSheet(font, 0)
  return { cells: list.filter(cell => cell.width), capHeight, layers }
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
  const { id, name, authors, editor, ...entry } = exportJson(font, "")
  return entry
}

function sheetUrl(sheet) {
  const bytes = encodePng(sheet)
  let text = ""
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return `data:image/png;base64,${btoa(text)}`
}

export function storedFont(bytes) {
  const { fields, font } = submittedFont(bytes)
  if (!Object.values(font.glyphs).some(isBlank)) return fields
  const { order, editor: { canvas, ...editor } } = savedJson(font, sheetUrl)
  const { order: before, ...kept } = fields
  return { ...kept, ...(order !== undefined && { order }), editor }
}

export function ownFont(font, parentId = null) {
  const { cells, capHeight, layers } = drawnCells(withMarks(font))
  const drawn = cells.map(cell => cell.char)
  const { order, kerning, ...settings } = exported(font)
  if (settings.basedOn === parentId) delete settings.basedOn
  const pairs = ownKerning(font, drawn)
  const entry = { ...settings }
  if (drawn.join("") !== DEFAULT_ORDER) entry.order = drawn.join("")
  const preview = previewFor(drawn)
  if (preview) entry.preview = preview
  if (Object.keys(pairs).length) entry.kerning = groupedKerning(pairs)
  const sheet = drawSheet(cells, capHeight, { keepRows: true, layers })
  const parsed = parseMask(sheet.data, sheet.width, sheet.height, drawn.join(""), defaultBorder("top", entry))
  return { cells, capHeight, entry, sheet, published: parsed.list, layers: parsed.layers, template: fontTemplate(parsed.list, capHeight, defaultDepth(entry), parsed.layers) }
}

function fontTemplate(cells, capHeight, depth, layers = null) {
  let width = 0
  let height = 0
  for (const [glyph, at] of sheetLayout(cells, capHeight, depth)) {
    width = Math.max(width, at.x + glyph.width)
    height = Math.max(height, at.down + depth)
  }
  const top = Math.max(capHeight, ...cells.map(cell => cell.top))
  const bottom = Math.min(0, ...cells.map(cell => cell.bottom))
  if (!layers) return { width, height, rows: depth * 2 + top - bottom }
  return { width, height: flatLayers(cells, capHeight, depth, layers).height, rows: layerSlices(layers, depth).reduce((sum, slice) => sum + slice.rows * 2 + top - bottom, 0) }
}

export function finalEntry(skeleton, derived) {
  const { id, name, authors, ...rest } = skeleton
  return { id, ...(name !== undefined && { name }), authors, ...rest, ...derived }
}
