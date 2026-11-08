import { DEFAULT_ORDER, SHEET_MAX_WIDTH, parseMask, scanMask } from "./font.js"
import { titleCase } from "./names.js"
import { marksFor, sheetMeasures } from "./stretchMarks.js"

export const SPACE_CHAR = " "
export const CREEPER = "\u{1F633}"
export const DEFAULT_SPACE_WIDTH = 8
export const DEFAULT_DEPTH = 22
export const DEFAULT_BORDER = 2

const EMPTY_PIXEL = [255, 255, 255]
const GLYPH_PIXEL = [0, 0, 0]
const GRID_PIXEL = [255, 0, 0]
const BASELINE_PIXEL = [0, 255, 0]
const TOPLINE_PIXEL = [0, 0, 255]
const GRID_SIZES = [8, 6, 5, 4, 3, 2]
const NAMES = { "\u{1F633}": "Creeper A", "\u{1F629}": "Opening quote", "'": "Closing quote", "┫": "Left line terminator", "┣": "Right line terminator", " ": "Space" }

export function characterName(char) {
  return NAMES[char] ?? char
}

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function createFont({ height = 40, width = 24, grid = 4, density = 1 } = {}) {
  return { name: "My Font", id: "", author: "", description: "", basedOn: "", height, width, grid, density, creeper: false, extras: [], defineSpace: false, spaceWidth: DEFAULT_SPACE_WIDTH, depth: DEFAULT_DEPTH, border: DEFAULT_BORDER, characterSpacing: 0, terminatorSpace: true, terminatorSpaceWidth: null, forcedTerminators: false, autoBorder: false, flat: false, overlay: false, strips: [], kerning: {}, glyphs: {}, imported: null }
}

const REQUIRED = Array.from(DEFAULT_ORDER).filter(char => char !== CREEPER)

export function charactersOf(font) {
  return (font.creeper ? [CREEPER] : []).concat(REQUIRED, font.extras, font.defineSpace ? [SPACE_CHAR] : [])
}

