import { canvasOf, surface } from "./canvas.js"
import { hexOf, rgbOf } from "./colour.js"
import { clamp } from "./maths.js"

const PAD = 1
const GAP = 2
const SWATCH = 1
const SCALE = 4
const MAX_TEXTURE = 4096
const MAX_WIDTH = MAX_TEXTURE / SCALE
const CORNER_SAMPLE = 3
const SIMILAR = 24
const MIX_STEPS = 24

function ordered(stops) {
  const list = stops.map(stop => ({ colour: stop.colour, position: clamp(stop.position / 100, 0, 1) }))
  list.sort((a, b) => a.position - b.position)
  return list
}

function toLinear(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function fromLinear(c) {
  const value = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055
  return Math.round(clamp(value, 0, 1) * 255)
}

function toOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(fromLinear)
}

function mix(a, b, t) {
  const from = toOklab(a)
  const to = toOklab(b)
  const [lightness] = toOklab(a.map((value, i) => value + (b[i] - value) * t))
  return fromOklab([lightness, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t])
}

export function blend(a, b, t) {
  return hexOf(mix(rgbOf(a), rgbOf(b), t))
}

function smoothStops(stops) {
  const list = []
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    for (let step = 0; step < MIX_STEPS; step++) list.push({ position: from.position + (to.position - from.position) * step / MIX_STEPS, colour: blend(from.colour, to.colour, step / MIX_STEPS) })
  }
  return list.concat(stops.slice(-1))
}

export function movedStopPositions(positions, from, to) {
  if (from === to) return positions.slice()
  const order = Array.from(positions.keys())
  order.splice(to, 0, order.splice(from, 1)[0])
  const last = order.length - 1
  const moved = order.map(index => positions[index])
  moved[0] = positions[0]
  moved[last] = positions[last]
  const between = order.findIndex((index, slot) => slot > 0 && slot < last && (index === from || index === 0 || index === last))
  if (between !== -1) moved[between] = Math.round((moved[between - 1] + moved[between + 1]) / 2)
  return moved
}

export function gradientStops(stops, smooth) {
  const list = ordered(stops)
  if (smooth) return smoothStops(list)
  const edges = [0].concat(list.slice(1).map(stop => stop.position), 1)
  return list.flatMap((stop, i) => [{ position: edges[i], colour: stop.colour }, { position: edges[i + 1], colour: stop.colour }])
}

export function stopColour(stops, t) {
  const after = stops.findIndex(stop => stop.position >= t)
  if (after === -1) return stops[stops.length - 1].colour
  if (after === 0) return stops[0].colour
  const from = stops[after - 1]
  const to = stops[after]
  return blend(from.colour, to.colour, (t - from.position) / (to.position - from.position))
}

function faceGradient(custom, fill, stops, smooth, direction) {
  return custom && fill === "gradient" ? { stops: gradientStops(stops, smooth), direction } : null
}

export function cssGradient(stops, smooth, direction) {
  if (stops.length === 1) return stops[0].colour
  return `linear-gradient(${direction}, ${gradientStops(stops, smooth).map(stop => `${stop.colour} ${stop.position * 100}%`).join(", ")})`
}

export function gradientLine(left, top, width, height, angle) {
  const radians = angle * Math.PI / 180
  const dx = -Math.sin(radians)
  const dy = Math.cos(radians)
  const reach = Math.abs(dx) * width / 2 + Math.abs(dy) * height / 2
  const centre = [left + width / 2, top + height / 2]
  return [[centre[0] - dx * reach, centre[1] - dy * reach], [centre[0] + dx * reach, centre[1] + dy * reach]]
}

function extent(points, axis) {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    min = Math.min(min, point[axis])
    max = Math.max(max, point[axis])
  }
  return { min, max, size: Math.max(1, Math.round(max - min)) }
}

function boundsOf(faces) {
  const points = faces.flatMap(face => face.points)
  const x = extent(points, 0)
  const y = extent(points, 1)
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max, width: x.size, height: y.size }
}

