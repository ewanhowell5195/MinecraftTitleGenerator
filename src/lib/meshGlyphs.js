import { ClipType, EndType, FillRule, JoinType, PolyTreeD, booleanOpDWithPolyTree, inflatePathsD } from "@countertype/clipper2-ts"
import { ShapeUtils, Vector2 } from "three"

const PRECISION = 4
const ARC_TOLERANCE = 0.05
const EDGE_SHARE = 0.1
const FAR = 1e6

function signedArea(ring) {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % ring.length]
    sum += x0 * y1 - x1 * y0
  }
  return sum / 2
}

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

export function meshFaces(mesh, glyph, original, x, depth, capHeight) {
  const { lift, breaks, identity } = rowMapping(glyph, original)
  const place = ([px, py]) => [x + px, lift(py)]
  const triangles = identity ? mesh.triangles : bandTriangles(mesh.shapes, breaks)
  const rings = ringsOf(mesh.shapes).map(ring => divided(ring, breaks).map(place))
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
      const face = wall(ring[i], ring[(i + 1) % ring.length], zFront, zBack, top, glyph.bottom, capHeight * EDGE_SHARE)
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
  const edges = rings.flatMap(ring => ring.map((point, index) => [point, ring[(index + 1) % ring.length]])).filter(([p, q]) => p[1] !== q[1])
  for (let row = 0; row < rows; row++) {
    const y = bottom + (row + 0.5) / scale
    const crossings = []
    for (const [p, q] of edges) {
      if (p[1] <= y === q[1] <= y) continue
      crossings.push([p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]), q[1] > p[1] ? 1 : -1])
    }
    crossings.sort((a, b) => a[0] - b[0])
    let winding = 0
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i][1]
      if (!winding) continue
      const from = Math.max(0, Math.ceil(crossings[i][0] * scale - 0.5))
      const to = Math.min(columns, Math.ceil(crossings[i + 1][0] * scale - 0.5))
      if (to > from) mask.fill(1, row * columns + from, row * columns + to)
    }
  }
  return mask
}

export function fineMasks(mesh, glyph, original) {
  const masks = new Map()
  return scale => {
    if (!masks.has(scale)) {
      const { lift, breaks } = rowMapping(glyph, original)
      const rings = ringsOf(mesh.shapes).map(ring => divided(ring, breaks).map(([px, py]) => [px, lift(py)]))
      masks.set(scale, scanFill(rings, glyph.width, glyph.height, scale, glyph.bottom))
    }
    return masks.get(scale)
  }
}

function grown(rings, [sx, sy], [rx, ry]) {
  const normal = solve(ClipType.Union, rings.map(ring => ring.map(([px, py]) => [px * sx / rx, py * sy / ry])))
  const paths = ringsOf(normal).map(ring => ring.slice().reverse())
  const inflated = inflatePathsD(paths.map(toPath), 1, JoinType.Round, EndType.Polygon, 2, PRECISION, ARC_TOLERANCE)
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
  const positions = []
  const sizes = []
  const shapes = []
  for (const { rings, turn } of groups) {
    const shell = grown(rings, scale, radius)
    const solid = prism(shell, z, turn)
    positions.push(...solid.positions)
    sizes.push(...solid.sizes)
    if (!turn) shapes.push(...shell)
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
