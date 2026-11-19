import { highest, lowest, mostCommon } from "../core/maths.js"
import { CREEPER, OPENING_QUOTE } from "./order.js"

const CURVE_STEPS = 16
const CAPITALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const EDGE_PROBE = 1
const BANDS = 64
const measured = new WeakMap()

function sourceChars(char) {
  if (char === OPENING_QUOTE) return ["\u2018", "'"]
  if (char === "'") return ["'", "\u2019"]
  const letter = char === CREEPER ? "A" : char
  if (/^[a-z]$/i.test(letter)) return [letter, letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()]
  return [char]
}

export function glyphFor(font, char) {
  for (const candidate of sourceChars(char)) {
    const glyph = font.charToGlyph(candidate)
    if (glyph && glyph.index !== 0) return glyph
  }
  return null
}

function curveSteps(controls, stepLength) {
  if (!stepLength) return CURVE_STEPS
  let length = 0
  for (let i = 1; i < controls.length; i++) length += Math.hypot(controls[i][0] - controls[i - 1][0], controls[i][1] - controls[i - 1][1])
  return Math.min(CURVE_STEPS, Math.max(1, Math.ceil(length / stepLength)))
}

export function flatten(glyph, stepLength = 0) {
  const contours = []
  let points = []
  let at = [0, 0]
  for (const command of glyph.path.commands) {
    if (command.type === "M") {
      if (points.length) contours.push(points)
      points = [[command.x, command.y]]
    } else if (command.type === "L") {
      points.push([command.x, command.y])
    } else if (command.type === "Q") {
      const steps = curveSteps([at, [command.x1, command.y1], [command.x, command.y]], stepLength)
      for (let step = 1; step <= steps; step++) {
        const t = step / steps
        const u = 1 - t
        points.push([u * u * at[0] + 2 * u * t * command.x1 + t * t * command.x, u * u * at[1] + 2 * u * t * command.y1 + t * t * command.y])
      }
    } else if (command.type === "C") {
      const steps = curveSteps([at, [command.x1, command.y1], [command.x2, command.y2], [command.x, command.y]], stepLength)
      for (let step = 1; step <= steps; step++) {
        const t = step / steps
        const u = 1 - t
        points.push([u * u * u * at[0] + 3 * u * u * t * command.x1 + 3 * u * t * t * command.x2 + t * t * t * command.x, u * u * u * at[1] + 3 * u * u * t * command.y1 + 3 * u * t * t * command.y2 + t * t * t * command.y])
      }
    } else if (command.type === "Z") {
      if (points.length) contours.push(points)
      points = []
    }
    if (command.x !== undefined) at = [command.x, command.y]
  }
  if (points.length) contours.push(points)
  return contours
}

export function pixelGrid(glyphs, cap, base = 0) {
  const values = []
  for (const glyph of glyphs) {
    const points = glyph.path.commands.filter(command => command.x !== undefined)
    if (!points.length) continue
    if (glyph.path.commands.some(command => command.type === "Q" || command.type === "C")) return null
    const left = lowest(points.map(command => command.x))
    for (const command of points) values.push(command.x - left, command.y - base)
  }
  for (let count = 3; count <= 64; count++) {
    const unit = cap / count
    if (values.every(value => Math.abs(value - Math.round(value / unit) * unit) <= 1)) return unit
  }
  return null
}

export function gridShift(glyph, unit, scale) {
  if (unit) {
    const points = glyph.path.commands.filter(command => command.x !== undefined)
    if (!points.length) return 0
    const left = lowest(points.map(command => command.x))
    return Math.round(left / unit) * unit - left
  }
  const xs = flatten(glyph).flat().map(point => point[0] * scale)
  if (!xs.length) return 0
  const left = lowest(xs)
  const width = highest(xs) - left
  return (Math.round(left) + (Math.round(width) - width) / 2 - left) / scale
}

export function ringEdges(rings) {
  return rings.flatMap(ring => ring.map((point, index) => point.concat(ring[(index + 1) % ring.length])))
}

export function edgeBands(edges, size) {
  const bands = new Map()
  for (const edge of edges) {
    const from = Math.floor(Math.min(edge[1], edge[3]) / size)
    const to = Math.floor(Math.max(edge[1], edge[3]) / size)
    for (let band = from; band <= to; band++) {
      if (!bands.has(band)) bands.set(band, [])
      bands.get(band).push(edge)
    }
  }
  return y => bands.get(Math.floor(y / size)) ?? []
}

