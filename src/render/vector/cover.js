import { signedArea } from "../../lib/core/maths.js"
import { withoutCollinear } from "./union.js"

const COVER_SIDE = 4096
const COVER_LOOKAHEAD = 16

export function coverOf(width, height) {
  const cell = Math.max(width, height, 1) * 100 / COVER_SIDE
  const columns = Math.ceil(width * 100 / cell) + 1
  const rows = Math.ceil(height * 100 / cell) + 1
  return { cell, columns, rows, cells: new Uint8Array(columns * rows) }
}

function everySpanInside({ cell, columns, rows }, polygons, check) {
  const edges = []
  for (const polygon of polygons) {
    for (const [index, [ax, ay]] of polygon.entries()) {
      const [bx, by] = polygon[(index + 1) % polygon.length]
      if (ay !== by) edges.push({ ax, ay, bx, by, low: Math.min(ay, by), high: Math.max(ay, by) })
    }
  }
  if (!edges.length) return true
  edges.sort((a, b) => a.low - b.low)
  const highest = edges.reduce((most, edge) => Math.max(most, edge.high), -Infinity)
  let active = []
  let next = 0
  for (let row = Math.max(0, Math.floor(edges[0].low / cell)); row <= Math.min(rows - 1, Math.ceil(highest / cell)); row++) {
    const y = (row + 0.5) * cell
    while (next < edges.length && edges[next].low <= y) active.push(edges[next++])
    active = active.filter(edge => edge.high > y)
    const crossings = active.map(({ ax, ay, bx, by }) => ({ x: ax + (y - ay) / (by - ay) * (bx - ax), winding: by > ay ? 1 : -1 })).sort((a, b) => a.x - b.x)
    let winding = 0
    for (const [index, crossing] of crossings.entries()) {
      winding += crossing.winding
      if (!winding || index === crossings.length - 1) continue
      if (!check(row, Math.max(0, Math.ceil(crossing.x / cell - 0.5)), Math.min(columns - 1, Math.ceil(crossings[index + 1].x / cell - 0.5) - 1))) return false
    }
  }
  return true
}

function everyCellInside(cover, polygons, check) {
  return everySpanInside(cover, polygons, (row, first, last) => {
    for (let column = first; column <= last; column++) {
      if (!check(column, row)) return false
    }
    return true
  })
}

export function addToCover(cover, loops) {
  const { columns, cells } = cover
  everySpanInside(cover, loops, (row, first, last) => {
    if (first <= last) cells.fill(1, row * columns + first, row * columns + last + 1)
    return true
  })
}

export function visibleLoops(loops, cover) {
  const { cell, columns, rows, cells } = cover
  function coveredCell(column, row) {
    if (column < 1 || row < 1 || column >= columns - 1 || row >= rows - 1) return false
    for (let y = row - 1; y <= row + 1; y++) {
      for (let x = column - 1; x <= column + 1; x++) {
        if (!cells[y * columns + x]) return false
      }
    }
    return true
  }
  function coveredPoint(x, y) {
    const column = Math.floor(x / cell)
    const row = Math.floor(y / cell)
    return column >= 0 && row >= 0 && column < columns && row < rows && coveredCell(column, row)
  }
  function coveredLine([ax, ay], [bx, by]) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 2)) || 1
    for (let step = 0; step <= steps; step++) {
      if (!coveredPoint(ax + (bx - ax) * step / steps, ay + (by - ay) * step / steps)) return false
    }
    return true
  }
  function simplifiedRun(run) {
    const kept = [run[0]]
    let from = 0
    while (from < run.length - 1) {
      let best = from + 1
      let misses = 0
      for (let to = from + 2; to < run.length && misses < COVER_LOOKAHEAD; to++) {
        if (coveredLine(run[from], run[to]) && everyCellInside(cover, [run.slice(from, to + 1)], coveredCell)) {
          best = to
          misses = 0
        } else misses++
      }
      kept.push(run[best])
      from = best
    }
    return kept
  }
  const result = []
  for (const loop of loops) {
    if (signedArea(loop) < 0 && everyCellInside(cover, [loop], (column, row) => cells[row * columns + column] === 1)) continue
    const size = loop.length
    const hidden = loop.map((point, index) => coveredLine(point, loop[(index + 1) % size]))
    if (!hidden.includes(true)) {
      result.push(loop)
      continue
    }
    if (!hidden.includes(false)) {
      if (everyCellInside(cover, [loop], coveredCell)) continue
      const closed = simplifiedRun(loop.concat([loop[0]])).slice(0, -1)
      result.push(closed.length >= 3 ? closed : loop)
      continue
    }
    const start = hidden.findIndex((value, index) => value && !hidden[(index + size - 1) % size])
    const simplified = []
    let index = 0
    while (index < size) {
      const at = (start + index) % size
      if (!hidden[at]) {
        simplified.push(loop[at])
        index++
        continue
      }
      const run = [loop[at]]
      while (index < size && hidden[(start + index) % size]) {
        index++
        run.push(loop[(start + index) % size])
      }
      simplified.push(...simplifiedRun(run).slice(0, -1))
    }
    result.push(withoutCollinear(simplified))
  }
  return result
}
