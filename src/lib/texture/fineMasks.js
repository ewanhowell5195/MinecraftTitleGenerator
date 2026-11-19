import { edgeBands, fillSpans, ringEdges } from "../font/fontOutline.js"
import { signedArea } from "../core/maths.js"
import { MITER_LIMIT } from "../geometry/clip.js"
import { liftedRings, ringWalls, rowMapping } from "../geometry/meshFaces.js"

const CORNER_WINDOW = 2
const CORNER_TURN = Math.PI / 3
const SHARP_INSIDE = Math.PI / 6
const SHORTEST_RUN = 1

function scanFill(rings, width, height, scale, bottom) {
  const columns = width * scale
  const rows = height * scale
  const mask = new Uint8Array(columns * rows)
  const near = edgeBands(ringEdges(rings), 1 / scale)
  for (let row = 0; row < rows; row++) {
    const y = bottom + (row + 0.5) / scale
    for (const [left, right] of fillSpans(near(y), y, scale)) {
      const from = Math.max(0, left)
      const to = Math.min(columns, right)
      if (to > from) mask.fill(1, row * columns + from, row * columns + to)
    }
  }
  return mask
}

function edgeDistances(rings, holes, solid, width, height, scale, bottom, reach) {
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows).fill(reach)
  const facing = new Float32Array(columns * rows * 2)
  for (const [ax, ay, bx, by, solidLeft] of rings.flatMap((ring, index) => ringEdges([ring]).map(edge => edge.concat(signedArea(ring) > 0 !== holes[index])))) {
    const x0 = ax * scale
    const y0 = (ay - bottom) * scale
    const dx = bx * scale - x0
    const dy = (by - bottom) * scale - y0
    const length = dx * dx + dy * dy
    const normal = Math.sqrt(length) || 1
    const nx = (solidLeft ? dy : -dy) / normal
    const ny = (solidLeft ? -dx : dx) / normal
    const left = Math.max(0, Math.floor(Math.min(x0, x0 + dx) - reach))
    const right = Math.min(columns - 1, Math.ceil(Math.max(x0, x0 + dx) + reach))
    const low = Math.max(0, Math.floor(Math.min(y0, y0 + dy) - reach))
    const high = Math.min(rows - 1, Math.ceil(Math.max(y0, y0 + dy) + reach))
    for (let row = low; row <= high; row++) {
      const py = row + 0.5 - y0
      for (let column = left; column <= right; column++) {
        const px = column + 0.5 - x0
        const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0
        const ox = px - t * dx
        const oy = py - t * dy
        const distance = Math.hypot(ox, oy)
        const index = row * columns + column
        if (distance < out[index]) {
          out[index] = distance
          const away = distance > 1e-6 ? (solid[index] ? -1 : 1) / distance : 0
          facing[index * 2] = away ? ox * away : nx
          facing[index * 2 + 1] = away ? oy * away : ny
        }
      }
    }
  }
  for (const [index, ring] of rings.entries()) mitreCorners(ring, signedArea(ring) > 0 !== holes[index], solid, out, facing, columns, rows, scale, bottom, reach)
  return { distance: out, facing }
}

function mitreCorners(ring, solidLeft, solid, out, facing, columns, rows, scale, bottom, reach) {
  const points = ring.map(([x, y]) => [x * scale, (y - bottom) * scale])
  const count = points.length
  const extent = reach * MITER_LIMIT
  for (let at = 0; at < count; at++) {
    const [vx, vy] = points[at]
    const [px, py] = points[(at - 1 + count) % count]
    const [qx, qy] = points[(at + 1) % count]
    const [ix, iy] = [vx - px, vy - py]
    const [ox, oy] = [qx - vx, qy - vy]
    const turn = ix * oy - iy * ox
    if (!(solidLeft ? turn < 0 : turn > 0)) continue
    const inLength = Math.hypot(ix, iy)
    const outLength = Math.hypot(ox, oy)
    const normals = [[ix, iy, inLength], [ox, oy, outLength]].map(([x, y, size]) => solidLeft ? [-y / size, x / size] : [y / size, -x / size])
    for (let row = Math.max(0, Math.floor(vy - extent)); row <= Math.min(rows - 1, Math.ceil(vy + extent)); row++) {
      for (let column = Math.max(0, Math.floor(vx - extent)); column <= Math.min(columns - 1, Math.ceil(vx + extent)); column++) {
        const index = row * columns + column
        if (!solid[index]) continue
        const dx = column + 0.5 - vx
        const dy = row + 0.5 - vy
        if (dx * ix + dy * iy <= 0 || dx * ox + dy * oy >= 0) continue
        const sides = normals.map(([nx, ny]) => dx * nx + dy * ny)
        const side = sides[0] >= sides[1] ? 0 : 1
        const distance = Math.max(sides[side], Math.hypot(dx, dy) / MITER_LIMIT)
        if (distance >= out[index]) continue
        out[index] = distance
        facing[index * 2] = -normals[side][0]
        facing[index * 2 + 1] = -normals[side][1]
      }
    }
  }
}

