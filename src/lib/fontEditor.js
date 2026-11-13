import { authorList } from "./authors.js"
import { flatPixels } from "./flatSheet.js"
import { groupedKerning, kerningPairs, parseMask, scanMask } from "./font.js"
import { titleCase } from "./names.js"
import { mostCommon } from "./maths.js"
import { CREEPER, DEFAULT_ORDER, OPENING_QUOTE, TERMINATOR_CLOSE, TERMINATOR_OPEN } from "./order.js"
import { defaultBorder, defaultDepth } from "./settings.js"
import { drawSheet } from "./sheet.js"
import { marksFor, sheetMeasures } from "./stretchMarks.js"

export { CREEPER }

export const SPACE_CHAR = " "
export const DEFAULT_SPACE_WIDTH = 8
export const DEFAULT_DEPTH = 22
export const DEFAULT_BORDER = 2
export const REQUIRED_CHARACTERS = Array.from(DEFAULT_ORDER).filter(char => char !== CREEPER)

export const DEFAULT_ID = "my-font"
export const LETTER_CASES = [{ value: "both", label: "Both cases" }, { value: "upper", label: "Uppercase" }, { value: "lower", label: "Lowercase" }]

const GRID_SIZES = [8, 6, 5, 4, 3, 2]
const SHEETS_KEPT = 8
const NAMES = { [CREEPER]: "Creeper A", [OPENING_QUOTE]: "Opening quote", "'": "Closing quote", [TERMINATOR_OPEN]: "Left line terminator", [TERMINATOR_CLOSE]: "Right line terminator", [SPACE_CHAR]: "Space" }
const LABELS = { [CREEPER]: "Creeper", [OPENING_QUOTE]: String.fromCodePoint(0x2018), "'": String.fromCodePoint(0x2019), [SPACE_CHAR]: "Space" }
const NOTHING_TO_DRAW = /^[\p{M}\p{Cf}]$/u
const META_KEYS = ["authors", "description", "basedOn", "spaceWidth", "depth", "border", "characterSpacing", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "autoBorder", "flat", "overlay", "strips", "kerning"]
const sheets = new Map()

export function hasCase(char) {
  const upper = char.toUpperCase()
  const lower = char.toLowerCase()
  return upper !== lower && Array.from(upper).length === 1 && Array.from(lower).length === 1 && upper.toLowerCase() === lower && lower.toUpperCase() === upper
}

function canonical(char) {
  return hasCase(char) ? char.toLowerCase() : char
}

function isUpper(char) {
  return hasCase(char) && char === char.toUpperCase()
}

function shownAs(char, letterCase) {
  return letterCase === "upper" && hasCase(char) ? char.toUpperCase() : char
}

export function characterName(char, letterCase) {
  return NAMES[char] ?? shownAs(char, letterCase)
}

export function characterLabel(char, letterCase) {
  return LABELS[char] ?? shownAs(char, letterCase)
}

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function fontId(font) {
  return font.id || slug(font.name ?? "")
}

export function createFont({ height = 40, width = 24, grid = 4, density = 1, letterCase = "upper" } = {}) {
  return { name: "My Font", id: "", authors: [], description: "", basedOn: "", height, width, grid, density, letterCase, creeper: false, extras: [], defineSpace: false, spaceWidth: DEFAULT_SPACE_WIDTH, depth: DEFAULT_DEPTH, border: DEFAULT_BORDER, characterSpacing: 0, terminatorSpace: true, terminatorSpaceWidth: null, forcedTerminators: false, autoBorder: false, flat: false, overlay: false, strips: [], kerning: {}, glyphs: {}, imported: null }
}

function withCases(font, list) {
  return font.letterCase === "both" ? list.flatMap(char => hasCase(char) ? [char.toUpperCase(), char] : [char]) : list
}

export function charactersOf(font) {
  return (font.creeper ? [CREEPER] : []).concat(withCases(font, REQUIRED_CHARACTERS), withCases(font, font.extras), font.defineSpace ? [SPACE_CHAR] : [])
}

export const MULTICASE_CHARACTERS = withCases({ letterCase: "both" }, REQUIRED_CHARACTERS)

