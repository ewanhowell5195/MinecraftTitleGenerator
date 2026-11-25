import { packed } from "#lib/core/colour.js"
import { clamp } from "#lib/core/maths.js"
import { BASE } from "./regions.js"
import { jump, near } from "./colours.js"
import { EPSILON, PLANE_ERROR, worldMap } from "./faces.js"

const SEAM = 0.5
const JOIN_REACH = 2
const JOIN_TRIM = 0.25

function insideFace(point, face) {
  return face.corners.every((corner, index) => {
    const next = face.corners[(index + 1) % face.corners.length]
    return next.clone().sub(corner).cross(point.clone().sub(corner)).dot(face.facing) >= -EPSILON
  })
}

function neighbourOf(face, others, point) {
  return others.find(other => other !== face && other.image && Math.abs(other.normal.dot(face.normal) - 1) < EPSILON && Math.abs(other.normal.dot(point) - other.normal.dot(other.corners[0])) < PLANE_ERROR && insideFace(point, other))
}

function neighbourBeside(face, others, toWorld, x, y, dx, dy) {
  return neighbourOf(face, others, toWorld(face.rect.left + x + 0.5 + dx, face.rect.top + y + 0.5 + dy))
}

function texelIn({ left, top, right, bottom }, x, y) {
  return [clamp(Math.floor(x), left, right - 1), clamp(Math.floor(y), top, bottom - 1)]
}

function colourAt(face, x, y) {
  const { data, width } = face.image
  const [column, row] = texelIn(face.rect, x, y)
  const at = (row * width + column) * 4
  return data[at + 3] < 128 ? null : packed(data, at)
}

function texelOf(face, point) {
  const [c0, c1] = face.corners
  const [t0, t1] = face.texels
  const c3 = face.corners.at(-1)
  const t3 = face.texels.at(-1)
  const across = c1.clone().sub(c0)
  const down = c3.clone().sub(c0)
  const offset = point.clone().sub(c0)
  const aa = across.lengthSq()
  const ab = across.dot(down)
  const bb = down.lengthSq()
  const determinant = aa * bb - ab * ab
  const u = (offset.dot(across) * bb - offset.dot(down) * ab) / determinant
  const v = (offset.dot(down) * aa - offset.dot(across) * ab) / determinant
  return [t0[0] + u * (t1[0] - t0[0]) + v * (t3[0] - t0[0]), t0[1] + u * (t1[1] - t0[1]) + v * (t3[1] - t0[1])]
}

function layerOwns(face, x, y) {
  const { left, top, right } = face.rect
  const [column, row] = texelIn(face.rect, x, y)
  return face.analysis.owner?.[(row - top) * (right - left) + column - left] >= 0
}

function joinKind(face, others, toWorld, x, y, dx, dy) {
  const point = toWorld(x + dx, y + dy)
  const other = neighbourOf(face, others, point)
  if (!other) return null
  const [texelX, texelY] = texelOf(other, point)
  const own = colourAt(face, x - dx, y - dy)
  const beyond = colourAt(other, texelX, texelY)
  if (own === null || beyond === null) return null
  if (near(own, beyond)) return "over"
  if (!layerOwns(other, texelX, texelY)) return other
  return other.index > face.index ? "under" : null
}

export function joinsOf(face, loop, others, toWorld) {
  const { left, top, right, bottom } = face.rect
  const joins = { over: [], under: [], covers: [] }
  for (const [index, point] of loop.entries()) {
    const next = loop[(index + 1) % loop.length]
    const dx = point[0] !== next[0] ? 0 : point[0] === left ? -SEAM : point[0] === right ? SEAM : 0
    const dy = point[1] !== next[1] ? 0 : point[1] === top ? -SEAM : point[1] === bottom ? SEAM : 0
    if (!dx && !dy) continue
    const stepX = Math.sign(next[0] - point[0])
    const stepY = Math.sign(next[1] - point[1])
    const length = Math.abs(next[0] - point[0]) + Math.abs(next[1] - point[1])
    function endsHard(inside, outside) {
      const x = point[0] + stepX * outside - dx
      const y = point[1] + stepY * outside - dy
      if (x < left || x >= right || y < top || y >= bottom) return true
      const own = colourAt(face, point[0] + stepX * inside - dx, point[1] + stepY * inside - dy)
      const other = colourAt(face, x, y)
      return own === null || other === null || jump(own, other)
    }
    let start = 0
    let kind = null
    for (let unit = 0; unit <= length; unit++) {
      const current = unit < length ? joinKind(face, others, toWorld, point[0] + stepX * (unit + 0.5), point[1] + stepY * (unit + 0.5), dx, dy) : null
      if (current === kind && unit < length) continue
      if (kind !== null) {
        const head = start + (start === 0 && endsHard(0.5, -0.5) ? JOIN_TRIM : 0)
        const tail = unit - (unit === length && endsHard(length - 0.5, length + 0.5) ? JOIN_TRIM : 0)
        const from = [point[0] + stepX * head, point[1] + stepY * head]
        const to = [point[0] + stepX * tail, point[1] + stepY * tail]
        function quad(inset, reach, shrink) {
          const [fromX, fromY] = [from[0] + stepX * shrink, from[1] + stepY * shrink]
          const [toX, toY] = [to[0] - stepX * shrink, to[1] - stepY * shrink]
          return [[fromX - dx * inset, fromY - dy * inset], [toX - dx * inset, toY - dy * inset], [toX + dx * reach, toY + dy * reach], [fromX + dx * reach, fromY + dy * reach]]
        }
        if (typeof kind === "object") {
          joins.covers.push({ neighbour: kind, quad: quad(0, JOIN_REACH, 0) })
          joins.over.push(quad(1, JOIN_REACH / 2, JOIN_TRIM / 2))
        } else joins[kind].push(quad(kind === "under" ? 0 : 1, JOIN_REACH, 0))
      }
      start = unit
      kind = current
    }
  }
  return joins
}

export function outerPixels(face, others, list) {
  const toWorld = worldMap(face)
  const { left, top, right, bottom } = face.rect
  const width = right - left
  const height = bottom - top
  return list.filter(index => {
    const x = index % width
    const y = Math.floor(index / width)
    const sides = [x === 0 && [-1, 0], x === width - 1 && [1, 0], y === 0 && [0, -1], y === height - 1 && [0, 1]].filter(Boolean)
    return sides.every(([dx, dy]) => !neighbourBeside(face, others, toWorld, x, y, dx, dy))
  })
}

export function trimmedBase(face, others) {
  const toWorld = worldMap(face)
  const { left, top, right, bottom } = face.rect
  const width = right - left
  const height = bottom - top
  const { owner } = face.analysis
  const dropped = new Set()
  function touchesBase(x, y) {
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (owner[ny * width + nx] === BASE) return true
      }
    }
    return false
  }
  function check(x, y, dx, dy) {
    const index = y * width + x
    if (owner[index] >= 0 && !touchesBase(x, y) && !neighbourBeside(face, others, toWorld, x, y, dx, dy)) dropped.add(index)
  }
  for (let x = 0; x < width; x++) {
    check(x, 0, 0, -1)
    check(x, height - 1, 0, 1)
  }
  for (let y = 0; y < height; y++) {
    check(0, y, -1, 0)
    check(width - 1, y, 1, 0)
  }
  if (!dropped.size) return null
  const kept = []
  for (let index = 0; index < width * height; index++) {
    if (!dropped.has(index)) kept.push(index)
  }
  return kept
}