export function isOptional(char) {
  return !REQUIRED.includes(char)
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

function blankRows(width, count) {
  return Array.from({ length: count }, () => "0".repeat(width))
}

export function blankGlyph(font) {
  return { width: null, above: 0, below: 0, stretch: [], rows: blankRows(font.width, font.height) }
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

function reshape(glyph, from, to) {
  const cut = from.width - to.width
  const inked = (start, end) => glyph.rows.some(row => row.slice(start, end).includes("1"))
  const start = cut > 0 && inked(to.width, from.width) && !inked(0, cut) ? cut : 0
  const rows = []
  for (let y = to.height + to.above - 1; y >= -to.below; y--) {
    const old = glyph.rows[from.above + from.height - 1 - y] ?? ""
    rows.push(old.slice(start, start + to.width).padEnd(to.width, "0"))
  }
  const stretch = glyph.stretch.filter(y => y >= -to.below && y < to.height + to.above)
  return { ...glyph, rows, stretch }
}

function shapeOf(font, glyph) {
  return { height: font.height, width: widthOf(font, glyph), above: glyph.above, below: glyph.below }
}

export function resizeFont(font, { height = font.height, width = font.width }) {
  const next = { ...font, height, width }
  const glyphs = Object.fromEntries(Object.entries(font.glyphs).map(([char, glyph]) => [char, reshape(glyph, shapeOf(font, glyph), shapeOf(next, glyph))]))
  return { ...next, glyphs }
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

function rescaleGlyphs(font, glyphs, next) {
  return glyphs && Object.fromEntries(Object.entries(glyphs).map(([char, glyph]) => [char, rescaleGlyph(font, glyph, next)]))
}

export function setSquareSize(font, grid) {
  const next = { ...font, grid, height: Math.round(font.height * grid / font.grid), width: Math.round(font.width * grid / font.grid) }
  return { ...next, glyphs: rescaleGlyphs(font, font.glyphs, next), imported: rescaleGlyphs(font, font.imported, next) }
}

export function shiftGlyph(glyph, dx, dy) {
  const height = glyph.rows.length
  const width = glyph.rows[0]?.length ?? 0
  const cells = glyph.rows.flatMap((text, row) => Array.from(text).flatMap((value, x) => value === "1" ? [[x + dx, row - dy]] : []))
  if (cells.some(([x, row]) => x < 0 || x >= width || row < 0 || row >= height)) return null
  const rows = Array.from({ length: height }, () => Array(width).fill("0"))
  for (const [x, row] of cells) rows[row][x] = "1"
  const stretch = glyph.stretch.map(y => y + dy).filter(y => y >= -glyph.below && y < height - glyph.below)
  return { ...glyph, rows: rows.map(row => row.join("")), stretch }
}

export function trimGlyph(font, char) {
  const glyph = glyphOf(font, char)
  if (isBlank(glyph)) return font
  const inked = glyph.rows.filter(row => row.includes("1"))
  const left = Math.min(...inked.map(row => row.indexOf("1")))
  const right = Math.max(...inked.map(row => row.lastIndexOf("1"))) + 1
  const { top, bottom } = inkExtent(glyph, font)
  const above = Math.min(glyph.above, Math.max(0, top - font.height))
  const below = Math.min(glyph.below, Math.max(0, -bottom))
  const width = right - left
  const rows = glyph.rows.slice(glyph.above - above, glyph.rows.length - glyph.below + below).map(row => row.slice(left, right))
  const stretch = glyph.stretch.filter(y => y >= -below && y < font.height + above)
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
  return setGlyph(font, char, { ...reshape(glyph, shapeOf(font, glyph), shapeOf(font, changed)), width: changed.width, above: changed.above, below: changed.below })
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
  const rows = Array.from({ length: font.grid }, (_, index) => by * font.grid + index).filter(y => y >= -glyph.below && y < font.height + glyph.above)
  const stretch = value ? Array.from(new Set(glyph.stretch.concat(rows))) : glyph.stretch.filter(y => !rows.includes(y))
  return { ...glyph, stretch: stretch.sort((a, b) => a - b) }
}

function inkExtent(glyph, font) {
  let top = null
  let bottom = null
  glyph.rows.forEach((text, row) => {
    if (!text.includes("1")) return
    const y = yOfRow(font, glyph, row)
    top ??= y + 1
    bottom = y
  })
  return { top, bottom }
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
    return { char, glyph, width: widthOf(font, glyph) * d, ...inkExtent(glyph, font) }
  })
  const rows = []
  for (const cell of cells) {
    const row = rows[rows.length - 1]
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
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPixel(data, width, x, y, EMPTY_PIXEL)
  }
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
      glyph.rows.forEach((text, rowIndex) => {
        const art = yOfRow(font, glyph, rowIndex)
        for (let column = 0; column < text.length; column++) {
          if (text[column] !== "1") continue
          for (let j = 0; j < d; j++) {
            for (let i = 0; i < d; i++) setPixel(data, width, x + column * d + i, baseline - art * d - j, GLYPH_PIXEL)
          }
        }
      })
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

function runLengths(rows) {
  return rows.flatMap(row => row.match(/1+/g) ?? []).map(run => run.length)
}

export function detectGrid(glyphs) {
  const runs = Object.values(glyphs).flatMap(glyph => runLengths(glyph.rows))
  if (!runs.length) return 1
  return GRID_SIZES.find(size => runs.filter(length => length % size === 0).length >= runs.length * 0.95) ?? 1
}

function glyphFromCell(cell, height, width, density) {
  const cellWidth = exactDivide(cell.advance, density, `the width of ${characterName(cell.char)}`)
  const top = Math.ceil(cell.top / density)
  const bottom = Math.floor(cell.bottom / density)
  const above = Math.max(0, top - height)
  const below = Math.max(0, -bottom)
  const rows = Array.from({ length: above + height + below }, () => Array(cellWidth).fill("0"))
  for (let r = 0; r < cell.height; r++) {
    for (let c = 0; c < cell.width; c++) {
      if (!cell.mask[r * cell.width + c]) continue
      const art = Math.floor((cell.bottom + r) / density)
      rows[above + height - 1 - art][Math.floor((cell.originX + c) / density)] = "1"
    }
  }
  const stretch = Array.from(new Set((cell.stretch ?? []).map(y => Math.floor(y / density)))).sort((a, b) => a - b)
  return { width: cellWidth === width ? null : cellWidth, above, below, stretch, rows: rows.map(row => row.join("")) }
}

function cellCount(data, width, height) {
  return scanMask(data, width, height).rows.reduce((total, row) => total + row.cells.length, 0)
}

export function cellsFromSheet({ data, width, height }, order = null, density = 1) {
  const count = cellCount(data, width, height)
  const defaults = Array.from(DEFAULT_ORDER)
  const listed = order ? Array.from(order) : count > defaults.length ? defaults.concat(SPACE_CHAR) : count < defaults.length ? REQUIRED : defaults
  const { list, capHeight } = parseMask(data, width, height, listed.slice(0, count).join(""), 0)
  return { list, height: exactDivide(capHeight, density, "the cap height") }
}

function applyCells(font, list, height, density) {
  const width = mostCommon(list.map(cell => cell.advance / density), font.width)
  const glyphs = Object.fromEntries(list.map(cell => [cell.char, glyphFromCell(cell, height, width, density)]))
  const extras = list.map(cell => cell.char).filter(char => isOptional(char) && char !== CREEPER && char !== SPACE_CHAR)
  return { ...font, height, width, density, glyphs, creeper: CREEPER in glyphs, extras, defineSpace: !!glyphs[SPACE_CHAR] && !isBlank(glyphs[SPACE_CHAR]) || font.defineSpace }
}

const META_KEYS = ["author", "description", "basedOn", "spaceWidth", "depth", "border", "characterSpacing", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "autoBorder", "flat", "overlay", "strips", "kerning"]

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
    font = { ...font, creeper: listed.includes(CREEPER), defineSpace: listed.includes(SPACE_CHAR), extras: listed.filter(char => isOptional(char) && char !== CREEPER && char !== SPACE_CHAR) }
  }
  if (!sheet) return font
  const { list, height: sheetHeight } = cellsFromSheet(sheet, json?.order ?? null, density)
  font = applyCells(font, list, sheetHeight, density)
  if (editor.width) font = { ...resizeDefaultWidth(font, editor.width) }
  if (!editor.grid) font.grid = detectGrid(font.glyphs)
  return font
}

