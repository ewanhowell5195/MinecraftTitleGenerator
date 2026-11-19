import { ClipType, FillRule, PolyTreeD, booleanOpDWithPolyTree } from "@countertype/clipper2-ts"
import { ShapeUtils, Vector2 } from "three"
import { signedArea } from "../core/maths.js"

export const PRECISION = 4
export const ARC_TOLERANCE = 0.05
export const MITER_LIMIT = 4
export const SIMPLIFY = 0.01

function oriented(ring, clockwise) {
  return signedArea(ring) < 0 === clockwise ? ring : ring.slice().reverse()
}

export function toPath(ring) {
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

export function solve(clipType, subject, clip = null) {
  const tree = new PolyTreeD()
  booleanOpDWithPolyTree(clipType, subject.map(toPath), clip && clip.map(toPath), tree, FillRule.NonZero, PRECISION)
  return shapesOf(tree)
}

export function ringsOf(shapes) {
  return shapes.flatMap(shape => [shape.outer].concat(shape.holes))
}

export function triangulated({ outer, holes }, clockwise) {
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