function shelf(items, maxWidth) {
  items.sort((a, b) => b.height - a.height || b.width - a.width)
  let x = 0
  let y = 0
  let rowHeight = 0
  let width = 0
  for (const item of items) {
    if (x > 0 && x + item.width > maxWidth) {
      x = 0
      y += rowHeight + PAD
      rowHeight = 0
    }
    item.x = x
    item.y = y
    x += item.width + PAD
    rowHeight = Math.max(rowHeight, item.height)
    width = Math.max(width, x - PAD)
  }
  return { width, height: items.length ? y + rowHeight : 0 }
}

function flow(blocks, maxWidth, space) {
  const words = []
  for (const block of blocks) {
    if (!words.length || block.spaces) words.push([block])
    else words[words.length - 1].push(block)
  }
  let x = 0
  let y = 0
  let rowHeight = 0
  let width = 0
  function wrap() {
    x = 0
    y += rowHeight + GAP
    rowHeight = 0
  }
  for (const word of words) {
    const span = word.reduce((value, block) => value + block.width + GAP, -GAP)
    const lead = word[0].spaces * space
    if (x > 0 && x + lead + span > maxWidth) wrap()
    else if (x > 0) x += lead
    for (const block of word) {
      if (x > 0 && x + block.width > maxWidth) wrap()
      block.x = x
      block.y = y
      x += block.width + GAP
      rowHeight = Math.max(rowHeight, block.height)
      width = Math.max(width, x - GAP)
    }
  }
  return { width, height: blocks.length ? y + rowHeight : 0 }
}

const tileTotals = new WeakMap()

function totalsOf(canvas) {
  if (tileTotals.has(canvas)) return tileTotals.get(canvas)
  const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
  const sums = new Float64Array(height * (width + 1) * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      const from = (y * (width + 1) + x) * 4
      const solid = data[at + 3] >= 128
      for (let channel = 0; channel < 3; channel++) sums[from + 4 + channel] = sums[from + channel] + (solid ? data[at + channel] : 0)
      sums[from + 7] = sums[from + 3] + (solid ? 1 : 0)
    }
  }
  const totals = { width, height, sums }
  tileTotals.set(canvas, totals)
  return totals
}

function similar(data, a, b) {
  return Math.abs(data[a] - data[b]) <= SIMILAR && Math.abs(data[a + 1] - data[b + 1]) <= SIMILAR && Math.abs(data[a + 2] - data[b + 2]) <= SIMILAR
}

function cornerPixels(painted, x, y, count, vertical, step) {
  const { data, width, height } = painted.facePixels()
  const skip = Math.max(1, Math.round(painted.edge * painted.scale))
  const reach = painted.edgeOnly ? 0 : CORNER_SAMPLE * painted.scale
  const row = new ImageData(vertical ? 1 : count, vertical ? count : 1)
  const groupAt = new Int32Array(reach)
  const groupCount = new Int32Array(reach)
  for (let i = 0; i < count; i++) {
    const px = vertical ? x : x + i
    const py = vertical ? y + i : y
    let groups = 0
    let best = (py * width + px) * 4
    let bestCount = 0
    for (let k = skip; k < skip + reach; k++) {
      const sx = vertical ? px + k * step : px
      const sy = vertical ? py : py + k * step
      const at = (sy * width + sx) * 4
      if (sx < 0 || sy < 0 || sx >= width || sy >= height || !data[at + 3]) break
      let group = 0
      while (group < groups && !similar(data, groupAt[group], at)) group++
      if (group === groups) {
        groupAt[groups] = at
        groupCount[groups++] = 0
      }
      if (++groupCount[group] > bestCount) {
        best = groupAt[group]
        bestCount = groupCount[group]
      }
    }
    row.data.set(data.subarray(best, best + 4), i * 4)
  }
  return row
}