export function isOptional(char) {
  return !REQUIRED_CHARACTERS.includes(canonical(char))
}

function extrasOf(chars) {
  return Array.from(new Set(chars.map(canonical).filter(char => isOptional(char) && char !== CREEPER && char !== SPACE_CHAR)))
}

export function addCharacters(font, text) {
  let next = font
  const added = []
  const refused = []
  for (const typed of Array.from(text.normalize("NFC"))) {
    const char = canonical(typed)
    if (charactersOf(next).map(canonical).includes(char) || refused.includes(char)) continue
    if (NOTHING_TO_DRAW.test(char)) {
      refused.push(char)
      continue
    }
    if (char === CREEPER) next = { ...next, creeper: true }
    else if (char === SPACE_CHAR) next = { ...next, defineSpace: true }
    else if (char.trim()) next = { ...next, extras: next.extras.concat(char) }
    else continue
    added.push(...withCases(next, [char]))
  }
  return { font: next, added, refused }
}

export function removeCharacter(font, char) {
  const base = canonical(char)
  const forms = hasCase(base) ? [base, base.toUpperCase()] : [base]
  const kept = map => Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => !Array.from(key).some(item => forms.includes(item))))
  const next = { ...font, glyphs: kept(font.glyphs), kerning: kept(font.kerning), extras: font.extras.filter(item => item !== base) }
  if (font.hidden) next.hidden = { ...font.hidden, glyphs: kept(font.hidden.glyphs), kerning: kept(font.hidden.kerning) }
  if (char === CREEPER) next.creeper = false
  if (char === SPACE_CHAR) next.defineSpace = false
  return next
}

function trueKey(char, letterCase) {
  return letterCase === "upper" && hasCase(char) ? char.toUpperCase() : char
}

function storedKey(char, letterCase) {
  if (letterCase === "both" || !hasCase(char)) return char
  if (letterCase === "upper") return isUpper(char) ? char.toLowerCase() : null
  return isUpper(char) ? null : char
}

function keyed(key, change) {
  const chars = Array.from(key).map(change)
  return chars.includes(null) ? null : chars.join("")
}

export function setLetterCase(font, letterCase) {
  if (letterCase === font.letterCase) return font
  const next = { ...font, letterCase, hidden: {} }
  for (const key of ["glyphs", "imported", "kerning"]) {
    const all = Object.entries(font.hidden?.[key] ?? {}).concat(Object.entries(font[key] ?? {}).map(([stored, value]) => [keyed(stored, char => trueKey(char, font.letterCase)), value]))
    const shown = {}
    next.hidden[key] = {}
    for (const [real, value] of all) {
      const stored = keyed(real, char => storedKey(char, letterCase))
      if (stored === null) next.hidden[key][real] = value
      else shown[stored] = value
    }
    next[key] = font[key] || Object.keys(shown).length ? shown : font[key]
  }
  return next
}

export function sameCharacter(char, from, to) {
  const real = trueKey(char, from)
  const other = isUpper(real) ? real.toLowerCase() : real.toUpperCase()
  return storedKey(real, to) ?? storedKey(other, to)
}

function rowsOf(width, count, cells) {
  const rows = Array.from({ length: count }, () => Array.from("0".repeat(width)))
  for (const [x, row] of cells) rows[row][x] = "1"
  return rows.map(row => row.join(""))
}

function maskCells({ width, height, mask }) {
  const cells = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) if (mask[r * width + c]) cells.push([c, r])
  }
  return cells
}

function mapGlyphs(glyphs, change) {
  return Object.fromEntries(Object.entries(glyphs).map(([char, glyph]) => [char, change(glyph)]))
}

function inRows({ height, above, below }) {
  return y => y >= -below && y < height + above
}

function fontRows(ys, density) {
  return Array.from(new Set(ys.map(y => Math.floor(y / density)))).sort((a, b) => a - b)
}

export function blankGlyph(font) {
  return { width: null, above: 0, below: 0, stretch: [], rows: rowsOf(font.width, font.height, []) }
}