function resizeDefaultWidth(font, width) {
  const glyphs = Object.fromEntries(Object.entries(font.glyphs).map(([char, glyph]) => {
    const own = glyph.width ?? font.width
    return [char, { ...glyph, width: own === width ? null : own }]
  }))
  return { ...font, width, glyphs }
}

export function fontFromPublished(entry, cells, capHeight) {
  const copy = createFont({ height: capHeight })
  let font = metaFrom({ ...copy, name: `${entry.name} Copy` }, entry)
  font = { ...font, author: "", description: "", basedOn: entry.id, flat: !!entry.flat, overlay: false, strips: entry.strips ?? [] }
  font = applyCells(font, cells, capHeight, 1)
  return { ...font, grid: detectGrid(font.glyphs) }
}

export function glyphFromShape(shape, height, fallbackWidth) {
  if (!shape) return { width: fallbackWidth, above: 0, below: 0, stretch: [], rows: blankRows(fallbackWidth, height) }
  const above = Math.max(0, shape.top - height)
  const below = Math.max(0, -shape.bottom)
  const rows = blankRows(shape.width, above + height + below).map(row => Array.from(row))
  for (let r = 0; r < shape.height; r++) {
    const art = shape.top - 1 - r
    for (let c = 0; c < shape.width; c++) if (shape.mask[r * shape.width + c]) rows[above + height - 1 - art][c] = "1"
  }
  return { width: shape.width, above, below, stretch: [], rows: rows.map(row => row.join("")) }
}

function mostCommonWidth(shapes) {
  const counts = new Map()
  for (const shape of shapes) if (shape) counts.set(shape.width, (counts.get(shape.width) ?? 0) + 1)
  return Array.from(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null
}

export function fontFromShapes(shapes, { name, author = "", capHeight, grid = null, spaceWidth, missing = [] }) {
  const fallback = mostCommonWidth(Array.from(shapes.values())) ?? Math.max(1, Math.round(capHeight / 2))
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
    const rows = marksFor(cell, measures)
    const glyph = glyphOf(next, cell.char)
    next = setGlyph(next, cell.char, { ...glyph, stretch: Array.from(new Set(rows.map(y => Math.floor(y / font.density)))).sort((a, b) => a - b) })
  }
  return next
}

export function exportJson(font, texture) {
  const entry = { id: font.id || slug(font.name) || "my-font", name: font.name }
  if (font.author) entry.author = font.author
  if (font.description) entry.description = font.description
  if (font.basedOn) entry.basedOn = font.basedOn
  if (font.strips.length) entry.strips = font.strips
  if (sheetOrder(font) !== DEFAULT_ORDER) entry.order = sheetOrder(font)
  if (font.spaceWidth !== DEFAULT_SPACE_WIDTH) entry.spaceWidth = font.spaceWidth
  if (font.depth !== DEFAULT_DEPTH) entry.depth = font.depth
  if (font.border !== DEFAULT_BORDER) entry.border = font.border
  if (font.characterSpacing) entry.characterSpacing = font.characterSpacing
  for (const key of ["terminatorSpace", "forcedTerminators", "autoBorder", "flat", "overlay"]) if (font[key]) entry[key] = true
  if (font.terminatorSpace && !font.defineSpace && font.terminatorSpaceWidth !== null && font.terminatorSpaceWidth !== undefined && font.terminatorSpaceWidth !== font.spaceWidth) entry.terminatorSpaceWidth = font.terminatorSpaceWidth
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
