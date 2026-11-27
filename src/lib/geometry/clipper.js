import { ClipType, FillRule, InternalClipper, PathType } from "@countertype/clipper2-ts/dist/Core.js"
import { Clipper, Clipper64, ClipperD, PolyTreeD } from "@countertype/clipper2-ts/dist/Engine.js"
import { ClipperOffset, EndType, JoinType } from "@countertype/clipper2-ts/dist/Offset.js"

export { ClipType, EndType, FillRule, JoinType, PolyTreeD }

export function toPaths(polygons) {
  return polygons.map(polygon => polygon.map(([x, y]) => ({ x, y })))
}

export function fromPaths(paths) {
  return paths.map(path => path.map(({ x, y }) => [x, y]))
}

function booleanOp(clipType, subject, clip, fillRule) {
  const solution = []
  const clipper = new Clipper64()
  clipper.addPaths(subject, PathType.Subject)
  clipper.addPaths(clip, PathType.Clip)
  clipper.execute(clipType, fillRule, solution)
  return solution
}

export function booleanOpDWithPolyTree(clipType, subject, clip, tree, fillRule, precision = 2) {
  const clipper = new ClipperD(precision)
  clipper.addSubjectPaths(subject)
  if (clip !== null) clipper.addClipPaths(clip)
  clipper.execute(clipType, fillRule, tree)
}

function booleanOpD(clipType, subject, clip, fillRule, precision) {
  const solution = []
  booleanOpDWithPolyTree(clipType, subject, clip, solution, fillRule, precision)
  return solution
}

export const union = (subject, clip, fillRule) => booleanOp(ClipType.Union, subject, clip, fillRule)
export const difference = (subject, clip, fillRule) => booleanOp(ClipType.Difference, subject, clip, fillRule)
export const unionD = (subject, clip, fillRule, precision) => booleanOpD(ClipType.Union, subject, clip, fillRule, precision)
export const intersectD = (subject, clip, fillRule, precision) => booleanOpD(ClipType.Intersection, subject, clip, fillRule, precision)
export const differenceD = (subject, clip, fillRule, precision) => booleanOpD(ClipType.Difference, subject, clip, fillRule, precision)

export function inflatePathsD(paths, delta, joinType, endType, miterLimit = 2, precision = 2, arcTolerance = 0) {
  InternalClipper.checkPrecision(precision)
  const scale = 10 ** precision
  const offset = new ClipperOffset(miterLimit, scale * arcTolerance)
  offset.addPaths(Clipper.scalePaths64(paths, scale), joinType, endType)
  const solution = []
  offset.execute(delta * scale, solution)
  return Clipper.scalePathsD(solution, 1 / scale)
}

function lineDistance(point, from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return 0
  const cross = (point.x - from.x) * dy - dx * (point.y - from.y)
  return cross * cross / (dx * dx + dy * dy)
}

function nextKept(index, high, removed) {
  do index = index === high ? 0 : index + 1
  while (removed[index])
  return index
}

function priorKept(index, high, removed) {
  do index = index === 0 ? high : index - 1
  while (removed[index])
  return index
}

function simplifyPathD(path, epsilon) {
  const high = path.length - 1
  const limit = epsilon * epsilon
  if (path.length < 4) return path
  const removed = Array(path.length).fill(false)
  const distance = path.map((point, i) => i === high ? lineDistance(point, path[0], path[high - 1]) : lineDistance(point, path[i === 0 ? high : i - 1], path[i + 1]))
  let current = 0
  while (true) {
    if (distance[current] > limit) {
      const start = current
      do current = nextKept(current, high, removed)
      while (current !== start && distance[current] > limit)
      if (current === start) break
    }
    const prev = priorKept(current, high, removed)
    const next = nextKept(current, high, removed)
    if (next === prev) break
    if (distance[next] < distance[current]) {
      const kept = current
      removed[next] = true
      current = nextKept(next, high, removed)
      distance[current] = lineDistance(path[current], path[kept], path[nextKept(current, high, removed)])
      distance[kept] = lineDistance(path[kept], path[prev], path[current])
    } else {
      const prior = priorKept(prev, high, removed)
      removed[current] = true
      current = next
      distance[current] = lineDistance(path[current], path[prev], path[nextKept(current, high, removed)])
      distance[prev] = lineDistance(path[prev], path[prior], path[current])
    }
  }
  return path.filter((point, i) => !removed[i])
}

export function simplifyPathsD(paths, epsilon) {
  return paths.map(path => simplifyPathD(path, epsilon))
}