export function glyphOf(font, char) {
  return font.glyphs[char] ?? blankGlyph(font)
}

export function widthOf(font, glyph) {
  return glyph.width ?? font.width
}

export function yOfRow(font, glyph, row) {
  return glyph.above + font.height - 1 - row
}

export function rowOfY(font, glyph, y) {
  return glyph.above + font.height - 1 - y
}

export function isBlank(glyph) {
  return !glyph.rows.some(row => row.includes("1"))
}

function shapeOf(font, glyph) {
  return { height: font.height, width: widthOf(font, glyph), above: glyph.above, below: glyph.below }
}

function reshape(glyph, from, to) {
  const cut = from.width - to.width
  const inked = (start, end) => glyph.rows.some(row => row.slice(start, end).includes("1"))
  const start = cut > 0 && inked(to.width, from.width) && !inked(0, cut) ? cut : 0
  const rows = []
  for (let y = to.height + to.above - 1; y >= -to.below; y--) {
    const old = glyph.rows[from.above + from.height - 1 - y] ?? ""
    rows.push(old.slice(start, start + to.width).padEnd(to.width, "0"))
  }
  return { ...glyph, rows, stretch: glyph.stretch.filter(inRows(to)) }
}

export function resizeFont(font, { height = font.height, width = font.width }) {
  const next = { ...font, height, width }
  const reshaped = glyphs => glyphs && mapGlyphs(glyphs, glyph => reshape(glyph, shapeOf(font, glyph), shapeOf(next, glyph)))
  return { ...next, glyphs: reshaped(font.glyphs), imported: reshaped(font.imported), ...(font.hidden && { hidden: { ...font.hidden, glyphs: reshaped(font.hidden.glyphs), imported: reshaped(font.hidden.imported) } }) }
}

export function squaresOf(font, pixels) {
  return Math.round(pixels / font.grid * 100) / 100
}

function rescaleGlyph(font, glyph, next) {
  const scale = value => Math.round(value * next.grid / font.grid)
  const source = y => Math.floor(y * font.grid / next.grid)
  const width = scale(widthOf(font, glyph))
  const above = scale(glyph.above)
  const below = scale(glyph.below)
  const rows = []
  const stretch = []
  for (let y = next.height + above - 1; y >= -below; y--) {
    const from = glyph.rows[rowOfY(font, glyph, source(y))] ?? ""
    rows.push(Array.from({ length: width }, (_, x) => from[source(x)] === "1" ? "1" : "0").join(""))
    if (glyph.stretch.includes(source(y))) stretch.unshift(y)
  }
  return { ...glyph, width: glyph.width === null || width === next.width ? null : width, above, below, stretch, rows }
}

export function setSquareSize(font, grid) {
  const scaled = value => Math.round(value * grid / font.grid)
  const pairs = kerning => kerning && Object.fromEntries(Object.entries(kerning).map(([pair, amount]) => [pair, scaled(amount)]))
  const metrics = { spaceWidth: scaled(font.spaceWidth), characterSpacing: scaled(font.characterSpacing), terminatorSpaceWidth: font.terminatorSpaceWidth === null || font.terminatorSpaceWidth === undefined ? font.terminatorSpaceWidth : scaled(font.terminatorSpaceWidth), kerning: pairs(font.kerning) }
  const next = { ...font, ...metrics, grid, height: scaled(font.height), width: scaled(font.width) }
  const rescale = glyphs => glyphs && mapGlyphs(glyphs, glyph => rescaleGlyph(font, glyph, next))
  return { ...next, glyphs: rescale(font.glyphs), imported: rescale(font.imported), ...(font.hidden && { hidden: { glyphs: rescale(font.hidden.glyphs), imported: rescale(font.hidden.imported), kerning: pairs(font.hidden.kerning) } }) }
}

export const NOTHING_OUTSIDE = { cells: [], stretch: [] }

function inkCells(font, glyph) {
  return glyph.rows.flatMap((text, row) => Array.from(text).flatMap((value, x) => value === "1" ? [[x, yOfRow(font, glyph, row)]] : []))
}

