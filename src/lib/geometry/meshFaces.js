import { ClipType } from "@countertype/clipper2-ts"
import { ringsOf, solve, triangulated } from "./clip.js"

const FAR = 1e6

export function rowMapping(glyph, original) {
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

export function ringWalls(ring, zFront, zBack, top, bottom, reach) {
  const walls = []
  let last = null
  for (let i = 0; i < ring.length; i++) {
    const face = wall(ring[i], ring[(i + 1) % ring.length], zFront, zBack, top, bottom, reach)
    if (!face) continue
    face.run = last && last.kind === face.kind && last.name === face.name && last.internal === face.internal ? last.run : {}
    walls.push(face)
    last = face
  }
  return walls
}

export function liftedRings(shapes, { lift, breaks }, x = 0) {
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
  for (const ring of rings) faces.push(...ringWalls(ring, zFront, zBack, top, glyph.bottom, reach))
  return { faces, rings }
}
