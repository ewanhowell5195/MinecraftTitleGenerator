import { SHEET_MAX_WIDTH } from "./font.js"

export const EMPTY = [255, 255, 255]
export const GLYPH = [0, 0, 0]
export const GRID = [255, 0, 0]
export const BASELINE = [0, 255, 0]
export const TOPLINE = [0, 0, 255]

export function setPixel({ data, width }, x, y, colour) {
  const at = (y * width + x) * 4
  data[at] = colour[0]
  data[at + 1] = colour[1]
  data[at + 2] = colour[2]
  data[at + 3] = colour[3] ?? 255
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
        for (let c = 0; c < cell.width; c++) if (cell.mask[r * cell.width + c]) setPixel(sheet, x + cell.originX + c, baseline - cell.bottom - r, GLYPH)
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
