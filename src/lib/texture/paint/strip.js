import { fillPattern, surface } from "../canvas.js"
import { layerCell, layerLeft } from "../../font/flatSheet.js"
import { remember } from "../../core/maths.js"
import { MISSING, stripHasRow, stripY } from "../../font/strips.js"
import { CACHED_OVERLAYS, R, fillRect, into, plain } from "./draw.js"

const MAX_STRIP_DETAIL = 64

const stretchedStrips = new WeakMap()

function fillRects(ctx, rects) {
  ctx.beginPath()
  for (const [x, y, w, h] of rects) ctx.rect(x * R, y * R, w * R, h * R)
  ctx.fill()
}

function stripRuns(map) {
  const runs = []
  for (const [row, from] of map.entries()) {
    const last = runs.at(-1)
    if (last && row === last.row + last.height && from - row === last.from - last.row) last.height++
    else runs.push({ row, from, height: 1 })
  }
  return runs
}

function stretchedStrip(strip, low, high) {
  const { image, density } = strip
  if (!stretchedStrips.has(image)) stretchedStrips.set(image, new Map())
  return remember(stretchedStrips.get(image), JSON.stringify([strip.scale, density, strip.depth, strip.top, low, high]), () => {
    const out = surface(image.width, (high - low + 1) * density)
    for (let at = low; at <= high; at++) {
      const from = ((strip.depth + strip.top - 1 - stripY(strip, at)) * density % image.height + image.height) % image.height
      const to = (high - at) * density
      const first = Math.min(density, image.height - from)
      out.ctx.drawImage(image, 0, from, image.width, first, 0, to, image.width, first)
      if (first < density) out.ctx.drawImage(image, 0, 0, image.width, density - first, 0, to + first, image.width, density - first)
    }
    return out.canvas
  }, CACHED_OVERLAYS)
}

function bandExtent(glyph, band, independent) {
  if (band === null || !glyph.depths) return { left: 0, right: glyph.width }
  const cell = layerCell(glyph, band, independent)
  return cell.width ? { left: cell.left, right: cell.left + cell.width } : null
}

function stripShift(glyph, strip, shifts) {
  if (shifts.has(glyph)) return shifts.get(glyph)
  const own = bandExtent(glyph, strip.band, strip.independent)
  const before = glyph.previous && bandExtent(glyph.previous, strip.band, strip.independent)
  let shift = 0
  if (own && before && glyph.previous.lineX + before.right >= glyph.lineX + own.left) shift = stripShift(glyph.previous, strip, shifts)
  else if (own) {
    const pixel = strip.snap ?? 1 / strip.density
    const phase = ((glyph.lineX + own.left - layerLeft(glyph.lineFirst ?? glyph, strip.band, strip.independent)) % pixel + pixel) % pixel
    shift = phase <= pixel / 2 ? phase : phase - pixel
  }
  shifts.set(glyph, shift)
  return shift
}

export function paintStrip(ctx, entries, strip) {
  const shifts = new Map()
  const runs = new Map(entries.map(entry => [entry, stripRuns(entry.glyph.arc.map)]))
  const spans = Array.from(runs).flatMap(([entry, list]) => list.flatMap(run => [entry.source.glyph.bottom + run.from, entry.source.glyph.bottom + run.from + run.height - 1]))
  const high = Math.max(...spans)
  const stretched = strip.scale && Number.isInteger(strip.density) && spans.length ? stretchedStrip(strip, Math.min(...spans), high) : null
  for (const [entry, list] of runs) {
    const { glyph, source } = entry
    const origin = strip.tiling === "character" ? entry.x + layerLeft(glyph, strip.band, strip.independent) : entry.x - glyph.lineX + layerLeft(glyph.lineFirst ?? glyph, strip.band, strip.independent) + stripShift(glyph, strip, shifts)
    into(ctx, entry, "front")
    for (const { row, from, height } of list) {
      if (stretched) {
        const y = entry.top + glyph.height - 1 - row
        fillPattern(ctx, stretched, new DOMMatrix().translate(origin * R, (y - high + source.glyph.bottom + from) * R).scale(R / strip.density))
        fillRect(ctx, [entry.x, y - height + 1, entry.width, height])
        continue
      }
      const rows = strip.scale ? Array.from({ length: height }, (_, step) => [row + step, from + step, 1]) : [[row, from, height]]
      for (const [first, start, count] of rows) {
        const band = strip.depth + strip.top - 1 - stripY(strip, source.glyph.bottom + start)
        const y = entry.top + glyph.height - 1 - first
        fillPattern(ctx, strip.image, new DOMMatrix().translate(origin * R, (y - band) * R).scale(R / strip.density))
        fillRect(ctx, [entry.x, y - count + 1, entry.width, count])
      }
    }
    for (const [y, from, depth, behind, up] of [[entry.up, 0, entry.upHeight, strip.slice?.from, true], [entry.down, strip.depth + strip.top - strip.bottom, entry.downHeight, strip.slice && 1 - strip.slice.from - strip.slice.size, false]]) {
      into(ctx, entry, up ? "up" : "down")
      const start = strip.slice ? depth * behind : 0
      const size = strip.slice ? depth * strip.slice.size : depth
      const shallow = Math.round(size) < strip.depth
      const stretch = shallow ? 1 : size / strip.depth
      const first = shallow && up ? from + strip.depth - Math.round(size) : from
      const last = shallow ? first + Math.round(size) - 1 : from + strip.depth - 1
      fillPattern(ctx, strip.image, new DOMMatrix().translate(origin * R, (y + start - first * stretch) * R).scale(R / strip.density, R / strip.density * stretch))
      fillRect(ctx, [entry.x, y + start, entry.width, size])
      if (!strip.slice) continue
      stretchRow(ctx, strip, origin, first, [entry.x, y, entry.width, start])
      stretchRow(ctx, strip, origin, last, [entry.x, y + start + size, entry.width, depth - start - size])
    }
    const missing = list.flatMap(({ row, from, height }) => Array.from({ length: height }, (_, step) => [row + step, source.glyph.bottom + from + step])).filter(([, at]) => !stripHasRow(strip, at))
    if (!missing.length) continue
    into(ctx, entry, "front")
    fillPattern(ctx, missingTexture(), new DOMMatrix())
    fillRects(ctx, missing.map(([row]) => [entry.x, entry.top + glyph.height - 1 - row, entry.width, 1]))
  }
  plain(ctx)
}

let checker = null

function missingTexture() {
  if (checker) return checker
  const { canvas, ctx } = surface(R * 2, R * 2)
  const [pink, black] = MISSING.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`)
  ctx.fillStyle = black
  ctx.fillRect(0, 0, R * 2, R * 2)
  ctx.fillStyle = pink
  ctx.fillRect(0, 0, R, R)
  ctx.fillRect(R, R, R, R)
  return checker = canvas
}

export function stripDetail(strip, depth) {
  const size = strip.slice ? depth * strip.slice.size : depth
  if (Math.round(size) <= strip.depth) return 1
  const rows = strip.depth * strip.density
  for (let detail = 1; detail <= MAX_STRIP_DETAIL; detail++) {
    const step = size * R * detail / rows
    if (Math.abs(step - Math.round(step)) < 1e-9) return detail
  }
  return Infinity
}

function stretchRow(ctx, strip, origin, row, rect) {
  if (rect[3] <= 0) return
  fillPattern(ctx, strip.image, new DOMMatrix().translate(origin * R, (rect[1] - row * rect[3]) * R).scale(R / strip.density, R / strip.density * rect[3]))
  fillRect(ctx, rect)
}
