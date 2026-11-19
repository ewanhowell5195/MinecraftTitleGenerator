export const SHEET_MAX_WIDTH = 560

const SHEET_GAP = 2

export const EMPTY = [255, 255, 255]
export const GLYPH = [0, 0, 0]
export const GRID = [255, 0, 0]
export const BASELINE = [0, 255, 0]
const TOPLINE = [0, 0, 255]

export function setPixel({ data, width }, x, y, colour) {
  const at = (y * width + x) * 4
  data[at] = colour[0]
  data[at + 1] = colour[1]
  data[at + 2] = colour[2]
  data[at + 3] = colour[3] ?? 255
}

export function depthShade(depth) {
  return Math.round((1 - depth) * 255)
}

function sheetRows(cells, capHeight, { maxWidth = SHEET_MAX_WIDTH, flatWidth = Infinity, keepRows = false } = {}) {
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

function depthColour(layers, layer) {
  const shade = depthShade(layers[layer])
  return [shade, shade, shade]
}

export function drawSheet(cells, capHeight, { width: fixed = null, layers = null, ...limits } = {}) {
  const rows = sheetRows(cells, capHeight, limits)
  const width = fixed ?? Math.max(...rows.map(row => row.width))
  if (rows.some(row => row.width > width)) throw new Error(`a character is too wide for a sheet ${width} pixels wide`)
  const height = rows.reduce((sum, row) => sum + row.top - row.bottom + 1, 1)
  const sheet = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) }
  let y = 0
  for (const row of rows) {
    for (let x = 0; x < width; x++) setPixel(sheet, x, y, GRID)
    const top = y + 1
    const bottom = top + row.top - row.bottom - 1
    const baseline = top + row.top - 1
    const topline = baseline - capHeight + 1
    for (let line = top; line <= bottom; line++) setPixel(sheet, 0, line, line === baseline && line !== bottom ? BASELINE : line === topline && line !== top ? TOPLINE : GRID)
    let x = 1
    for (const cell of row.cells) {
      for (let r = 0; r < cell.height; r++) {
        for (let c = 0; c < cell.width; c++) if (cell.mask[r * cell.width + c]) setPixel(sheet, x + cell.originX + c, baseline - cell.bottom - r, layers && cell.depths ? depthColour(layers, cell.depths[r * cell.width + c]) : GLYPH)
      }
      x += cell.advance
      for (let line = top; line <= bottom; line++) setPixel(sheet, x, line, GRID)
      for (const mark of cell.stretch ?? []) setPixel(sheet, x, baseline - mark, BASELINE)
      x++
    }
    y = bottom + 1
  }
  for (let x = 0; x < width; x++) setPixel(sheet, x, height - 1, GRID)
  return sheet
}

export function sheetLayout(cells, capHeight, depth, fit = false) {
  const positions = new Map()
  const rows = Map.groupBy(cells.filter(glyph => (glyph.source ?? glyph).width).sort((a, b) => a.row - b.row || a.column - b.column), glyph => glyph.row)
  let band = 0
  for (const row of rows.values()) {
    const shown = row.filter(glyph => glyph.height)
    const rise = fit ? shown.length ? Math.max(...shown.map(glyph => glyph.top)) : 0 : Math.max(capHeight, ...row.map(glyph => glyph.top))
    const drop = fit ? shown.length ? Math.min(...shown.map(glyph => glyph.bottom)) : 0 : Math.min(0, ...row.map(glyph => glyph.bottom))
    let x = 0
    for (const glyph of row) {
      positions.set(glyph, { x, top: band + depth + rise - glyph.top, up: band, down: band + depth + rise - drop })
      if (glyph.width) x += glyph.width + SHEET_GAP
    }
    band += depth * 2 + rise - drop + SHEET_GAP
  }
  return positions
}
