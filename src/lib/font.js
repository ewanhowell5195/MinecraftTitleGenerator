import { pixelsOf } from "./canvas.js"
import { titleCase } from "./names.js"
import { DEFAULT_ORDER } from "./order.js"
import { platform } from "./platform.js"
import { defaultBorder } from "./settings.js"

export const SHEET_MAX_WIDTH = 560

const SHEET_GAP = 2

const EMPTY = 0
const GLYPH = 1
const GRID = 2
const BASELINE = 3
const TOPLINE = 4

const KINDS = [GLYPH, TOPLINE, BASELINE, -1, GRID, -1, -1, EMPTY]

function classify(data, i) {
  return KINDS[(data[i] > 127) << 2 | (data[i + 1] > 127) << 1 | (data[i + 2] > 127)]
}

function classifyAll(data, width, height) {
  const map = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const kind = classify(data, i * 4)
    if (kind === -1) {
      const x = i % width
      const y = Math.floor(i / width)
      throw new Error(`unexpected colour at ${x},${y}: rgb(${data[i * 4]}, ${data[i * 4 + 1]}, ${data[i * 4 + 2]})`)
    }
    map[i] = kind
  }
  return map
}

function horizontalLines(map, width, height) {
  const lines = []
  for (let y = 0; y < height; y++) {
    let all = true
    for (let x = 0; x < width; x++) {
      if (map[y * width + x] !== GRID) {
        all = false
        break
      }
    }
    if (all) lines.push(y)
  }
  return lines
}

function verticalLines(map, width, top, bottom) {
  const lines = []
  for (let x = 0; x < width; x++) {
    let all = true
    for (let y = top; y <= bottom; y++) {
      const kind = map[y * width + x]
      if (kind !== GRID && kind !== BASELINE && kind !== TOPLINE) {
        all = false
        break
      }
    }
    if (all) lines.push(x)
  }
  return lines
}

function findRow(map, width, top, bottom, kind) {
  for (let y = top; y <= bottom; y++) {
    if (map[y * width] === kind) return y
  }
  return null
}

export function scanMask(data, width, height) {
  const map = classifyAll(data, width, height)
  const lines = horizontalLines(map, width, height)
  if (lines.length < 2) throw new Error("no horizontal grid lines found")
  const rows = []
  for (let i = 0; i < lines.length - 1; i++) {
    const top = lines[i] + 1
    const bottom = lines[i + 1] - 1
    if (bottom < top) continue
    const columns = verticalLines(map, width, top, bottom)
    if (columns.length < 2) continue
    const cells = []
    for (let c = 0; c < columns.length - 1; c++) {
      const x = columns[c] + 1
      const cellWidth = columns[c + 1] - x
      let box = null
      for (let y = top; y <= bottom; y++) {
        for (let px = x; px < x + cellWidth; px++) {
          if (map[y * width + px] !== GLYPH) continue
          box ??= { minX: px, minY: y, maxX: px, maxY: y }
          box.minX = Math.min(box.minX, px)
          box.maxX = Math.max(box.maxX, px)
          box.maxY = Math.max(box.maxY, y)
        }
      }
      cells.push({ x, width: cellWidth, box })
    }
    rows.push({
      top,
      bottom,
      baseline: findRow(map, width, top, bottom, BASELINE) ?? bottom,
      topline: findRow(map, width, top, bottom, TOPLINE) ?? top,
      cells
    })
  }
  return { rows, isGlyph: (x, y) => map[y * width + x] === GLYPH, isStretch: (x, y) => map[y * width + x] === BASELINE }
}

export function hasMarks(font) {
  return Object.values(font?.glyphs ?? {}).some(glyph => glyph.stretch)
}

export function parseMask(data, width, height, order, gap) {
  const characters = Array.from(order)
  const { rows, isGlyph, isStretch } = scanMask(data, width, height)
  const list = []
  const capHeights = []
  let index = 0
  for (const [rowIndex, row] of rows.entries()) {
    capHeights.push(row.baseline - row.topline + 1)
    for (const [column, cell] of row.cells.entries()) {
      const char = characters[index++]
      if (char === undefined) break
      const advance = cell.width + gap * 2
      const box = cell.box
      if (!box) {
        list.push({ char, advance, originX: 0, bottom: 0, top: 0, width: 0, height: 0, mask: new Uint8Array(0), row: rowIndex, column })
        continue
      }
      const w = box.maxX - box.minX + 1
      const h = box.maxY - box.minY + 1
      const mask = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (isGlyph(box.minX + x, box.maxY - y)) mask[y * w + x] = 1
        }
      }
      const stretch = []
      for (let y = row.top; y <= row.bottom; y++) {
        if (isStretch(cell.x + cell.width, y)) stretch.push(row.baseline - y)
      }
      list.push({
        char,
        advance,
        originX: box.minX - cell.x + gap,
        bottom: row.baseline - box.maxY,
        top: row.baseline - box.minY + 1,
        width: w,
        height: h,
        mask,
        stretch: stretch.length ? stretch.sort((a, b) => a - b) : null,
        row: rowIndex,
        column
      })
    }
  }
  if (index < characters.length) throw new Error(`mask has ${index} cells but the order lists ${characters.length} characters`)
  const capHeight = capHeights[0]
  if (capHeights.some(value => value !== capHeight)) throw new Error(`rows disagree on cap height: ${capHeights.join(", ")}`)
  return { glyphs: Object.fromEntries(list.map(glyph => [glyph.char, glyph])), list, capHeight }
}

