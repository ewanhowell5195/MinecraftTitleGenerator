import { ClipType, FillRule, PolyTreeD, booleanOpDWithPolyTree, toPaths } from "../geometry/clipper.js"
import { inkBox } from "./silhouette.js"

const THRESHOLD = 128
const SUBDIVISIONS = 4
const TOLERANCE = 0.1
const SMALLEST = 0.25
const PRECISION = 4

const SEGMENTS = {
  1: [["left", "bottom"]],
  2: [["bottom", "right"]],
  3: [["left", "right"]],
  4: [["top", "right"]],
  6: [["top", "bottom"]],
  7: [["left", "top"]],
  8: [["left", "top"]],
  9: [["top", "bottom"]],
  11: [["top", "right"]],
  12: [["left", "right"]],
  13: [["bottom", "right"]],
  14: [["left", "bottom"]]
}

const SADDLES = {
  5: { joined: [["left", "top"], ["bottom", "right"]], apart: [["top", "right"], ["left", "bottom"]] },
  10: { joined: [["top", "right"], ["left", "bottom"]], apart: [["left", "top"], ["bottom", "right"]] }
}

function alphaField({ image, bounds }, step) {
  const columns = Math.ceil(bounds.width / step) + 2
  const rows = Math.ceil(bounds.height / step) + 2
  const values = new Float32Array(columns * rows)
  for (let row = 1; row < rows - 1; row++) {
    for (let column = 1; column < columns - 1; column++) {
      let sum = 0
      let count = 0
      for (let y = (row - 1) * step; y < Math.min(row * step, bounds.height); y++) {
        for (let x = (column - 1) * step; x < Math.min(column * step, bounds.width); x++) {
          sum += image.data[((bounds.top + y) * image.width + bounds.left + x) * 4 + 3]
          count++
        }
      }
      values[row * columns + column] = sum / count
    }
  }
  return { columns, rows, values, step }
}

function crossings({ columns, rows, values, step }) {
  const value = (column, row) => values[row * columns + column]
  const centre = index => (index - 0.5) * step
  function point(fromColumn, fromRow, toColumn, toRow) {
    const a = value(fromColumn, fromRow)
    const b = value(toColumn, toRow)
    const t = (THRESHOLD - a) / (b - a)
    return [centre(fromColumn + (toColumn - fromColumn) * t), centre(fromRow + (toRow - fromRow) * t)]
  }
  const points = new Map()
  const links = new Map()
  function edge(column, row, side) {
    const key = side === "top" ? `h${column},${row}` : side === "bottom" ? `h${column},${row + 1}` : side === "left" ? `v${column},${row}` : `v${column + 1},${row}`
    if (!points.has(key)) points.set(key, side === "top" ? point(column, row, column + 1, row) : side === "bottom" ? point(column, row + 1, column + 1, row + 1) : side === "left" ? point(column, row, column, row + 1) : point(column + 1, row, column + 1, row + 1))
    return key
  }
  function link(a, b) {
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!links.has(from)) links.set(from, [])
      links.get(from).push(to)
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const corners = [value(column, row), value(column + 1, row), value(column + 1, row + 1), value(column, row + 1)]
      const index = corners.reduce((sum, corner, at) => corner >= THRESHOLD ? sum | 8 >> at : sum, 0)
      const saddle = SADDLES[index]
      const pairs = saddle ? corners.reduce((sum, corner) => sum + corner, 0) / 4 >= THRESHOLD ? saddle.joined : saddle.apart : SEGMENTS[index] ?? []
      for (const [a, b] of pairs) link(edge(column, row, a), edge(column, row, b))
    }
  }
  return { points, links }
}

function loopsOf({ points, links }) {
  const seen = new Set()
  const loops = []
  for (const start of links.keys()) {
    if (seen.has(start)) continue
    const loop = []
    let previous = null
    let at = start
    while (at && !seen.has(at)) {
      seen.add(at)
      loop.push(points.get(at))
      const next = links.get(at).find(key => key !== previous && !seen.has(key))
      previous = at
      at = next
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

function distance([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0
  return Math.hypot(x - ax - t * dx, y - ay - t * dy)
}

function simplified(points, tolerance) {
  if (points.length < 3) return points
  let far = 0
  let index = 0
  for (let at = 1; at < points.length - 1; at++) {
    const gap = distance(points[at], points[0], points.at(-1))
    if (gap > far) {
      far = gap
      index = at
    }
  }
  if (far <= tolerance) return [points[0], points.at(-1)]
  return simplified(points.slice(0, index + 1), tolerance).slice(0, -1).concat(simplified(points.slice(index), tolerance))
}

function simplifiedLoop(loop, tolerance) {
  let split = 0
  let far = 0
  for (const [at, point] of loop.entries()) {
    const gap = Math.hypot(point[0] - loop[0][0], point[1] - loop[0][1])
    if (gap > far) {
      far = gap
      split = at
    }
  }
  const first = simplified(loop.slice(0, split + 1), tolerance)
  const second = simplified(loop.slice(split).concat([loop[0]]), tolerance)
  return first.slice(0, -1).concat(second.slice(0, -1))
}

function area(ring) {
  let sum = 0
  for (const [at, [x, y]] of ring.entries()) {
    const [nx, ny] = ring[(at + 1) % ring.length]
    sum += x * ny - nx * y
  }
  return sum / 2
}

function resolved(rings) {
  const tree = new PolyTreeD()
  booleanOpDWithPolyTree(ClipType.Union, toPaths(rings), null, tree, FillRule.EvenOdd, PRECISION)
  const contours = []
  function visit(node) {
    for (let at = 0; at < node.count; at++) {
      const child = node.child(at)
      contours.push(child.poly.map(point => [point.x, point.y]))
      visit(child)
    }
  }
  visit(tree)
  return contours.filter(ring => ring.length >= 3)
}

export function traceSilhouette(shape) {
  const { scale, height, lift } = shape
  const { left } = inkBox(shape)
  const step = Math.max(1, Math.round(scale / SUBDIVISIONS))
  const units = ([x, y]) => [x / scale - left, height - (y + lift) / scale]
  const rings = loopsOf(crossings(alphaField(shape, step))).map(loop => simplifiedLoop(loop.map(units), TOLERANCE)).filter(ring => ring.length >= 3 && Math.abs(area(ring)) >= SMALLEST)
  return resolved(rings)
}
