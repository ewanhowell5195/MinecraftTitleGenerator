import { joinedMask } from "../../geometry/joins.js"
import { clamp } from "../../core/maths.js"
import { settingsOf } from "./settings.js"
import { crackWrap } from "./cracks.js"

function edgeRuns(glyph, side) {
  const { width, height, mask } = glyph
  const row = side === "up" ? height - 1 : 0
  const joined = joinedMask(glyph, 1)
  const continues = column => !!joined && joined.mask[(row + 1) * joined.width + column + 1] === 1
  if (glyph.fine?.edgeRuns) return glyph.fine.edgeRuns(side).map(([from, to]) => [from, to, continues(Math.floor(from) - 1), continues(Math.ceil(to))])
  const list = []
  for (let start = 0; start < width;) {
    if (!mask[row * width + start]) {
      start++
      continue
    }
    let end = start
    while (end + 1 < width && mask[row * width + end + 1]) end++
    list.push([start, end + 1, continues(start - 1), continues(end + 1)])
    start = end + 1
  }
  return list
}

function columnsOf(from, to, scale) {
  return [Math.max(0, Math.floor(from * scale)), Math.ceil(to * scale)]
}

function rounded(glyph, side, radius, depth, scale) {
  const columns = glyph.width * scale
  const rows = depth * scale
  const out = new Float32Array(columns * rows)
  for (const [from, to, leftJoined, rightJoined] of edgeRuns(glyph, side)) {
    const size = Math.min(radius, (to - from) / 2, depth) * scale
    const left = leftJoined ? -Infinity : from * scale + size
    const right = rightJoined ? Infinity : to * scale - size
    const top = rows - size
    const [first, last] = columnsOf(from, to, scale)
    for (let sd = Math.floor(top); sd < rows; sd++) {
      const sy = side === "up" ? rows - 1 - sd : sd
      for (let sx = first; sx < Math.min(last, columns); sx++) {
        const centre = sx + 0.5 < left ? left : sx + 0.5 > right ? right : null
        if (centre === null || sd + 0.5 < top) continue
        out[sy * columns + sx] = clamp(Math.hypot(sx + 0.5 - centre, sd + 0.5 - top) - size + 0.5, 0, 1)
      }
    }
  }
  return out
}

function crackStrip(glyph, side, layer, depth, scale, soft) {
  const columns = glyph.width * scale
  const out = crackWrap(glyph, layer, side, side === "up" ? 0 : glyph.height, 0, glyph.width, depth, scale, soft) ?? new Float32Array(columns * depth * scale)
  const open = new Uint8Array(glyph.width)
  for (const [from, to] of edgeRuns(glyph, side)) open.fill(1, Math.max(0, Math.floor(from)), Math.ceil(to))
  for (let index = 0; index < out.length; index++) {
    if (!open[Math.floor(index % columns / scale)]) out[index] = 0
  }
  return out
}

export function edgeAlpha(glyph, side, kind, layer, depth, scale, soft = false) {
  if (kind === "cracks") return crackStrip(glyph, side, layer, depth, scale, soft)
  const settings = settingsOf(kind, layer)
  if (kind === "edge_rounded") return rounded(glyph, side, settings.radius, depth, scale)
  const { thickness } = settings
  const columns = glyph.width * scale
  const rows = depth * scale
  const out = new Float32Array(columns * rows)
  for (const [from, to, leftJoined, rightJoined] of edgeRuns(glyph, side)) {
    const [first, last] = columnsOf(from, to, scale)
    for (let sd = 0; sd < rows; sd++) {
      const d = (sd + 0.5) / scale
      const strength = kind === "edge_outline_fade" ? clamp((d - 0.5) / Math.max(1, depth - 1), 0, 1) : 1
      const sy = side === "up" ? rows - 1 - sd : sd
      const far = d >= depth - thickness && kind !== "edge_front"
      const front = d < thickness && (kind === "edge_outline" || kind === "edge_front")
      for (let sx = first; sx < Math.min(last, columns); sx++) {
        const x = (sx + 0.5) / scale
        const atEnd = (x - from < thickness && !leftJoined || to - x < thickness && !rightJoined) && kind !== "edge_front"
        if (far || front || atEnd) out[sy * columns + sx] = strength
      }
    }
  }
  return out
}
