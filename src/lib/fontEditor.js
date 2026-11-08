import { flatPixels } from "./flatSheet.js"
import { SHEET_MAX_WIDTH, parseMask, scanMask } from "./font.js"
import { titleCase } from "./names.js"
import { DEFAULT_ORDER } from "./order.js"
import { defaultBorder, defaultDepth } from "./settings.js"
import { marksFor, sheetMeasures } from "./stretchMarks.js"

export const SPACE_CHAR = " "
export const CREEPER = "\u{1F633}"
export const DEFAULT_SPACE_WIDTH = 8
export const DEFAULT_DEPTH = 22
export const DEFAULT_BORDER = 2
export const REQUIRED_CHARACTERS = Array.from(DEFAULT_ORDER).filter(char => char !== CREEPER)

const GLYPH_PIXEL = [0, 0, 0]
const GRID_PIXEL = [255, 0, 0]
const BASELINE_PIXEL = [0, 255, 0]
const TOPLINE_PIXEL = [0, 0, 255]
const GRID_SIZES = [8, 6, 5, 4, 3, 2]
const NAMES = { [CREEPER]: "Creeper A", "\u{1F629}": "Opening quote", "'": "Closing quote", "┫": "Left line terminator", "┣": "Right line terminator", [SPACE_CHAR]: "Space" }
const META_KEYS = ["author", "description", "basedOn", "spaceWidth", "depth", "border", "characterSpacing", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "autoBorder", "flat", "overlay", "strips", "kerning"]

export function characterName(char) {
  return NAMES[char] ?? char
}

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function createFont({ height = 40, width = 24, grid = 4, density = 1 } = {}) {
  return { name: "My Font", id: "", author: "", description: "", basedOn: "", height, width, grid, density, creeper: false, extras: [], defineSpace: false, spaceWidth: DEFAULT_SPACE_WIDTH, depth: DEFAULT_DEPTH, border: DEFAULT_BORDER, characterSpacing: 0, terminatorSpace: true, terminatorSpaceWidth: null, forcedTerminators: false, autoBorder: false, flat: false, overlay: false, strips: [], kerning: {}, glyphs: {}, imported: null }
}

export function charactersOf(font) {
  return (font.creeper ? [CREEPER] : []).concat(REQUIRED_CHARACTERS, font.extras, font.defineSpace ? [SPACE_CHAR] : [])
}

export function isOptional(char) {
  return !REQUIRED_CHARACTERS.includes(char)
}

function extrasOf(chars) {
  return chars.filter(char => isOptional(char) && char !== CREEPER && char !== SPACE_CHAR)
}

export function addCharacters(font, text) {
  let next = font
  const added = []
  for (const char of Array.from(text.toLowerCase())) {
    if (charactersOf(next).includes(char)) continue
    if (char === CREEPER) next = { ...next, creeper: true }
    else if (char === SPACE_CHAR) next = { ...next, defineSpace: true }
    else if (char.trim()) next = { ...next, extras: next.extras.concat(char) }
    else continue
    added.push(char)
  }
  return { font: next, added }
}

export function removeCharacter(font, char) {
  const glyphs = { ...font.glyphs }
  delete glyphs[char]
  const kerning = Object.fromEntries(Object.entries(font.kerning).filter(([pair]) => !Array.from(pair).includes(char)))
  const next = { ...font, glyphs, kerning, extras: font.extras.filter(item => item !== char) }
  if (char === CREEPER) next.creeper = false
  if (char === SPACE_CHAR) next.defineSpace = false
  return next
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
  return { ...next, glyphs: mapGlyphs(font.glyphs, glyph => reshape(glyph, shapeOf(font, glyph), shapeOf(next, glyph))) }
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
  const metrics = { spaceWidth: scaled(font.spaceWidth), characterSpacing: scaled(font.characterSpacing), terminatorSpaceWidth: font.terminatorSpaceWidth === null || font.terminatorSpaceWidth === undefined ? font.terminatorSpaceWidth : scaled(font.terminatorSpaceWidth), kerning: Object.fromEntries(Object.entries(font.kerning).map(([pair, amount]) => [pair, scaled(amount)])) }
  const next = { ...font, ...metrics, grid, height: scaled(font.height), width: scaled(font.width) }
  const rescale = glyphs => glyphs && mapGlyphs(glyphs, glyph => rescaleGlyph(font, glyph, next))
  return { ...next, glyphs: rescale(font.glyphs), imported: rescale(font.imported) }
}

