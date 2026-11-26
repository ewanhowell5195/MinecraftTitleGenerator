import { ClipType, EndType, JoinType, inflatePathsD, simplifyPathsD } from "./clipper.js"
import { ARC_TOLERANCE, MITER_LIMIT, PRECISION, SIMPLIFY, ringsOf, solve, toPath, triangulated } from "./clip.js"

function grown(rings, [sx, sy], [rx, ry]) {
  const normal = solve(ClipType.Union, rings.map(ring => ring.map(([px, py]) => [px * sx / rx, py * sy / ry])))
  const paths = ringsOf(normal).map(ring => ring.slice().reverse())
  const inflated = inflatePathsD(simplifyPathsD(paths.map(toPath), SIMPLIFY), 1, JoinType.Miter, EndType.Polygon, MITER_LIMIT, PRECISION, ARC_TOLERANCE)
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