function placed(font, glyph, cells, stretch) {
  const width = widthOf(font, glyph)
  const inside = inRows({ height: font.height, above: glyph.above, below: glyph.below })
  const fits = ([x, y]) => x >= 0 && x < width && inside(y)
  const rows = rowsOf(width, font.height + glyph.above + glyph.below, cells.filter(fits).map(([x, y]) => [x, rowOfY(font, glyph, y)]))
  return { glyph: { ...glyph, rows, stretch: stretch.filter(inside) }, outside: { cells: cells.filter(cell => !fits(cell)), stretch: stretch.filter(y => !inside(y)) } }
}

export function moveGlyph(font, glyph, dx, dy, outside = NOTHING_OUTSIDE) {
  const cells = inkCells(font, glyph).concat(outside.cells).map(([x, y]) => [x + dx, y + dy])
  return placed(font, glyph, cells, glyph.stretch.concat(outside.stretch).map(y => y + dy))
}

export function reshapeGlyph(font, char, { width, above, below }, outside = NOTHING_OUTSIDE) {
  const glyph = glyphOf(font, char)
  const changed = { ...glyph }
  if (width !== undefined) changed.width = width === font.width ? null : width
  if (above !== undefined) changed.above = above
  if (below !== undefined) changed.below = below
  const cut = widthOf(font, glyph) - widthOf(font, changed)
  const inked = (start, end) => glyph.rows.some(row => row.slice(start, end).includes("1"))
  const start = cut > 0 && inked(widthOf(font, changed), widthOf(font, glyph)) && !inked(0, cut) ? cut : 0
  const cells = inkCells(font, glyph).concat(outside.cells).map(([x, y]) => [x - start, y])
  const result = placed(font, changed, cells, glyph.stretch.concat(outside.stretch))
  return { font: setGlyph(font, char, result.glyph), outside: result.outside }
}

function inkExtent(font, glyph) {
  let top = null
  let bottom = null
  for (const [row, text] of glyph.rows.entries()) {
    if (!text.includes("1")) continue
    const y = yOfRow(font, glyph, row)
    top ??= y + 1
    bottom = y
  }
  return { top, bottom }
}

function inkLeft(glyph) {
  return Math.min(...glyph.rows.filter(row => row.includes("1")).map(row => row.indexOf("1")))
}

function trimmed(font, glyph) {
  if (isBlank(glyph)) return glyph
  const left = inkLeft(glyph)
  const right = Math.max(...glyph.rows.map(row => row.lastIndexOf("1"))) + 1
  const { top, bottom } = inkExtent(font, glyph)
  const above = Math.min(glyph.above, Math.max(0, top - font.height))
  const below = Math.min(glyph.below, Math.max(0, -bottom))
  const width = right - left
  const rows = glyph.rows.slice(glyph.above - above, glyph.rows.length - glyph.below + below).map(row => row.slice(left, right))
  const stretch = glyph.stretch.filter(inRows({ height: font.height, above, below }))
  return { ...glyph, width: width === font.width ? null : width, above, below, rows, stretch }
}

export function trimGlyph(font, char) {
  const glyph = glyphOf(font, char)
  return isBlank(glyph) ? font : setGlyph(font, char, trimmed(font, glyph))
}

export function fitGlyph(from, glyph, to) {
  let source = { ...from, imported: null, glyphs: { glyph } }
  if (source.grid !== to.grid) source = setSquareSize(source, to.grid)
  return resizeFont(source, { height: to.height, width: to.width }).glyphs.glyph
}

export function squareSizeLoss(font, grid) {
  const back = setSquareSize(setSquareSize(font, grid), font.grid)
  return Object.keys(font.glyphs).reduce((total, char) => {
    const before = font.glyphs[char].rows
    const after = back.glyphs[char].rows
    let changed = 0
    for (let row = 0; row < Math.max(before.length, after.length); row++) {
      const a = before[row] ?? ""
      const b = after[row] ?? ""
      for (let x = 0; x < Math.max(a.length, b.length); x++) if ((a[x] ?? "0") !== (b[x] ?? "0")) changed++
    }
    return total + changed
  }, 0)
}

