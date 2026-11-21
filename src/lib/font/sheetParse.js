import { DEFAULT_ORDER } from "./order.js"
import { depthShade } from "./sheet.js"

const EMPTY = 0
const GLYPH = 1
const GRID = 2
const BASELINE = 3
const TOPLINE = 4

const KINDS = [GLYPH, TOPLINE, BASELINE, -1, GRID, -1, -1, EMPTY]

const NOISE = 8

function greyOf(data, i) {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  return Math.max(r, g, b) - Math.min(r, g, b) <= NOISE * 2 ? Math.round((r + g + b) / 3) : null
}

function classify(data, i) {
  const grey = greyOf(data, i)
  if (grey !== null) return grey >= 255 - NOISE ? EMPTY : GLYPH
  return KINDS[(data[i] > 127) << 2 | (data[i + 1] > 127) << 1 | (data[i + 2] > 127)]
}

export function shadeLevels(counts) {
  const groups = []
  for (let value = 0; value < counts.length; value++) {
    if (!counts[value]) continue
    const last = groups.at(-1)
    if (last && value - last.end <= NOISE) last.end = value
    else groups.push({ start: value, end: value })
  }
  const index = new Int16Array(counts.length).fill(-1)
  const layers = groups.map((group, at) => {
    let shade = group.start
    for (let value = group.start; value <= group.end; value++) {
      index[value] = at
      if (counts[value] > counts[shade]) shade = value
    }
    return shadeDepth(shade)
  })
  return { layers, index }
}

function shadeDepth(shade) {
  const exact = 1 - shade / 255
  const candidates = [Math.round(exact * 8) / 8, Math.round(exact * 100) / 100, Math.round(exact * 1000) / 1000]
  return candidates.find(depth => depthShade(depth) === shade) ?? exact
}

function classifyAll(data, width, height) {
  const map = new Uint8Array(width * height)
  const shades = new Uint8Array(width * height)
  const counts = new Uint32Array(256)
  for (let i = 0; i < width * height; i++) {
    const kind = classify(data, i * 4)
    if (kind === -1) {
      const x = i % width
      const y = Math.floor(i / width)
      throw new Error(`unexpected colour at ${x},${y}: rgb(${data[i * 4]}, ${data[i * 4 + 1]}, ${data[i * 4 + 2]})`)
    }
    map[i] = kind
    if (kind !== GLYPH) continue
    shades[i] = greyOf(data, i * 4) ?? 0
    counts[shades[i]]++
  }
  return { map, shades, ...shadeLevels(counts) }
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

function findRow(map, width, top, bottom, kind, row, name) {
  const found = []
  for (let y = top; y <= bottom; y++) {
    if (map[y * width] === kind) found.push(y)
  }
  if (found.length > 1) throw new Error(`row ${row} has ${found.length} ${name} marker pixels in its left column, and it can only have one`)
  return found[0] ?? null
}

export function scanMask(data, width, height) {
  const { map, shades, layers, index } = classifyAll(data, width, height)
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
      baseline: findRow(map, width, top, bottom, BASELINE, rows.length + 1, "green baseline") ?? bottom,
      topline: findRow(map, width, top, bottom, TOPLINE, rows.length + 1, "blue topline") ?? top,
      cells
    })
  }
  return { rows, layers, isGlyph: (x, y) => map[y * width + x] === GLYPH, isStretch: (x, y) => map[y * width + x] === BASELINE, layerAt: (x, y) => index[shades[y * width + x]] }
}

export function parseMask(data, width, height, order, gap) {
  const characters = Array.from(order)
  const { rows, layers, isGlyph, isStretch, layerAt } = scanMask(data, width, height)
  if (order === DEFAULT_ORDER && rows.reduce((total, row) => total + row.cells.length, 0) === characters.length + 1) characters.push(" ")
  const layered = layers.length > 1
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
      const depths = layered ? new Uint8Array(w * h) : null
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!isGlyph(box.minX + x, box.maxY - y)) continue
          mask[y * w + x] = 1
          if (depths) depths[y * w + x] = layerAt(box.minX + x, box.maxY - y)
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
        ...(depths ? { depths } : {}),
        stretch: stretch.length ? stretch.sort((a, b) => a - b) : null,
        row: rowIndex,
        column
      })
    }
  }
  if (index < characters.length) throw new Error(`mask has ${index} cells but the order lists ${characters.length} characters`)
  const capHeight = capHeights[0]
  if (capHeights.some(value => value !== capHeight)) throw new Error(`rows disagree on cap height: ${capHeights.join(", ")}`)
  return { glyphs: Object.fromEntries(list.map(glyph => [glyph.char, glyph])), list, capHeight, layers: layered ? layers : null }
}

export function solidMask(data, imageWidth, density, x, top, width, height) {
  const mask = new Uint8Array(width * height)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let solid = 0
      for (let j = 0; j < density && !solid; j++) {
        for (let i = 0; i < density && !solid; i++) {
          const column = Math.floor((x + c) * density + i)
          if (column < imageWidth && data[(Math.floor((top + r) * density + j) * imageWidth + column) * 4 + 3] > 127) solid = 1
        }
      }
      mask[(height - 1 - r) * width + c] = solid
    }
  }
  return mask
}
