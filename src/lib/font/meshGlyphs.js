import { ClipType, EndType, FillRule, JoinType, PolyTreeD, booleanOpDWithPolyTree, inflatePathsD, simplifyPathsD } from "@countertype/clipper2-ts"
import { ShapeUtils, Vector2 } from "three"
import { edgeBands, fillSpans, ringEdges } from "./fontOutline.js"
import { signedArea } from "../../render/vector/polygons.js"

const PRECISION = 4
const ARC_TOLERANCE = 0.05
export const MITER_LIMIT = 4
const SIMPLIFY = 0.01
const CORNER_WINDOW = 2
const CORNER_TURN = Math.PI / 3
const SHARP_INSIDE = Math.PI / 6
const SHORTEST_RUN = 1
const FAR = 1e6

function oriented(ring, clockwise) {
  return signedArea(ring) < 0 === clockwise ? ring : ring.slice().reverse()
}

function toPath(ring) {
  return ring.map(([x, y]) => ({ x, y }))
}

function shapesOf(tree) {
  const shapes = []
  function visit(node) {
    for (let i = 0; i < node.count; i++) {
      const outer = node.child(i)
      const holes = []
      for (let j = 0; j < outer.count; j++) {
        const hole = outer.child(j)
        holes.push(oriented(hole.poly.map(point => [point.x, point.y]), false))
        visit(hole)
      }
      shapes.push({ outer: oriented(outer.poly.map(point => [point.x, point.y]), true), holes })
    }
  }
  visit(tree)
  return shapes.filter(shape => shape.outer.length >= 3)
}

function solve(clipType, subject, clip = null) {
  const tree = new PolyTreeD()
  booleanOpDWithPolyTree(clipType, subject.map(toPath), clip && clip.map(toPath), tree, FillRule.NonZero, PRECISION)
  return shapesOf(tree)
}

function ringsOf(shapes) {
  return shapes.flatMap(shape => [shape.outer].concat(shape.holes))
}

function triangulated({ outer, holes }, clockwise) {
  const points = outer.concat(...holes)
  const triangles = ShapeUtils.triangulateShape(outer.map(([x, y]) => new Vector2(x, y)), holes.map(hole => hole.map(([x, y]) => new Vector2(x, y))))
  return triangles.map(triangle => {
    const corners = triangle.map(index => points[index])
    return signedArea(corners) < 0 === clockwise ? corners : corners.reverse()
  })
}

export function glyphMeshes(outlines) {
  return Object.fromEntries(Object.entries(outlines).map(([char, contours]) => {
    const shapes = solve(ClipType.Union, contours)
    return [char, { shapes, triangles: shapes.flatMap(shape => triangulated(shape, true)) }]
  }))
}

function rowMapping(glyph, original) {
  const rows = original.height
  const map = glyph.arc?.map ?? Array.from({ length: rows }, (_, row) => row)
  const starts = []
  let at = 0
  for (let row = 0; row <= rows; row++) {
    while (at < map.length && map[at] < row) at++
    starts.push(at)
  }
  const slope = row => row < 0 || row >= rows ? 1 : starts[row + 1] - starts[row]
  function lift(y) {
    const s = y - original.bottom
    if (s < 0) return glyph.bottom + starts[0] + s
    if (s >= rows) return glyph.bottom + starts[rows] + s - rows
    const row = Math.floor(s)
    return glyph.bottom + starts[row] + (s - row) * slope(row)
  }
  const breaks = []
  for (let row = 0; row <= rows; row++) {
    if (slope(row) !== slope(row - 1)) breaks.push(original.bottom + row)
  }
  return { lift, breaks, identity: !breaks.length && glyph.bottom + starts[0] === original.bottom }
}

function divided(ring, breaks) {
  if (!breaks.length) return ring
  const out = []
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    out.push(p)
    const crossed = breaks.filter(y => y > Math.min(p[1], q[1]) && y < Math.max(p[1], q[1]))
    if (q[1] < p[1]) crossed.reverse()
    for (const y of crossed) out.push([p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]), y])
  }
  return out
}

function bandTriangles(shapes, breaks) {
  const edges = [-FAR].concat(breaks, FAR)
  const rings = ringsOf(shapes)
  const triangles = []
  for (let i = 0; i < edges.length - 1; i++) {
    const band = [[-FAR, edges[i]], [FAR, edges[i]], [FAR, edges[i + 1]], [-FAR, edges[i + 1]]]
    for (const shape of solve(ClipType.Intersection, rings, [band])) triangles.push(...triangulated(shape, true))
  }
  return triangles
}