export function inkCount(glyph) {
  return glyph.rows.join("").split("1").length - 1
}

export function sameGlyph(a, b) {
  return a.width === b.width && a.above === b.above && a.below === b.below && a.rows.join() === b.rows.join() && a.stretch.join() === b.stretch.join()
}

export function lostPixels(font, change) {
  const next = resizeFont(font, change)
  return Object.keys(font.glyphs).reduce((total, char) => total + inkCount(font.glyphs[char]) - inkCount(next.glyphs[char]), 0)
}

export function setGlyph(font, char, glyph) {
  return { ...font, glyphs: { ...font.glyphs, [char]: glyph } }
}

export function changeGlyph(font, char, change) {
  return reshapeGlyph(font, char, change).font
}

export function paint(glyph, cells, value) {
  const rows = glyph.rows.slice()
  const touched = new Map()
  for (const { x, row } of cells) {
    if (row < 0 || row >= rows.length || x < 0 || x >= rows[row].length) continue
    if (!touched.has(row)) touched.set(row, Array.from(rows[row]))
    touched.get(row)[x] = value ? "1" : "0"
  }
  for (const [row, chars] of touched) rows[row] = chars.join("")
  return { ...glyph, rows }
}

function blockIndex(font, glyph, x, row) {
  return { bx: Math.floor(x / font.grid), by: Math.floor(yOfRow(font, glyph, row) / font.grid) }
}

function blockCells(font, glyph, bx, by) {
  const cells = []
  for (let j = 0; j < font.grid; j++) {
    for (let i = 0; i < font.grid; i++) cells.push({ x: bx * font.grid + i, row: rowOfY(font, glyph, by * font.grid + j) })
  }
  return cells
}

export function blockAt(font, glyph, x, row) {
  const { bx, by } = blockIndex(font, glyph, x, row)
  return blockCells(font, glyph, bx, by)
}

function linePoints(x0, y0, x1, y1) {
  const points = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let error = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    points.push([x, y])
    if (x === x1 && y === y1) return points
    const twice = error * 2
    if (twice >= dy) {
      error += dy
      x += sx
    }
    if (twice <= dx) {
      error += dx
      y += sy
    }
  }
}

export function lineCells(font, glyph, from, to) {
  const a = blockIndex(font, glyph, from.x, from.row)
  const b = blockIndex(font, glyph, to.x, to.row)
  return linePoints(a.bx, a.by, b.bx, b.by).flatMap(([bx, by]) => blockCells(font, glyph, bx, by))
}

export function rectangleCells(font, glyph, from, to) {
  const a = blockIndex(font, glyph, from.x, from.row)
  const b = blockIndex(font, glyph, to.x, to.row)
  const cells = []
  for (let by = Math.min(a.by, b.by); by <= Math.max(a.by, b.by); by++) {
    for (let bx = Math.min(a.bx, b.bx); bx <= Math.max(a.bx, b.bx); bx++) cells.push(...blockCells(font, glyph, bx, by))
  }
  return cells
}

export function fillCells(glyph, x, row) {
  const target = glyph.rows[row]?.[x]
  if (target === undefined) return []
  const seen = new Set([`${x},${row}`])
  const stack = [[x, row]]
  const cells = []
  while (stack.length) {
    const [cx, cy] = stack.pop()
    cells.push({ x: cx, row: cy })
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
      const key = `${nx},${ny}`
      if (seen.has(key) || glyph.rows[ny]?.[nx] !== target) continue
      seen.add(key)
      stack.push([nx, ny])
    }
  }
  return cells
}

export function setStretch(font, glyph, row, value) {
  const { by } = blockIndex(font, glyph, 0, row)
  const rows = Array.from({ length: font.grid }, (_, index) => by * font.grid + index).filter(inRows(shapeOf(font, glyph)))
  const stretch = value ? Array.from(new Set(glyph.stretch.concat(rows))) : glyph.stretch.filter(y => !rows.includes(y))
  return { ...glyph, stretch: stretch.sort((a, b) => a - b) }
}