function flatEdges(glyph) {
  const edges = ringEdges(flatten(glyph))
  const crossing = edges.filter(([, y0, , y1]) => y0 !== y1)
  const ys = crossing.flatMap(edge => [edge[1], edge[3]])
  const near = edgeBands(crossing, Math.max(1, (highest(ys) - lowest(ys)) / BANDS))
  const spans = new Map()
  function inside(x, y) {
    if (!spans.has(y)) spans.set(y, fillSpans(near(y), y))
    return spans.get(y).some(([from, to]) => x >= from && x < to)
  }
  return edges.filter(([x0, y0, x1, y1]) => y0 === y1 && x0 !== x1).map(([x0, y, x1]) => {
    const middle = (x0 + x1) / 2
    const below = inside(middle, y - EDGE_PROBE)
    const above = inside(middle, y + EDGE_PROBE)
    return { y: Math.round(y), length: Math.abs(x1 - x0), top: below && !above, bottom: above && !below }
  })
}

function heaviest(weights, keep) {
  return Array.from(weights).filter(([y]) => keep(y)).sort((a, b) => b[1] - a[1])[0]?.[0]
}

function commonTop(glyphs) {
  const tops = glyphs.map(glyph => Math.round(glyph.getBoundingBox().y2)).filter(top => top > 0)
  if (!tops.length) return null
  const common = mostCommon(tops)
  return tops.filter(top => top === common).length > 1 ? common : tops.toSorted((a, b) => a - b)[tops.length >> 1]
}

export function lineUnits(font) {
  if (!measured.has(font)) measured.set(font, measuredLines(font))
  return measured.get(font)
}

function measuredLines(font) {
  const glyphs = Array.from(CAPITALS, char => font.charToGlyph(char)).filter(glyph => glyph && glyph.index !== 0)
  const tops = new Map()
  const bottoms = new Map()
  for (const glyph of glyphs) {
    for (const edge of flatEdges(glyph)) {
      if (edge.top) tops.set(edge.y, (tops.get(edge.y) ?? 0) + edge.length)
      if (edge.bottom) bottoms.set(edge.y, (bottoms.get(edge.y) ?? 0) + edge.length)
    }
  }
  const height = font.tables.os2?.sCapHeight
  const top = heaviest(tops, y => y > 0) ?? commonTop(glyphs) ?? (height > 0 ? height : font.unitsPerEm * 0.7)
  return { top, base: heaviest(bottoms, y => y < top / 2) ?? 0 }
}

function snapped(value) {
  return Math.round(value * 1e6) / 1e6
}

export function fillSpans(edges, y, scale = 1) {
  const crossings = []
  for (const [x0, y0, x1, y1] of edges) {
    if (y0 <= y === y1 <= y) continue
    crossings.push([snapped((x0 + (y - y0) / (y1 - y0) * (x1 - x0)) * scale), y1 > y0 ? 1 : -1])
  }
  crossings.sort((a, b) => a[0] - b[0])
  const spans = []
  let winding = 0
  for (let i = 0; i < crossings.length - 1; i++) {
    winding += crossings[i][1]
    if (winding) spans.push([Math.ceil(crossings[i][0] - 0.5), Math.ceil(crossings[i + 1][0] - 0.5)])
  }
  return spans
}

export function rasterise(glyph, scale, shift, base = 0) {
  const edges = ringEdges(flatten(glyph)).map(([x0, y0, x1, y1]) => [(x0 + shift) * scale, (y0 - base) * scale, (x1 + shift) * scale, (y1 - base) * scale]).filter(([, y0, , y1]) => y0 !== y1)
  if (!edges.length) return null
  const ys = edges.flatMap(edge => [edge[1], edge[3]])
  const minY = Math.floor(lowest(ys))
  const maxY = Math.ceil(highest(ys))
  const near = edgeBands(edges, 1)
  const rows = []
  for (let y = minY; y < maxY; y++) {
    const filled = new Set()
    for (const [from, to] of fillSpans(near(y + 0.5), y + 0.5)) {
      for (let x = from; x < to; x++) filled.add(x)
    }
    rows.push(filled)
  }
  let top = -Infinity
  let bottom = Infinity
  let left = Infinity
  let right = -Infinity
  for (const [index, filled] of rows.entries()) {
    if (!filled.size) continue
    top = Math.max(top, minY + index + 1)
    bottom = Math.min(bottom, minY + index)
    left = Math.min(left, ...filled)
    right = Math.max(right, ...filled)
  }
  if (top === -Infinity) return null
  const width = right - left + 1
  const height = top - bottom
  const mask = new Uint8Array(width * height)
  for (let y = bottom; y < top; y++) {
    for (const x of rows[y - minY]) mask[(top - 1 - y) * width + x - left] = 1
  }
  return { left, bottom, top, width, height, mask }
}