export function shiftGlyph(glyph, dx, dy) {
  const height = glyph.rows.length
  const width = glyph.rows[0]?.length ?? 0
  const cells = glyph.rows.flatMap((text, row) => Array.from(text).flatMap((value, x) => value === "1" ? [[x + dx, row - dy]] : []))
  if (cells.some(([x, row]) => x < 0 || x >= width || row < 0 || row >= height)) return null
  const stretch = glyph.stretch.map(y => y + dy).filter(y => y >= -glyph.below && y < height - glyph.below)
  return { ...glyph, rows: rowsOf(width, height, cells), stretch }
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

export function trimGlyph(font, char) {
  const glyph = glyphOf(font, char)
  if (isBlank(glyph)) return font
  const inked = glyph.rows.filter(row => row.includes("1"))
  const left = Math.min(...inked.map(row => row.indexOf("1")))
  const right = Math.max(...inked.map(row => row.lastIndexOf("1"))) + 1
  const { top, bottom } = inkExtent(font, glyph)
  const above = Math.min(glyph.above, Math.max(0, top - font.height))
  const below = Math.min(glyph.below, Math.max(0, -bottom))
  const width = right - left
  const rows = glyph.rows.slice(glyph.above - above, glyph.rows.length - glyph.below + below).map(row => row.slice(left, right))
  const stretch = glyph.stretch.filter(inRows({ height: font.height, above, below }))
  return setGlyph(font, char, { ...glyph, width: width === font.width ? null : width, above, below, rows, stretch })
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

function inkCount(glyph) {
  return glyph.rows.join("").split("1").length - 1
}

export function lostPixels(font, change) {
  const next = resizeFont(font, change)
  return Object.keys(font.glyphs).reduce((total, char) => total + inkCount(font.glyphs[char]) - inkCount(next.glyphs[char]), 0)
}

export function setGlyph(font, char, glyph) {
  return { ...font, glyphs: { ...font.glyphs, [char]: glyph } }
}

export function changeGlyph(font, char, { width, above, below }) {
  const glyph = glyphOf(font, char)
  const changed = { ...glyph }
  if (width !== undefined) changed.width = width === font.width ? null : width
  if (above !== undefined) changed.above = above
  if (below !== undefined) changed.below = below
  return setGlyph(font, char, reshape(changed, shapeOf(font, glyph), shapeOf(font, changed)))
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

function setPixel(data, width, x, y, colour) {
  const at = (y * width + x) * 4
  data[at] = colour[0]
  data[at + 1] = colour[1]
  data[at + 2] = colour[2]
  data[at + 3] = 255
}

export function buildSheet(font) {
  const d = font.density
  const capHeight = font.height * d
  const cells = charactersOf(font).map(char => {
    const glyph = glyphOf(trimGlyph(font, char), char)
    return { glyph, width: widthOf(font, glyph) * d, ...inkExtent(font, glyph) }
  })
  const rows = []
  for (const cell of cells) {
    const row = rows.at(-1)
    if (!row || row.width + cell.width + 1 > SHEET_MAX_WIDTH) rows.push({ cells: [cell], width: 1 + cell.width + 1 })
    else {
      row.cells.push(cell)
      row.width += cell.width + 1
    }
  }
  for (const row of rows) {
    const marks = row.cells.flatMap(cell => cell.glyph.stretch)
    row.top = Math.max(font.height, ...row.cells.map(cell => cell.top ?? 0), ...marks.map(y => y + 1)) * d
    row.bottom = Math.min(0, ...row.cells.map(cell => cell.bottom ?? 0), ...marks) * d
  }
  const width = Math.max(...rows.map(row => row.width))
  const height = rows.reduce((sum, row) => sum + row.top - row.bottom + 1, 1)
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  let y = 0
  for (const row of rows) {
    for (let x = 0; x < width; x++) setPixel(data, width, x, y, GRID_PIXEL)
    const top = y + 1
    const bottom = top + row.top - row.bottom - 1
    const baseline = top + row.top - 1
    const topline = baseline - capHeight + 1
    for (let line = top; line <= bottom; line++) setPixel(data, width, 0, line, line === baseline && line !== bottom ? BASELINE_PIXEL : line === topline && line !== top ? TOPLINE_PIXEL : GRID_PIXEL)
    let x = 1
    for (const { glyph, width: cellWidth } of row.cells) {
      for (const [rowIndex, text] of glyph.rows.entries()) {
        const art = yOfRow(font, glyph, rowIndex)
        for (let column = 0; column < text.length; column++) {
          if (text[column] !== "1") continue
          for (let j = 0; j < d; j++) {
            for (let i = 0; i < d; i++) setPixel(data, width, x + column * d + i, baseline - art * d - j, GLYPH_PIXEL)
          }
        }
      }
      x += cellWidth
      for (let line = top; line <= bottom; line++) setPixel(data, width, x, line, GRID_PIXEL)
      for (const art of glyph.stretch) {
        for (let j = 0; j < d; j++) setPixel(data, width, x, baseline - art * d - j, BASELINE_PIXEL)
      }
      x++
    }
    y = bottom + 1
  }
  for (let x = 0; x < width; x++) setPixel(data, width, x, height - 1, GRID_PIXEL)
  return { width, height, data, capHeight }
}

export function sheetOrder(font) {
  return charactersOf(font).join("")
}

export function flatTexture(value, fill = null) {
  const entry = exportJson(value, "")
  const { list, capHeight } = parsedSheet(value, defaultBorder("top", entry))
  return flatPixels(fill === "all" ? list.map(cell => ({ ...cell, mask: new Uint8Array(cell.mask.length).fill(1) })) : list, capHeight, defaultDepth(entry), 1, !!fill)
}

export function parsedSheet(font, gap = font.border) {
  const sheet = buildSheet(font)
  return { sheet, ...parseMask(sheet.data, sheet.width, sheet.height, sheetOrder(font), gap) }
}

function exactDivide(value, density, what) {
  if (value % density) throw new Error(`this sheet can't be read at density ${density}: ${what} is ${value}, which doesn't divide by it`)
  return value / density
}

function mostCommon(values, fallback) {
  const tally = new Map()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  return Array.from(tally).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? fallback
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
  const width = mostCommon(list.map(cell => cell.advance / density), font.width)
  const glyphs = Object.fromEntries(list.map(cell => [cell.char, glyphFromCell(cell, height, width, density)]))
  return { ...font, height, width, density, glyphs, creeper: CREEPER in glyphs, extras: extrasOf(list.map(cell => cell.char)), defineSpace: !!glyphs[SPACE_CHAR] && !isBlank(glyphs[SPACE_CHAR]) || font.defineSpace }
}

function metaFrom(font, entry) {
  const next = { ...font, terminatorSpace: false }
  for (const key of META_KEYS) if (entry[key] !== undefined) next[key] = entry[key]
  return next
}

export function parseFontJson(text) {
  let entry
  try {
    entry = JSON.parse(text)
  } catch (err) {
    throw new Error(`that JSON file can't be read: ${err.message}`)
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("that JSON file isn't a font entry")
  return entry
}

function resizeDefaultWidth(font, width) {
  const glyphs = mapGlyphs(font.glyphs, glyph => {
    const own = widthOf(font, glyph)
    return { ...glyph, width: own === width ? null : own }
  })
  return { ...font, width, glyphs }
}

export function fontFromFiles({ sheet = null, json = null }) {
  if (!sheet && !json) throw new Error("choose a font.png, a font JSON file, or both")
  const editor = json?.editor ?? {}
  const density = editor.density ?? 1
  const border = json?.border ?? DEFAULT_BORDER
  const height = editor.height ?? (json?.height ? json.height - border * 2 : 40)
  let font = createFont({ height, width: editor.width ?? 24, grid: editor.grid ?? 4, density })
  if (json) font = metaFrom({ ...font, name: json.name ?? (json.id ? titleCase(json.id) : font.name), id: json.id ?? "" }, json)
  if (json?.order) {
    const listed = Array.from(json.order)
    font = { ...font, creeper: listed.includes(CREEPER), defineSpace: listed.includes(SPACE_CHAR), extras: extrasOf(listed) }
  }
  if (!sheet) return font
  const { list, height: sheetHeight } = cellsFromSheet(sheet, json?.order ?? null, density)
  font = applyCells(font, list, sheetHeight, density)
  if (editor.width) font = resizeDefaultWidth(font, editor.width)
  return editor.grid ? font : { ...font, grid: detectGrid(font.glyphs) }
}

export function fontFromPublished(entry, cells, capHeight) {
  const copy = metaFrom({ ...createFont({ height: capHeight }), name: `${entry.name} Copy` }, entry)
  const font = applyCells({ ...copy, author: "", description: "", basedOn: entry.id, flat: !!entry.flat, overlay: false, strips: entry.strips ?? [] }, cells, capHeight, 1)
  return { ...font, grid: detectGrid(font.glyphs) }
}

function glyphFromShape(shape, height, fallbackWidth) {
  if (!shape) return { width: fallbackWidth, above: 0, below: 0, stretch: [], rows: rowsOf(fallbackWidth, height, []) }
  const above = Math.max(0, shape.top - height)
  const below = Math.max(0, -shape.bottom)
  const ink = maskCells(shape).map(([c, r]) => [c, above + height - shape.top + r])
  return { width: shape.width, above, below, stretch: [], rows: rowsOf(shape.width, above + height + below, ink) }
}

export function fontFromShapes(shapes, { name, author = "", capHeight, grid = null, spaceWidth, missing = [] }) {
  const fallback = mostCommon(Array.from(shapes.values()).filter(Boolean).map(shape => shape.width), Math.max(1, Math.round(capHeight / 2)))
  const glyphs = Object.fromEntries(Array.from(shapes, ([char, shape]) => {
    const glyph = glyphFromShape(shape, capHeight, fallback)
    return [char, glyph.width === fallback ? { ...glyph, width: null } : glyph]
  }))
  const font = { ...createFont({ height: capHeight, width: fallback, grid: grid ?? detectGrid(glyphs) }), name, id: slug(name), author, spaceWidth, glyphs }
  const marked = autoStretch(font)
  return { ...marked, imported: { ...marked.glyphs, [SPACE_CHAR]: glyphFromShape(null, capHeight, fallback) }, missing }
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

export function exportJson(font, texture) {
  const entry = { id: font.id || slug(font.name) || "my-font", name: font.name }
  const order = sheetOrder(font)
  if (font.author) entry.author = font.author
  if (font.description) entry.description = font.description
  if (font.basedOn) entry.basedOn = font.basedOn
  if (font.strips.length) entry.strips = font.strips
  if (order !== DEFAULT_ORDER) entry.order = order
  if (font.spaceWidth !== DEFAULT_SPACE_WIDTH) entry.spaceWidth = font.spaceWidth
  if (font.depth !== DEFAULT_DEPTH) entry.depth = font.depth
  if (font.border !== DEFAULT_BORDER) entry.border = font.border
  if (font.characterSpacing) entry.characterSpacing = font.characterSpacing
  for (const key of ["terminatorSpace", "forcedTerminators", "autoBorder", "flat", "overlay"]) if (font[key]) entry[key] = true
  if (font.terminatorSpace && !font.defineSpace && (font.terminatorSpaceWidth ?? font.spaceWidth) !== font.spaceWidth) entry.terminatorSpaceWidth = font.terminatorSpaceWidth
  const kerning = Object.fromEntries(Object.entries(font.kerning).filter(([, amount]) => amount))
  if (Object.keys(kerning).length) entry.kerning = kerning
  entry.editor = { height: font.height, width: font.width, grid: font.grid, density: font.density, texture }
  return entry
}

export function stripProblems(range, depth, set, imageHeight, offset = 0) {
  const problems = []
  const baseline = set.baseline ?? set.depth
  const below = baseline - set.depth + offset
  if (depth > set.depth) problems.push(`its depth of ${depth} is over the strips' maximum of ${set.depth}`)
  if (-range.bottom > below) problems.push(`its letters go ${-range.bottom} below the baseline, and the strips only cover ${below}`)
  if (set.height) {
    if (range.top + offset > set.height) problems.push(`its letters reach ${range.top + offset} above the strips' baseline, and the strips only go up to ${set.height}`)
    return problems
  }
  const resolution = imageHeight / (baseline + range.top + set.depth + offset)
  if (!Number.isInteger(Math.log2(resolution))) problems.push(`its letters are ${range.top} tall above the baseline${offset ? ` with an offset of ${offset}` : ""}, which doesn't line up with the strips`)
  return problems
}