function sheetCell(font, glyph) {
  const d = font.density
  const trim = trimmed(font, glyph)
  const width = widthOf(font, trim) * d
  const stretch = trim.stretch.flatMap(y => Array.from({ length: d }, (_, index) => y * d + index))
  const { top, bottom } = inkExtent(font, trim)
  if (top === null) return { advance: width, width: 0, height: 0, mask: new Uint8Array(0), originX: 0, top: 0, bottom: 0, stretch }
  const mask = new Uint8Array(width * (top - bottom) * d)
  for (let y = bottom; y < top; y++) {
    const text = trim.rows[rowOfY(font, trim, y)]
    for (let column = 0; column < text.length; column++) {
      if (text[column] !== "1") continue
      for (let j = 0; j < d; j++) mask.fill(1, ((y - bottom) * d + j) * width + column * d, ((y - bottom) * d + j) * width + (column + 1) * d)
    }
  }
  return { advance: width, width, height: (top - bottom) * d, mask, originX: 0, top: top * d, bottom: bottom * d, stretch }
}

function builtSheet(font) {
  const key = `${font.height},${font.width},${font.density},${font.letterCase},${font.creeper},${font.defineSpace},${font.extras.join("")}`
  let built = sheets.get(font.glyphs)
  if (built?.key !== key) {
    const capHeight = font.height * font.density
    built = { key, sheet: { ...drawSheet(charactersOf(font).map(char => sheetCell(font, glyphOf(font, char))), capHeight), capHeight }, parsed: new Map() }
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
  return drawSheet(savedCharacters(font).map(char => sheetCell(font, glyphOf(font, char))), font.height * font.density)
}

export function savedJson(font, encode) {
  return exportJson(font, encode(savedSheet(font)), savedCharacters(font))
}

export function flatTexture(value, fill = null) {
  const entry = exportJson(value, "")
  const { list, capHeight } = parsedSheet(value, defaultBorder("top", entry))
  return flatPixels(fill === "all" ? list.map(cell => ({ ...cell, mask: new Uint8Array(cell.mask.length).fill(1) })) : list, capHeight, defaultDepth(entry), 1, !!fill)
}

export function parsedSheet(font, gap = font.border) {
  const { sheet, parsed } = builtSheet(font)
  if (!parsed.has(gap)) parsed.set(gap, { sheet, ...parseMask(sheet.data, sheet.width, sheet.height, sheetOrder(font), gap) })
  return parsed.get(gap)
}

function exactDivide(value, density, what) {
  if (value % density) throw new Error(`this sheet can't be read at density ${density}: ${what} is ${value}, which doesn't divide by it`)
  return value / density
}

function usualWidth(widths, fallback) {
  return mostCommon(widths.toSorted((a, b) => b - a)) ?? fallback
}

function detectGrid(glyphs) {
  const runs = Object.values(glyphs).flatMap(glyph => glyph.rows.flatMap(row => row.match(/1+/g) ?? []).map(run => run.length))
  if (!runs.length) return 1
  return GRID_SIZES.find(size => runs.filter(length => length % size === 0).length >= runs.length * 0.95) ?? 1
}

function glyphFromCell(cell, height, width, density) {
  const cellWidth = exactDivide(cell.advance, density, `the width of ${characterName(cell.char)}`)
  const above = Math.max(0, Math.ceil(cell.top / density) - height)
  const below = Math.max(0, -Math.floor(cell.bottom / density))
  const ink = maskCells(cell).map(([c, r]) => [Math.floor((cell.originX + c) / density), above + height - 1 - Math.floor((cell.bottom + r) / density)])
  return { width: cellWidth === width ? null : cellWidth, above, below, stretch: fontRows(cell.stretch ?? [], density), rows: rowsOf(cellWidth, above + height + below, ink) }
}

function cellsFromSheet({ data, width, height }, order, density) {
  const count = scanMask(data, width, height).rows.reduce((total, row) => total + row.cells.length, 0)
  const defaults = Array.from(DEFAULT_ORDER)
  const listed = order ? Array.from(order) : count > defaults.length ? defaults.concat(SPACE_CHAR) : count < defaults.length ? REQUIRED_CHARACTERS : defaults
  const { list, capHeight } = parseMask(data, width, height, listed.slice(0, count).join(""), 0)
  return { list, height: exactDivide(capHeight, density, "the cap height") }
}

function applyCells(font, list, height, density) {
  const width = usualWidth(list.map(cell => cell.advance / density), font.width)
  const glyphs = Object.fromEntries(list.map(cell => [cell.char, glyphFromCell(cell, height, width, density)]))
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

function canvasOf(font, glyph) {
  const trim = trimmed(font, glyph)
  const saved = isBlank(glyph) ? { above: 0, below: 0, stretch: [] } : trim
  const marked = saved.stretch.length === glyph.stretch.length
  if (widthOf(font, trim) === widthOf(font, glyph) && saved.above === glyph.above && saved.below === glyph.below && marked) return null
  return { width: glyph.width, left: isBlank(glyph) ? 0 : inkLeft(glyph), above: glyph.above, below: glyph.below, ...(!marked && { stretch: glyph.stretch }) }
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
  if (json?.order) {
    const listed = Array.from(json.order)
    font = { ...font, creeper: listed.includes(CREEPER), defineSpace: listed.includes(SPACE_CHAR), extras: extrasOf(listed) }
  }
  if (!sheet) return font
  const { list, height: sheetHeight } = cellsFromSheet(sheet, json?.order ?? null, density)
  font = applyCells(font, list, sheetHeight, density)
  if (editor.width) font = resizeDefaultWidth(font, editor.width)
  if (editor.canvas) font = withCanvases(font, editor.canvas)
  return editor.grid ? font : { ...font, grid: detectGrid(font.glyphs) }
}

export function fontFromPublished(entry, cells, capHeight) {
  const copy = metaFrom({ ...createFont({ height: capHeight, letterCase: entry.multicase ? "both" : "upper" }), name: `${entry.name} Copy` }, entry)
  const font = applyCells({ ...copy, authors: [], description: "", basedOn: entry.id, flat: !!entry.flat, overlay: false, strips: entry.strips ?? [] }, cells, capHeight, 1)
  return { ...font, grid: detectGrid(font.glyphs) }
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

export function exportJson(font, texture, characters = charactersOf(font)) {
  const entry = { id: fontId(font) || DEFAULT_ID, name: font.name }
  const order = characters.join("")
  const authors = authorList(font.authors)
  if (authors.length) entry.authors = authors
  if (font.description) entry.description = font.description
  if (font.basedOn) entry.basedOn = font.basedOn
  if (font.strips.length) entry.strips = font.strips
  if (order !== DEFAULT_ORDER) entry.order = order
  if (font.letterCase === "both") entry.multicase = true
  if (font.spaceWidth !== DEFAULT_SPACE_WIDTH) entry.spaceWidth = font.spaceWidth
  if (font.depth !== DEFAULT_DEPTH) entry.depth = font.depth
  if (font.border !== DEFAULT_BORDER) entry.border = font.border
  if (font.characterSpacing) entry.characterSpacing = font.characterSpacing
  for (const key of ["terminatorSpace", "forcedTerminators", "autoBorder", "flat", "overlay"]) if (font[key]) entry[key] = true
  if (font.terminatorSpace && !font.defineSpace && (font.terminatorSpaceWidth ?? font.spaceWidth) !== font.spaceWidth) entry.terminatorSpaceWidth = font.terminatorSpaceWidth
  const kerning = Object.fromEntries(Object.entries(font.kerning).filter(([, amount]) => amount))
  if (Object.keys(kerning).length) entry.kerning = groupedKerning(kerning)
  const canvas = Object.fromEntries(Array.from(order).flatMap(char => {
    const saved = font.glyphs[char] && canvasOf(font, font.glyphs[char])
    return saved ? [[char, saved]] : []
  }))
  entry.editor = { height: font.height, width: font.width, grid: font.grid, density: font.density, ...(font.letterCase === "lower" && { letterCase: "lower" }), ...(Object.keys(canvas).length && { canvas }), texture }
  return entry
}