function cornerEdges(ring, solidLeft) {
  const count = ring.length
  const inward = ring.map((point, index) => {
    const before = ring[(index - 1 + count) % count]
    const after = ring[(index + 1) % count]
    const turn = Math.atan2((point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0]), (point[0] - before[0]) * (after[0] - point[0]) + (point[1] - before[1]) * (after[1] - point[1]))
    return (solidLeft ? -turn : turn) > SHARP_INSIDE
  })
  return ring.map((point, index) => point.concat(ring[(index + 1) % count], solidLeft, inward[index], inward[(index + 1) % count]))
}

function longRuns(edges, [tx, ty], least) {
  const facing = edges.map(([ax, ay, bx, by, solidLeft]) => {
    const size = Math.hypot(bx - ax, by - ay)
    return size > 0 && ((solidLeft ? by - ay : ay - by) * tx + (solidLeft ? ax - bx : bx - ax) * ty) / size >= least
  })
  const kept = facing.slice()
  const count = edges.length
  const start = facing.findIndex(value => !value)
  if (start < 0) return kept
  for (let step = 1; step <= count; step++) {
    const index = (start + step) % count
    if (!facing[index] || facing[(index - 1 + count) % count]) continue
    let length = 0
    const run = []
    for (let at = index; facing[at] && run.length < count; at = (at + 1) % count) {
      run.push(at)
      length += Math.hypot(edges[at][2] - edges[at][0], edges[at][3] - edges[at][1])
    }
    if (length < SHORTEST_RUN) for (const at of run) kept[at] = false
  }
  return kept
}

function facingScores(rings, holes, solid, width, height, scale, bottom, [tx, ty], least, reach, score) {
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  const edges = rings.flatMap((ring, index) => {
    const own = cornerEdges(ring, signedArea(ring) > 0 !== holes[index])
    const kept = longRuns(own, [tx, ty], least)
    return own.filter((_, at) => kept[at])
  })
  for (const [ax, ay, bx, by, solidLeft, sharpStart, sharpEnd] of edges) {
    const x0 = ax * scale
    const y0 = (ay - bottom) * scale
    const dx = bx * scale - x0
    const dy = (by - bottom) * scale - y0
    const length = dx * dx + dy * dy
    if (!length) continue
    const size = Math.sqrt(length)
    const nx = (solidLeft ? dy : -dy) / size
    const ny = (solidLeft ? -dx : dx) / size
    const toward = nx * tx + ny * ty
    if (toward <= 0) continue
    const left = Math.max(0, Math.floor(Math.min(x0, x0 + dx) - reach))
    const right = Math.min(columns - 1, Math.ceil(Math.max(x0, x0 + dx) + reach))
    const low = Math.max(0, Math.floor(Math.min(y0, y0 + dy) - reach))
    const high = Math.min(rows - 1, Math.ceil(Math.max(y0, y0 + dy) + reach))
    for (let row = low; row <= high; row++) {
      const py = row + 0.5 - y0
      for (let column = left; column <= right; column++) {
        const px = column + 0.5 - x0
        const along = (px * dx + py * dy) / length
        if (along < 0 && sharpStart || along > 1 && sharpEnd) continue
        const t = Math.max(0, Math.min(1, along))
        const ox = px - t * dx
        const oy = py - t * dy
        const index = row * columns + column
        if (!solid[index] || ox * tx + oy * ty > 0) continue
        out[index] = Math.max(out[index], score(Math.hypot(ox, oy), toward))
      }
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (!out[index]) continue
      let leaves = false
      for (let step = 1; step <= reach * 2 && !leaves; step++) {
        const x = column + tx * step
        const y = row + ty * step
        leaves = x < 0 || y < 0 || x >= columns || y >= rows || !solid[y * columns + x]
      }
      if (!leaves) out[index] = 0
    }
  }
  return out
}

function wallSpans(rings, kind, top, bottom, reach) {
  const spans = new Map()
  for (const ring of rings) {
    for (const face of ringWalls(ring, 0, 0, top, bottom, reach)) {
      if (face.kind !== kind || face.internal) continue
      const xs = face.points.map(point => point[0])
      const span = spans.get(face.run) ?? [Infinity, -Infinity]
      spans.set(face.run, [Math.min(span[0], ...xs), Math.max(span[1], ...xs)])
    }
  }
  return Array.from(spans.values()).sort((a, b) => a[0] - b[0])
}

