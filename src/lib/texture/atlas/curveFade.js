import { clamp } from "../../core/maths.js"
import { faceLimits } from "../../geometry/meshFaces.js"

const FADE_HEIGHT_FROM = 0.5
const LONGEST_WALK = 256
const SHARP_TURN = Math.PI / 6
const FLATTER = Math.PI / 90
const SHORT_FACE = 0.25

function easedOut(value, [from, to]) {
  const amount = clamp((value - from) / (to - from), 0, 1)
  return 1 - amount * amount * (3 - 2 * amount)
}

function pointKey([x, y]) {
  return `${x},${y}`
}

function slope(face) {
  const [p, , , q] = face.points
  return Math.atan2(Math.abs(q[1] - p[1]), Math.abs(q[0] - p[0]))
}

export function curveWeights(face, rect, reach, corners = [slope(face), slope(face)], limits = faceLimits({ faded: true })) {
  const lines = face.kind === "top" ? rect.tops ?? [rect.maxY] : rect.bottoms ?? [rect.minY]
  const height = point => Math.min(...lines.map(line => Math.abs(point[1] - line)))
  return [face.points[0], face.points[3]].map((point, index) => Math.min(easedOut(corners[index], [limits.fadeFrom, limits.slope]), easedOut(height(point) / reach, [FADE_HEIGHT_FROM, limits.band])))
}

function direction(face) {
  const [p, , , q] = face.points
  return [q[0] - p[0], q[1] - p[1]]
}

function cornerSlope(face, neighbour) {
  if (!neighbour) return slope(face)
  const [ax, ay] = direction(face)
  const [bx, by] = direction(neighbour)
  const turn = Math.acos(clamp((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1), -1, 1))
  return turn > SHARP_TURN ? slope(face) : (slope(face) + slope(neighbour)) / 2
}

function stripFace(face) {
  return (face.kind === "top" || face.kind === "bottom") && !face.internal
}

function steepness(face) {
  return face.kind === "side" ? Infinity : slope(face)
}

function length(face) {
  const [p, , , q] = face.points
  return Math.hypot(q[0] - p[0], q[1] - p[1])
}

function beyond(face, starting, ending, short) {
  let forward = face
  let backward = face
  let ahead = slope(face)
  let behind = slope(face)
  for (let step = 0; step < LONGEST_WALK; step++) {
    const next = forward && starting.get(pointKey(forward.points[3]))
    forward = next && (steepness(next) >= ahead - FLATTER || length(next) < short) ? next : null
    if (forward && !stripFace(forward)) return [forward, 0, 1]
    if (forward && length(forward) >= short) ahead = slope(forward)
    const last = backward && ending.get(pointKey(backward.points[0]))
    backward = last && (steepness(last) >= behind - FLATTER || length(last) < short) ? last : null
    if (backward && !stripFace(backward)) return [backward, 3, 2]
    if (backward && length(backward) >= short) behind = slope(backward)
    if (!forward && !backward) return null
  }
  return null
}

function sampler(image, uvs, [front, back]) {
  const us = uvs.map(uv => uv[0])
  const vs = uvs.map(uv => uv[1])
  const [left, right, top, bottom] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
  return t => {
    const u = clamp(uvs[front][0] + (uvs[back][0] - uvs[front][0]) * t, left + 0.5, Math.max(left + 0.5, right - 0.5))
    const v = clamp(uvs[front][1] + (uvs[back][1] - uvs[front][1]) * t, top + 0.5, Math.max(top + 0.5, bottom - 0.5))
    const at = (clamp(Math.floor(v), 0, image.height - 1) * image.width + clamp(Math.floor(u), 0, image.width - 1)) * 4
    return image.data.slice(at, at + 4)
  }
}

const unfaded = new WeakMap()