export function buildAtlas(faces, options) {
  const depth = Math.max(1, Math.round(options.depth))
  const half = depth / 2
  const { sheet, painted } = options
  const R = painted.scale
  let swatch = null
  const sideSum = [0, 0, 0, 0]

  const groups = new Map()
  for (const face of faces) {
    if (face.internal || face.kind === "side") continue
    if (!groups.has(face.glyph)) groups.set(face.glyph, [])
    groups.get(face.glyph).push(face)
  }
  const owns = new Map(Array.from(groups.entries()).map(([index, group]) => {
    const faces = boundsOf(group)
    const rect = options.rects[index]
    const minX = Math.min(faces.minX, rect.minX)
    const maxX = Math.max(faces.maxX, rect.maxX)
    const minY = Math.min(faces.minY, rect.minY)
    const maxY = Math.max(faces.maxY, rect.maxY)
    return [index, { minX, maxX, minY, maxY, width: Math.max(1, Math.round(maxX - minX)), height: Math.max(1, Math.round(maxY - minY)) }]
  }))
  const minY = Math.min(...Array.from(owns.values(), own => own.minY))
  const maxY = Math.max(...Array.from(owns.values(), own => own.maxY))
  const shared = { minY, maxY, height: Math.max(1, Math.round(maxY - minY)) }
  const blocks = Array.from(groups.entries()).map(([index, group]) => {
    const own = owns.get(index)
    const bounds = { minX: own.minX, maxX: own.maxX, minY: shared.minY, maxY: shared.maxY, width: own.width, height: shared.height }
    return { glyph: index, group, own, bounds, entry: sheet.glyphs[options.chars[index]], spaces: options.spaces[index], width: bounds.width, height: depth * 2 + bounds.height }
  })
  const blockOf = new Map(blocks.map(block => [block.glyph, block]))
  const widest = blocks.reduce((value, block) => Math.max(value, block.width), 0)
  const total = blocks.reduce((value, block) => value + block.width + GAP + block.spaces * options.space, 0)
  const limit = Math.max(widest, Math.min(MAX_WIDTH, total))
  const glyphs = flow(blocks, limit, options.space)

  let packY = glyphs.height
  let packWidth = glyphs.width

  function pack(items) {
    packY += PAD
    const size = shelf(items, limit)
    for (const item of items) item.face.rect = { x: item.x, y: packY + item.y, width: item.width, height: item.height }
    packY += size.height
    packWidth = Math.max(packWidth, size.width)
  }

  for (const kind of ["top", "bottom"]) {
    const members = options.internalFaces ? faces.filter(face => face.internal && face.kind === kind) : []
    if (members.length) pack(members.map(face => ({ face, width: extent(face.points, 0).size, height: depth })))
  }
  const sides = options.sideFaces ? faces.filter(face => face.kind === "side") : []
  if (sides.length) pack(sides.map(face => ({ face, width: depth, height: extent(face.points, 1).size })))
  const packed = faces.filter(face => face.rect)

  const edges = faces.filter(face => face.kind === "side" ? !options.sideFaces : face.internal && !options.internalFaces)
  if (edges.length || options.outline) {
    packY += PAD
    swatch = { x: 0, y: packY }
    packY += SWATCH
    packWidth = Math.max(packWidth, SWATCH)
  }

  for (const block of blocks) {
    const bounds = block.bounds
    for (const face of block.group) {
      if (face.kind === "top") {
        face.uvs = face.points.map(point => [block.x + (point[0] - bounds.minX), block.y + (half + point[2])])
      } else if (face.kind === "bottom") {
        face.uvs = face.points.map(point => [block.x + (point[0] - bounds.minX), block.y + depth + bounds.height + (half - point[2])])
      } else {
        face.uvs = face.points.map(point => [block.x + (point[0] - bounds.minX), block.y + depth + (bounds.maxY - point[1])])
      }
    }
  }

  for (const face of packed) {
    if (face.kind === "side") {
      const span = extent(face.points, 1)
      face.uvs = face.points.map(point => [face.rect.x + half + point[2], face.rect.y + (span.max - point[1])])
      continue
    }
    const span = extent(face.points, 0)
    face.uvs = face.points.map(point => [face.rect.x + (point[0] - span.min), face.rect.y + (face.kind === "top" ? half + point[2] : half - point[2])])
  }

  for (const face of edges) {
    face.uvs = [[swatch.x, swatch.y], [swatch.x, swatch.y + SWATCH], [swatch.x + SWATCH, swatch.y + SWATCH], [swatch.x + SWATCH, swatch.y]]
  }

  const units = { width: Math.max(1, packWidth), height: Math.max(1, packY) }
  if (units.width > MAX_WIDTH || units.height > MAX_WIDTH) throw new Error(`texture would be ${units.width * SCALE}x${units.height * SCALE}, over the ${MAX_TEXTURE} limit`)
  const { canvas, ctx } = surface(units.width * SCALE, units.height * SCALE)

  function copyBlocks(target, source) {
    function copy(sx, sy, sw, sh, dx, dy, dw, dh) {
      if (sw > 0 && sh > 0) target.drawImage(source, sx * R, sy * R, sw * R, sh * R, dx * SCALE, dy * SCALE, dw * SCALE, dh * SCALE)
    }
    for (const block of blocks) {
      const entry = block.entry
      if (!entry) continue
      const faceTop = block.y + depth
      copy(entry.x, entry.top, entry.width, entry.height, block.x, faceTop + block.bounds.maxY - block.own.maxY, entry.width, entry.height)
      copy(entry.x, entry.up, entry.width, entry.upHeight, block.x, block.y, entry.width, depth)
      copy(entry.x, entry.down, entry.width, entry.downHeight, block.x, faceTop + block.bounds.height, entry.width, depth)
    }
  }

  copyBlocks(ctx, painted.canvas)

  function labels() {
    const target = surface(canvas.width, canvas.height, { willReadFrequently: true })
    copyBlocks(target.ctx, painted.labels())
    return target.ctx.getImageData(0, 0, canvas.width, canvas.height).data
  }

  const clear = painted.border.replace("rgb(", "rgba(").replace(")", ", 0)")
  const fades = []
  const gradientFaces = []

  function addFade(left, top, right, bottom, near, far, amount) {
    if (amount < 1) fades.push({ left, top, right, bottom, near, far, amount, colour: painted.borderColour })
  }

  function addGradient({ x, y, width, height }, from, to, stops) {
    gradientFaces.push({ left: x * SCALE, top: y * SCALE, right: (x + width) * SCALE, bottom: (y + height) * SCALE, from: from.map(value => value * SCALE), to: to.map(value => value * SCALE), stops: stops.map(({ position, colour }) => {
      const [r, g, b] = rgbOf(colour)
      return { position, colour: r | g << 8 | b << 16 }
    }) })
  }

  function shadeFace(rect, fill, amount, back, front, horizontal) {
    const { x, y, width, height } = rect
    ctx.globalCompositeOperation = "source-atop"
    ctx.fillStyle = fill
    ctx.fillRect(x * SCALE, y * SCALE, width * SCALE, height * SCALE)
    if (amount !== null) {
      const fade = clamp(amount, 0, 1)
      const gradient = horizontal ? ctx.createLinearGradient(front, 0, back, 0) : ctx.createLinearGradient(0, front, 0, back)
      gradient.addColorStop(0, clear)
      gradient.addColorStop(1 - fade, painted.border)
      gradient.addColorStop(1, painted.border)
      ctx.fillStyle = gradient
      ctx.fillRect(x * SCALE, y * SCALE, width * SCALE, height * SCALE)
      if (typeof fill === "string") addFade(x * SCALE, y * SCALE, (x + width) * SCALE, (y + height) * SCALE, horizontal ? [front, 0] : [0, front], horizontal ? [back, 0] : [0, back], fade)
    }
    ctx.globalCompositeOperation = "source-over"
  }

  const sideGradient = faceGradient(options.customSide, options.sideFill, options.sideStops, options.sideSmooth, options.sideDirection)
  const innerGradient = options.customInternal ? faceGradient(true, options.internalFill, options.internalStops, options.internalSmooth, options.internalDirection) : faceGradient(options.customEdge, options.edgeFill, options.edgeStops, options.edgeSmooth, "along")

  function spanFill(stops, x0, y0, x1, y1) {
    const gradient = ctx.createLinearGradient(x0 * SCALE, y0 * SCALE, x1 * SCALE, y1 * SCALE)
    for (const stop of stops) gradient.addColorStop(stop.position, stop.colour)
    return gradient
  }

  function heightOf(y) {
    return clamp((y - shared.minY) / (shared.maxY - shared.minY), 0, 1)
  }

  function sideFill(face, block, span) {
    if (!options.customSide) return `rgba(0, 0, 0, ${1 - options.sideBrightness / 100})`
    if (!sideGradient) return options.sideColour
    if (sideGradient.direction === "along") return stopColour(sideGradient.stops, clamp((Math.round(face.points[0][0] - block.own.minX) + block.entry.glyph.wordX) / sheet.wordWidth, 0, 1))
    const base = face.rect.y + span.max
    return spanFill(sideGradient.stops, 0, base - shared.minY, 0, base - shared.maxY)
  }

  function innerFill(face, block, span, level) {
    if (innerGradient?.direction === "up") return stopColour(innerGradient.stops, heightOf(level))
    if (innerGradient) {
      const left = face.rect.x - Math.round(span.min - block.own.minX) - block.entry.glyph.wordX
      return spanFill(innerGradient.stops, left, 0, left + sheet.wordWidth, 0)
    }
    if (options.customInternal) return options.internalColour
    return options.customEdge ? options.edgeColour : `rgba(0, 0, 0, ${1 - options.internalBrightness / 100})`
  }

  const tiles = painted.tiles ? ctx.createPattern(painted.tiles, "repeat") : null
  const lines = tiles || !packed.length ? null : canvasOf(Math.max(...packed.map(face => face.rect.width)) * R, Math.max(...packed.map(face => face.rect.height)) * R)

  function drawLine(row, { x, y, width, height }) {
    lines.ctx.putImageData(row, 0, 0)
    ctx.drawImage(lines.canvas, 0, 0, row.width, row.height, x * SCALE, y * SCALE, width * SCALE, height * SCALE)
  }

  function tile(rect, column = 0) {
    tiles.setTransform(new DOMMatrix().translate((rect.x - column) * SCALE, rect.y * SCALE).scale(SCALE / R))
    ctx.fillStyle = tiles
    ctx.fillRect(rect.x * SCALE, rect.y * SCALE, rect.width * SCALE, rect.height * SCALE)
  }

  for (const face of packed) {
    const block = blockOf.get(face.glyph)
    const { entry } = block
    if (!entry) continue
    const { x, y, width, height } = face.rect
    if (face.kind === "side") {
      const span = extent(face.points, 1)
      const west = face.name === "west"
      const column = entry.x + Math.round(face.points[0][0] - block.own.minX) - (west ? 0 : 1)
      const row = entry.top + Math.round(block.own.maxY - span.max)
      if (tiles) {
        tile(face.rect)
        const totals = totalsOf(painted.tiles)
        const whole = Math.floor(width * SCALE / totals.width)
        const rest = width * SCALE % totals.width
        for (let py = 0; py < height * SCALE; py++) {
          const start = (py % totals.height) * (totals.width + 1) * 4
          for (let channel = 0; channel < 4; channel++) sideSum[channel] += whole * totals.sums[start + totals.width * 4 + channel] + totals.sums[start + rest * 4 + channel]
        }
      } else {
        const line = cornerPixels(painted, west ? column * R : (column + 1) * R - 1, row * R, height * R, true, west ? 1 : -1)
        drawLine(line, face.rect)
        const repeat = width * SCALE * SCALE / R
        for (let i = 0; i < line.data.length; i += 4) {
          if (line.data[i + 3] < 128) continue
          sideSum[0] += line.data[i] * repeat
          sideSum[1] += line.data[i + 1] * repeat
          sideSum[2] += line.data[i + 2] * repeat
          sideSum[3] += repeat
        }
      }
      shadeFace(face.rect, sideFill(face, block, span), options.sideFade, x * SCALE, (x + width) * SCALE, true)
      if (options.sideFade === null && sideGradient && sideGradient.direction !== "along") addGradient(face.rect, [0, y + span.max - shared.minY], [0, y + span.max - shared.maxY], sideGradient.stops)
      continue
    }
    const span = extent(face.points, 0)
    const column = entry.x + Math.round(span.min - block.own.minX)
    const front = face.kind === "top" ? (y + height) * SCALE : y * SCALE
    const back = face.kind === "top" ? y * SCALE : (y + height) * SCALE
    const level = extent(face.points, 1).min
    const row = entry.top + Math.round(block.own.maxY - level) - (face.kind === "top" ? 0 : 1)
    const edge = face.kind === "top" ? row * R : (row + 1) * R - 1
    if (tiles) tile(face.rect, painted.tilesAcrossLine ? column - entry.x + entry.glyph.lineX : 0)
    else drawLine(cornerPixels(painted, column * R, edge, width * R, false, face.kind === "top" ? 1 : -1), face.rect)
    shadeFace(face.rect, innerFill(face, block, span, level), options.internalFade, back, front, false)
    if (options.internalFade === null && innerGradient && innerGradient.direction !== "up") {
      const start = x - Math.round(span.min - block.own.minX) - entry.glyph.wordX
      addGradient(face.rect, [start, 0], [start + sheet.wordWidth, 0], innerGradient.stops)
    }
  }

  if (swatch) {
    ctx.fillStyle = painted.border
    ctx.fillRect(swatch.x * SCALE, swatch.y * SCALE, SWATCH * SCALE, SWATCH * SCALE)
  }

  const side = sideSum[3] ? hexOf(sideSum.slice(0, 3).map(value => value / sideSum[3] * options.sideBrightness / 100)) : null
  function gradientFace({ x, y, entry, bounds, own, width }) {
    const shiftX = x - entry.x
    const shiftY = y + depth + bounds.maxY - own.maxY - entry.top
    const { from, to } = painted.gradient.ends(entry)
    return { left: x * SCALE, top: (y + depth) * SCALE, right: (x + width) * SCALE, bottom: (y + depth + bounds.height) * SCALE, from: [(from[0] + shiftX) * SCALE, (from[1] + shiftY) * SCALE], to: [(to[0] + shiftX) * SCALE, (to[1] + shiftY) * SCALE] }
  }

  for (const { x, y, width, bounds, entry } of blocks) {
    if (!entry) continue
    const bottomStrip = y + depth + bounds.height
    if (painted.fade !== null) {
      addFade(x * SCALE, y * SCALE, (x + width) * SCALE, (y + depth) * SCALE, [0, (y + depth) * SCALE], [0, y * SCALE], painted.fade)
      addFade(x * SCALE, bottomStrip * SCALE, (x + width) * SCALE, (bottomStrip + depth) * SCALE, [0, bottomStrip * SCALE], [0, (bottomStrip + depth) * SCALE], painted.fade)
    } else if (options.customEdge && options.edgeFill === "gradient") {
      const stops = gradientStops(options.edgeStops, options.edgeSmooth)
      const start = x - entry.glyph.wordX
      for (const top of [y, bottomStrip]) addGradient({ x, y: top, width, height: depth }, [start, 0], [start + sheet.wordWidth, 0], stops)
    }
  }
  const frontFaces = painted.gradient ? blocks.filter(block => block.entry).map(block => ({ ...gradientFace(block), stops: painted.gradient.stops })) : []
  const gradient = frontFaces.length || gradientFaces.length ? { faces: frontFaces.concat(gradientFaces) } : null
  const areaOf = (x, y, width, height) => ({ left: x * SCALE, top: y * SCALE, right: (x + width) * SCALE, bottom: (y + height) * SCALE })
  const panels = blocks.filter(block => block.entry).flatMap(({ x, y, width, bounds }) => [areaOf(x, y, width, depth), areaOf(x, y + depth, width, bounds.height), areaOf(x, y + depth + bounds.height, width, depth)])
  return { canvas, units, swatch, side, labels, gradient, fades, panels }
}