function wall(p, q, zFront, zBack, top, bottom, reach) {
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  if (!dx && !dy) return null
  const out = [-dy, dx]
  const kind = out[1] >= Math.abs(out[0]) ? "top" : out[1] <= -Math.abs(out[0]) ? "bottom" : "side"
  const points = [[p[0], p[1], zFront], [p[0], p[1], zBack], [q[0], q[1], zBack], [q[0], q[1], zFront]]
  if (kind === "side") return { points, kind, name: out[0] < 0 ? "west" : "east", internal: false, mesh: true }
  const internal = kind === "top" ? Math.min(p[1], q[1]) < top - reach : Math.max(p[1], q[1]) > bottom + reach
  return { points, kind, name: kind === "top" ? "up" : "down", internal, mesh: true }
}

function liftedRings(shapes, { lift, breaks }, x = 0) {
  return ringsOf(shapes).map(ring => divided(ring, breaks).map(([px, py]) => [x + px, lift(py)]))
}

export function meshFaces(mesh, glyph, original, x, depth, reach) {
  const mapping = rowMapping(glyph, original)
  const place = ([px, py]) => [x + px, mapping.lift(py)]
  const triangles = mapping.identity ? mesh.triangles : bandTriangles(mesh.shapes, mapping.breaks)
  const rings = liftedRings(mesh.shapes, mapping, x)
  const zFront = -depth / 2
  const zBack = depth / 2
  const top = glyph.bottom + glyph.height
  const faces = []
  for (const triangle of triangles) {
    const corners = triangle.map(place)
    faces.push({ points: corners.map(([px, py]) => [px, py, zFront]), kind: "front", name: "front", internal: false, mesh: true })
    faces.push({ points: corners.slice().reverse().map(([px, py]) => [px, py, zBack]), kind: "back", name: "back", internal: false, mesh: true })
  }
  for (const ring of rings) {
    let last = null
    for (let i = 0; i < ring.length; i++) {
      const face = wall(ring[i], ring[(i + 1) % ring.length], zFront, zBack, top, glyph.bottom, reach)
      if (!face) continue
      face.run = last && last.kind === face.kind && last.name === face.name && last.internal === face.internal ? last.run : {}
      faces.push(face)
      last = face
    }
  }
  return { faces, rings }
}

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
  return { distance: out, facing }
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

export function fineMasks(mesh, glyph, original) {
  const masks = new Map()
  const distances = new Map()
  let rings = null
  const lifted = () => rings ??= liftedRings(mesh.shapes, rowMapping(glyph, original))
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

function grown(rings, [sx, sy], [rx, ry]) {
  const normal = solve(ClipType.Union, rings.map(ring => ring.map(([px, py]) => [px * sx / rx, py * sy / ry])))
  const paths = ringsOf(normal).map(ring => ring.slice().reverse())
  const inflated = inflatePathsD(simplifyPathsD(paths.map(toPath), SIMPLIFY, true), 1, JoinType.Miter, EndType.Polygon, MITER_LIMIT, PRECISION, ARC_TOLERANCE)
  return solve(ClipType.Union, inflated.map(path => path.map(point => [point.x * rx, point.y * ry])))
}

function prism(shapes, z, turn) {
  const positions = []
  const sizes = []
  const push = point => positions.push(...(turn ? turn(point) : point))
  for (const shape of shapes) {
    for (const triangle of triangulated(shape, true)) {
      for (const [px, py] of triangle) push([px, py, -z])
      for (const [px, py] of triangle.slice().reverse()) push([px, py, z])
      sizes.push(3, 3)
    }
    for (const ring of [shape.outer].concat(shape.holes)) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        const quad = [[p[0], p[1], -z], [p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], -z]]
        for (const index of [0, 1, 2, 0, 2, 3]) push(quad[index])
        sizes.push(6)
      }
    }
  }
  return { positions, sizes }
}

export function outlineShell(groups, scale, radius, z) {
  let positions = []
  let sizes = []
  let shapes = []
  for (const { rings, turn } of groups) {
    const shell = grown(rings, scale, radius)
    const solid = prism(shell, z, turn)
    positions = positions.concat(solid.positions)
    sizes = sizes.concat(solid.sizes)
    if (!turn) shapes = shapes.concat(shell)
  }
  return { positions, sizes, shapes }
}

export function holeFill(groups, z) {
  const rings = groups.flatMap(group => group.shapes ? ringsOf(group.shapes) : group.rects.map(([x0, y0, x1, y1]) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]]))
  const positions = []
  for (const shape of solve(ClipType.Union, rings)) {
    for (const hole of shape.holes) {
      for (const triangle of triangulated({ outer: hole, holes: [] }, false)) {
        for (const [px, py] of triangle) positions.push(px, py, z)
      }
    }
  }
  return positions
}