export function keepStrips(ctx, rects, fading) {
  const kept = unfaded.get(ctx.canvas)
  if (kept) for (const [rect, image] of kept) ctx.putImageData(image, rect.x, rect.y)
  else if (fading) unfaded.set(ctx.canvas, rects.map(rect => [rect, ctx.getImageData(rect.x, rect.y, Math.max(1, rect.width), Math.max(1, rect.height))]))
}

export function fadeCurves(ctx, faces, rects, chosen, reach, limits = faceLimits({ faded: true })) {
  const walls = faces.filter(face => face.mesh && face.uvs && chosen.has(face.glyph) && face.kind !== "front" && face.kind !== "back")
  const byGlyph = Map.groupBy(walls, face => face.glyph)
  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  const dirty = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const [glyph, list] of byGlyph) {
    const starting = new Map(list.map(face => [pointKey(face.points[0]), face]))
    const ending = new Map(list.map(face => [pointKey(face.points[3]), face]))
    const strips = list.filter(stripFace)
    const claimed = new Set()
    const columnKey = (face, column) => `${column}:${Math.floor(Math.min(face.uvs[0][1], face.uvs[1][1]))}`
    for (const face of strips) {
      const [[uStart], , , [uEnd]] = face.uvs
      for (let column = Math.ceil(Math.min(uStart, uEnd) - 0.5); column < Math.ceil(Math.max(uStart, uEnd) - 0.5); column++) claimed.add(columnKey(face, column))
    }
    const jobs = []
    for (const face of strips) {
      const corners = [cornerSlope(face, ending.get(pointKey(face.points[0]))), cornerSlope(face, starting.get(pointKey(face.points[3])))]
      const [atStart, atEnd] = curveWeights(face, rects[glyph], reach, corners, limits)
      if (atStart >= 1 && atEnd >= 1) continue
      const found = beyond(face, starting, ending, reach * SHORT_FACE)
      if (!found) continue
      const [next, front, back] = found
      jobs.push({ face, atStart, atEnd, target: sampler(image, next.uvs, [front, back]) })
    }
    for (const { face, atStart, atEnd, target } of jobs) {
      const [[uStart, vFront], [, vBack], , [uEnd]] = face.uvs
      const owned = column => column >= Math.ceil(Math.min(uStart, uEnd) - 0.5) && column < Math.ceil(Math.max(uStart, uEnd) - 0.5)
      const x0 = Math.max(0, Math.floor(Math.min(uStart, uEnd)))
      const y0 = Math.max(0, Math.floor(Math.min(vFront, vBack)))
      const x1 = Math.min(image.width, Math.max(x0 + 1, Math.ceil(Math.max(uStart, uEnd))))
      const y1 = Math.min(image.height, Math.max(y0 + 1, Math.ceil(Math.max(vFront, vBack))))
      const colours = Array.from({ length: y1 - y0 }, (_, row) => target(clamp((y0 + row + 0.5 - vFront) / (vBack - vFront || 1), 0, 1)))
      for (let column = x0; column < x1; column++) {
        if (!owned(column)) {
          if (claimed.has(columnKey(face, column))) continue
          claimed.add(columnKey(face, column))
        }
        const keep = atStart + (atEnd - atStart) * clamp((column + 0.5 - uStart) / (uEnd - uStart || 1), 0, 1)
        for (let row = y0; row < y1; row++) {
          const colour = colours[row - y0]
          const at = (row * image.width + column) * 4
          for (let channel = 0; channel < 4; channel++) image.data[at + channel] = colour[channel] + (image.data[at + channel] - colour[channel]) * keep
        }
      }
      dirty.left = Math.min(dirty.left, x0)
      dirty.top = Math.min(dirty.top, y0)
      dirty.right = Math.max(dirty.right, x1)
      dirty.bottom = Math.max(dirty.bottom, y1)
    }
  }
  if (dirty.right > dirty.left) ctx.putImageData(image, 0, 0, dirty.left, dirty.top, dirty.right - dirty.left, dirty.bottom - dirty.top)
}