export function fineMasks(mesh, glyph, original, reach) {
  const masks = new Map()
  const distances = new Map()
  let rings = null
  const lifted = () => rings ??= liftedRings(mesh.shapes, rowMapping(glyph, original), glyph.inkShift ?? 0)
  function fine(scale) {
    if (!masks.has(scale)) masks.set(scale, scanFill(lifted(), glyph.width, glyph.height, scale, glyph.bottom))
    return masks.get(scale)
  }
  const holes = mesh.shapes.flatMap(shape => [false].concat(shape.holes.map(() => true)))
  function nearest(scale, reach) {
    const key = `${scale}:${reach}`
    if (!distances.has(key)) distances.set(key, edgeDistances(lifted(), holes, fine(scale), glyph.width, glyph.height, scale, glyph.bottom, reach))
    return distances.get(key)
  }
  fine.distance = (scale, reach) => nearest(scale, reach).distance
  fine.facing = (scale, reach) => nearest(scale, reach).facing
  let corners = null
  fine.corners = () => corners ??= outlineCorners(lifted(), holes)
  const spans = {}
  fine.edgeRuns = side => spans[side] ??= wallSpans(lifted(), side === "up" ? "top" : "bottom", glyph.bottom + glyph.height, glyph.bottom, reach)
  fine.toward = (scale, dx, dy, least, reach, score) => facingScores(lifted(), holes, fine(scale), glyph.width, glyph.height, scale, glyph.bottom, [dx, dy], least, reach, score)
  return fine
}

function ringCorners(points, solidLeft) {
  const ring = points.filter((point, index) => {
    const next = points[(index + 1) % points.length]
    return point[0] !== next[0] || point[1] !== next[1]
  })
  const count = ring.length
  if (count < 3) return []
  const at = index => ring[(index % count + count) % count]
  const steps = ring.map((point, index) => Math.hypot(at(index + 1)[0] - point[0], at(index + 1)[1] - point[1]))
  const turns = ring.map((point, index) => {
    const before = at(index - 1)
    const after = at(index + 1)
    let turn = Math.atan2(after[1] - point[1], after[0] - point[0]) - Math.atan2(point[1] - before[1], point[0] - before[0])
    if (turn > Math.PI) turn -= 2 * Math.PI
    if (turn <= -Math.PI) turn += 2 * Math.PI
    return solidLeft ? turn : -turn
  })
  function walked(index, direction, length) {
    let point = ring[index]
    let left = length
    for (let step = 0; step < count; step++) {
      const from = index + step * direction
      const span = steps[((direction > 0 ? from : from - 1) % count + count) % count]
      const next = at(from + direction)
      if (span >= left) return [point[0] + (next[0] - point[0]) * left / span, point[1] + (next[1] - point[1]) * left / span]
      left -= span
      point = next
    }
    return point
  }
  function windowTurn(index) {
    let sum = turns[index]
    for (const direction of [-1, 1]) {
      let length = 0
      for (let step = 1; step < count; step++) {
        length += steps[((direction > 0 ? index + step - 1 : index - step) % count + count) % count]
        if (length > CORNER_WINDOW / 2) break
        sum += turns[((index + step * direction) % count + count) % count]
      }
    }
    return sum
  }
  const sums = ring.map((_, index) => windowTurn(index))
  const corners = []
  for (let index = 0; index < count; index++) {
    if (sums[index] < CORNER_TURN) continue
    let peak = true
    let length = 0
    for (let step = 1; step < count && peak; step++) {
      length += steps[(index + step - 1) % count]
      if (length > CORNER_WINDOW) break
      if (sums[(index + step) % count] > sums[index]) peak = false
    }
    length = 0
    for (let step = 1; step < count && peak; step++) {
      length += steps[((index - step) % count + count) % count]
      if (length > CORNER_WINDOW) break
      if (sums[((index - step) % count + count) % count] >= sums[index]) peak = false
    }
    if (!peak) continue
    const [x, y] = ring[index]
    const [bx, by] = walked(index, -1, CORNER_WINDOW)
    const [ax, ay] = walked(index, 1, CORNER_WINDOW)
    const back = Math.hypot(bx - x, by - y)
    const ahead = Math.hypot(ax - x, ay - y)
    if (!back || !ahead) continue
    const u = [(bx - x) / back, (by - y) / back]
    const w = [(ax - x) / ahead, (ay - y) / ahead]
    const middle = Math.hypot(u[0] + w[0], u[1] + w[1])
    if (!middle) continue
    corners.push({ x, y, inward: [(u[0] + w[0]) / middle, (u[1] + w[1]) / middle], angle: Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]))) })
  }
  return corners
}

function outlineCorners(rings, holes) {
  return rings.flatMap((ring, index) => ringCorners(ring, signedArea(ring) > 0 !== holes[index]))
}