export function solidMask(data, imageWidth, density, x, top, width, height) {
  const mask = new Uint8Array(width * height)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let solid = 0
      for (let j = 0; j < density && !solid; j++) {
        for (let i = 0; i < density && !solid; i++) {
          if (data[(((top + r) * density + j) * imageWidth + (x + c) * density + i) * 4 + 3] > 127) solid = 1
        }
      }
      mask[(height - 1 - r) * width + c] = solid
    }
  }
  return mask
}

export function sheetLayout(cells, capHeight, depth) {
  const positions = new Map()
  const rows = Map.groupBy(cells.filter(glyph => glyph.width).sort((a, b) => a.row - b.row || a.column - b.column), glyph => glyph.row)
  let band = 0
  for (const row of rows.values()) {
    const rise = Math.max(capHeight, ...row.map(glyph => glyph.top))
    const drop = Math.min(0, ...row.map(glyph => glyph.bottom))
    let x = 0
    for (const glyph of row) {
      positions.set(glyph, { x, top: band + depth + rise - glyph.top, up: band, down: band + depth + rise - drop })
      x += glyph.width + SHEET_GAP
    }
    band += depth * 2 + rise - drop + SHEET_GAP
  }
  return positions
}

function partialsOf(data, list) {
  return list.filter(entry => entry.variant === data.id && entry.inherits)
}

function orderOf(data) {
  return data.order ?? DEFAULT_ORDER
}

export function splitCells(data, list, cells) {
  let start = Array.from(orderOf(data)).length
  const glyphs = Object.fromEntries(cells.slice(0, start).map(glyph => [glyph.char, glyph]))
  const alternates = {}
  for (const entry of partialsOf(data, list)) {
    const end = start + Array.from(entry.order).length
    alternates[entry.id] = Object.fromEntries(cells.slice(start, end).map(glyph => [glyph.char, glyph]))
    start = end
  }
  return { glyphs, alternates }
}

export function fullOrder(data, list) {
  return orderOf(data) + partialsOf(data, list).map(entry => entry.order).join("")
}

export function loadImage(src) {
  return platform.loadImage(src)
}

const FOLDER = "font"

const META = ["author", "description", "strips", "height", "depth", "border", "characterSpacing", "spaceWidth", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "autoBorder", "flat", "overlay", "mesh"]

function fontFolder(data) {
  return data.variant ? `${FOLDER}/${data.variant}/${data.id}` : `${FOLDER}/${data.id}`
}

export function sheetOwner(data, list) {
  return data.inherits ? list.find(entry => entry.id === data.variant) ?? data : data
}

export function sheetFolder(data, list) {
  return fontFolder(sheetOwner(data, list))
}

export function stripsOf(data, list) {
  return sheetOwner(data, list).strips ?? []
}

export function flattenFonts(list) {
  return list.flatMap(({ variants, ...entry }) => [entry].concat((variants ?? []).map(variant => ({ ...variant, variant: entry.id }))))
}

export async function loadFontList() {
  const response = await platform.fetch(`${FOLDER}/fonts.json`)
  if (!response.ok) throw new Error(`failed to load ${FOLDER}/fonts.json`)
  return flattenFonts(await response.json()).map(data => ({ ...data, name: data.name ?? titleCase(data.id) }))
}

function meta(data) {
  return Object.fromEntries(META.filter(key => data[key] !== undefined).map(key => [key, data[key]]))
}

const loaded = new Map()

export function forgetFont(id) {
  loaded.delete(id)
}

export function loadFont(data, list) {
  if (!loaded.has(data.id)) {
    loaded.set(data.id, readFont(data, list).catch(err => {
      loaded.delete(data.id)
      throw err
    }))
  }
  return loaded.get(data.id)
}

async function readFont(data, list) {
  if (data.inherits) {
    const parent = list.find(entry => entry.id === data.variant)
    if (!parent) throw new Error(`${data.id} inherits from ${data.variant}, which is not in the font list`)
    const inherited = await loadFont(parent, list)
    return {
      ...inherited,
      ...meta(data),
      id: data.id,
      name: data.name,
      variant: data.variant,
      folder: fontFolder(data),
      kerning: { ...inherited.kerning, ...data.kerning },
      glyphs: { ...inherited.glyphs, ...inherited.alternates[data.id] }
    }
  }
  const folder = fontFolder(data)
  const image = await loadImage(`${folder}/font.png`)
  const pixels = pixelsOf(image)
  const { list: cells, capHeight } = parseMask(pixels, image.width, image.height, fullOrder(data, list), defaultBorder("top", data))
  const { glyphs, alternates } = splitCells(data, list, cells)
  return {
    height: capHeight + defaultBorder("top", data) * 2,
    ...meta(data),
    id: data.id,
    name: data.name,
    variant: data.variant,
    folder,
    sheetFolder: folder,
    order: orderOf(data),
    kerning: data.kerning ?? {},
    capHeight,
    glyphs,
    alternates,
    cells
  }
}
