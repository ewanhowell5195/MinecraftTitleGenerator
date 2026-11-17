import { inRows, rowOfY, shapeOf, yOfRow } from "./glyph.js"

export function paint(glyph, cells, value) {
  const rows = glyph.rows.slice()
  const touched = new Map()
  for (const { x, row } of cells) {
    if (row < 0 || row >= rows.length || x < 0 || x >= rows[row].length) continue
    if (!touched.has(row)) touched.set(row, Array.from(rows[row]))
    touched.get(row)[x] = typeof value === "string" ? value : value ? "1" : "0"
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

export function mirroredCells(glyph, cells) {
  const width = glyph.rows[0]?.length ?? 0
  return cells.concat(cells.map(({ x, row }) => ({ x: width - 1 - x, row })))
}

export function setStretchRange(font, glyph, from, to, value) {
  let next = glyph
  for (let row = Math.min(from, to); row <= Math.max(from, to); row++) next = setStretch(font, next, row, value)
  return next
}

export function setStretch(font, glyph, row, value) {
  const { by } = blockIndex(font, glyph, 0, row)
  const rows = Array.from({ length: font.grid }, (_, index) => by * font.grid + index).filter(inRows(shapeOf(font, glyph)))
  const stretch = value ? Array.from(new Set(glyph.stretch.concat(rows))) : glyph.stretch.filter(y => !rows.includes(y))
  return { ...glyph, stretch: stretch.sort((a, b) => a - b) }
}
