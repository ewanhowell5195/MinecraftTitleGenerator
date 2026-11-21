import { fadeStops, fillPattern, linearGradient, surface } from "../canvas.js"
import { hexOf, packed as packedColour, rgbOf } from "../../core/colour.js"
import { gradientStops, stopColour } from "../colourStops.js"
import { clamp } from "../../core/maths.js"
import { extent } from "./plan.js"
import { SWATCH } from "./pages.js"
import { drawRuns } from "../paint/coverBake.js"
import { fadeCurves, keepStrips } from "./curveFade.js"

const INSET = 0.125
const CORNER_SAMPLE = 3
const SIMILAR = 24

const tileTotals = new WeakMap()
const drawnLineCache = new WeakMap()
const LINE_CACHE = 4

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

function cornerPixels(painted, x, y, count, vertical, step, scale) {
  const { data, width, height } = painted.facePixels()
  const skip = Math.max(1, Math.round(painted.edge * scale))
  const reach = painted.edgeOnly ? 0 : CORNER_SAMPLE * scale
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

function inside(value, start, size) {
  return clamp(value, start, start + Math.max(1, size) - 1)
}

function faceGradient(custom, fill, stops, smooth, direction) {
  return custom && fill === "gradient" ? { stops: gradientStops(stops, smooth), direction } : null
}

function pixelRect({ x, y, sx, sy }, width, height) {
  return { x, y, width: Math.round(width * sx), height: Math.round(height * sy) }
}

function areaOf({ x, y, width, height }) {
  return { left: x, top: y, right: x + width, bottom: y + height }
}

export function mapFaces(plan, page, options, faded) {
  const half = plan.depth / 2
  const chosen = new Set(page.indexes)
  const swatch = page.swatch
  for (const block of plan.blocks) {
    if (!chosen.has(block.glyph)) continue
    const { up, front, down } = page.regions.get(block.glyph)
    const { own: bounds } = block
    for (const face of block.group) {
      if (face.extra) continue
      face.page = page
      const points = face.mesh ? face.points.map(point => [clamp(point[0], bounds.minX + INSET, bounds.maxX - INSET), clamp(point[1], bounds.minY + INSET, bounds.maxY - INSET), clamp(point[2], INSET - half, half - INSET)]) : face.points
      if (face.kind === "top") face.uvs = points.map(point => [up.x + (point[0] - bounds.minX) * up.sx, up.y + (half + point[2]) * up.sy])
      else if (face.kind === "bottom") face.uvs = points.map(point => [down.x + (point[0] - bounds.minX) * down.sx, down.y + (half - point[2]) * down.sy])
      else face.uvs = points.map(point => [front.x + (point[0] - bounds.minX) * front.sx, front.y + (bounds.maxY - point[1]) * front.sy])
    }
  }
  for (const run of plan.runs) {
    if (!chosen.has(run.glyph)) continue
    const span = extent(run.points, run.kind === "side" ? 1 : 0)
    const { x, y, sx, sy } = page.runs.get(run)
    const width = run.length ?? run.width
    const height = run.height
    const within = run.faces[0].mesh ? (value, size) => clamp(value, INSET, size - INSET) : value => value
    for (const face of run.faces) {
      face.page = page
      if (face.arc) face.uvs = face.points.map((point, corner) => [x + within(face.along[corner < 2 ? 0 : 1], width) * sx, y + within(run.kind === "top" ? half + point[2] : half - point[2], height) * sy])
      else if (run.kind === "side") face.uvs = face.points.map(point => [x + within(half + point[2], width) * sx, y + within(span.max - point[1], height) * sy])
      else face.uvs = face.points.map(point => [x + within(point[0] - span.min, width) * sx, y + within(run.kind === "top" ? half + point[2] : half - point[2], height) * sy])
    }
  }
  const edges = plan.faces.filter(face => chosen.has(face.glyph) && (face.kind === "side" ? !options.sideFaces : face.kind === "front" ? faded : face.internal && !options.internalFaces))
  for (const face of edges) {
    face.page = page
    face.uvs = [[swatch.x, swatch.y], [swatch.x, swatch.y + SWATCH * swatch.scale], [swatch.x + SWATCH * swatch.scale, swatch.y + SWATCH * swatch.scale], [swatch.x + SWATCH * swatch.scale, swatch.y]]
  }
  return edges.length > 0
}

export function finishAtlas(plan, page, painted, options) {
  const { depth, blocks, runs, shared } = plan
  const canvas = painted.canvas
  const ctx = canvas.getContext("2d")
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  const chosen = new Set(page.indexes)
  const own = blocks.filter(block => chosen.has(block.glyph))
  const packed = runs.filter(run => chosen.has(run.glyph))
  keepStrips(ctx, own.flatMap(block => {
    const { up, down } = page.regions.get(block.glyph)
    return [pixelRect(up, block.own.width, depth), pixelRect(down, block.own.width, depth)]
  }), options.fadeCurves)
  function clearRuns(target) {
    for (const run of packed) {
      const { x, y, width, height } = page.runs.get(run)
      target.clearRect(x, y, width, height)
    }
  }
  clearRuns(ctx)
  const covered = painted.coverRuns
  if (covered) drawRuns(ctx, packed.map(run => page.runs.get(run)), covered)
  const blockOf = new Map(own.map(block => [block.glyph, block]))
  const entryOf = block => page.glyphs[block.char] ?? null
  const swatch = page.swatch
  let sideSum = [0, 0, 0, 0]

  function glyphOrigin(block, region) {
    return [region.x + (block.rect.minX - block.own.minX) * region.sx, region.y + (block.own.maxY - block.rect.maxY) * region.sy]
  }

  const swatched = mapFaces(plan, page, options, painted.fade !== null)

  function sourceStrip(block, kind) {
    const regions = page.regions.get(block.glyph)
    return kind === "top" ? regions.up : regions.down
  }

  const extraRuns = packed.filter(run => run.region === "edge")

  function copyStrips(target, source) {
    for (const run of extraRuns) {
      const block = blockOf.get(run.glyph)
      if (!entryOf(block)) continue
      const from = sourceStrip(block, run.kind)
      const column = Math.round(extent(run.points, 0).min - block.own.minX)
      const at = page.runs.get(run)
      target.drawImage(source, from.x + column * from.sx, from.y, run.width * from.sx, depth * from.sy, at.x, at.y, at.width, at.height)
    }
  }

  function snapshot() {
    const copy = surface(canvas.width, canvas.height)
    copy.ctx.drawImage(canvas, 0, 0)
    return copy.canvas
  }

  const wrapped = []

  function labels() {
    const target = surface(canvas.width, canvas.height, { willReadFrequently: true })
    const source = painted.labels()
    target.ctx.drawImage(source, 0, 0)
    clearRuns(target.ctx)
    copyStrips(target.ctx, source)
    const data = target.ctx.getImageData(0, 0, canvas.width, canvas.height).data
    for (const { rect, scale, width, height, glyph, side, line, from } of wrapped) {
      for (const wrap of painted.wraps) {
        const alpha = wrap.label === null ? null : wrap.alpha(glyph, side, line, from, width, height, scale)
        if (!alpha) continue
        const columns = width * scale
        const rows = height * scale
        for (let py = 0; py < rect.height; py++) {
          for (let px = 0; px < rect.width; px++) {
            if (alpha[Math.floor(py * rows / rect.height) * columns + Math.floor(px * columns / rect.width)] >= 0.5) data[((rect.y + py) * canvas.width + rect.x + px) * 4 + (wrap.label >> 3)] |= 1 << (wrap.label & 7)
          }
        }
      }
    }
    return data
  }

  function crackShapes() {
    const found = new Map()
    function add(label, triangles, [x, y], sx, sy) {
      if (!found.has(label)) found.set(label, [])
      for (const points of triangles) found.get(label).push(points.map(([px, py]) => [x + px * sx, y + py * sy]))
    }
    for (const wrap of painted.wraps) {
      if (wrap.label === null) continue
      for (const block of own) {
        const entry = entryOf(block)
        if (!entry) continue
        const { glyph } = entry
        const { up, front, down } = page.regions.get(block.glyph)
        add(wrap.label, wrap.front(glyph), glyphOrigin(block, front), front.sx, front.sy)
        add(wrap.label, wrap.triangles(glyph, "up", 0, 0, glyph.width, depth), glyphOrigin(block, up), up.sx, up.sy)
        add(wrap.label, wrap.triangles(glyph, "down", glyph.height, 0, glyph.width, depth), glyphOrigin(block, down), down.sx, down.sy)
      }
      for (const { rect, sx, sy, width, height, glyph, side, line, from } of wrapped) add(wrap.label, wrap.triangles(glyph, side, line, from, width, height), [rect.x, rect.y], sx, sy)
    }
    for (const wave of painted.waves ?? []) {
      for (const block of own) {
        const entry = entryOf(block)
        const outline = entry && wave.front(entry.glyph)
        if (!outline) continue
        const { front } = page.regions.get(block.glyph)
        add(wave.label, [outline], glyphOrigin(block, front), front.sx, front.sy)
      }
    }
    return found
  }

  const borderAt = opacity => painted.border.replace("rgb(", "rgba(").replace(")", `, ${opacity})`)
  const clear = borderAt(0)
  const fades = []
  const gradientFaces = []

  function addFade(left, top, right, bottom, near, far, amount, opacity) {
    if (amount < 1) fades.push({ left, top, right, bottom, near, far, amount, opacity, colour: painted.borderColour })
  }

  function addGradient({ x, y, width, height }, from, to, stops) {
    gradientFaces.push({ left: x, top: y, right: x + width, bottom: y + height, from, to, stops: stops.map(({ position, colour }) => ({ position, colour: packedColour(rgbOf(colour), 0) })) })
  }

  function fillRects(fill, rects) {
    ctx.fillStyle = fill
    ctx.beginPath()
    for (const { x, y, width, height } of rects) ctx.rect(x, y, width, height)
    ctx.fill()
  }

  function fadeGradient(fade, opacity, back, front, horizontal) {
    const stops = fadeStops(borderAt(opacity), clear, fade)
    return horizontal ? linearGradient(ctx, front, 0, back, 0, stops) : linearGradient(ctx, 0, front, 0, back, stops)
  }

  function wrapFaces() {
    for (const { rect, scale, width, height, glyph, side, line, from } of wrapped) {
      for (const wrap of painted.wraps) {
        const drawn = wrap.face(glyph, side, line, from, width, height, scale)
        if (!drawn) continue
        ctx.globalCompositeOperation = wrap.blend
        ctx.globalAlpha = wrap.opacity
        ctx.drawImage(drawn, rect.x, rect.y, rect.width, rect.height)
      }
    }
    ctx.globalAlpha = 1
  }

  function shadeFaces(shades) {
    const fills = new Map()
    const gradients = new Map()
    for (const [rect, fill, amount, opacity, back, front, horizontal] of shades) {
      if (!fills.has(fill)) fills.set(fill, [])
      fills.get(fill).push(rect)
      if (amount === null) continue
      const fade = clamp(amount, 0, 1)
      const key = [fade, opacity, back, front, horizontal].join()
      if (!gradients.has(key)) gradients.set(key, { gradient: fadeGradient(fade, opacity, back, front, horizontal), rects: [] })
      gradients.get(key).rects.push(rect)
      const { x, y, width, height } = rect
      if (typeof fill === "string") addFade(x, y, x + width, y + height, horizontal ? [front, 0] : [0, front], horizontal ? [back, 0] : [0, back], fade, opacity)
    }
    ctx.globalCompositeOperation = "source-atop"
    for (const [fill, rects] of fills) fillRects(fill, rects)
    wrapFaces()
    ctx.globalCompositeOperation = "source-atop"
    for (const { gradient, rects } of gradients.values()) fillRects(gradient, rects)
    ctx.globalCompositeOperation = "source-over"
  }

  const sideGradient = faceGradient(options.customSide, options.sideFill, options.sideStops, options.sideSmooth, options.sideDirection)
  const innerGradient = options.customInternal ? faceGradient(true, options.internalFill, options.internalStops, options.internalSmooth, options.internalDirection) : faceGradient(options.customEdge, options.edgeFill, options.edgeStops, options.edgeSmooth, "along")
  const wordWidth = page.wordWidth

  function heightOf(y) {
    return clamp((y - shared.minY) / (shared.maxY - shared.minY), 0, 1)
  }

  function sideFill(run, rect, sy, block, span) {
    if (!options.customSide) return `rgba(0, 0, 0, ${1 - options.sideBrightness / 100})`
    if (!sideGradient) return options.sideColour
    if (sideGradient.direction === "along") return stopColour(sideGradient.stops, clamp((Math.round(run.points[0][0] - block.own.minX) + entryOf(block).glyph.wordX) / wordWidth, 0, 1))
    return linearGradient(ctx, 0, rect.y + (span.max - shared.minY) * sy, 0, rect.y + (span.max - shared.maxY) * sy, sideGradient.stops)
  }

  function innerFill(rect, sx, block, span, level) {
    if (innerGradient?.direction === "up") return stopColour(innerGradient.stops, heightOf(level))
    if (innerGradient) {
      const left = rect.x - (Math.round(span.min - block.own.minX) + entryOf(block).glyph.wordX) * sx
      return linearGradient(ctx, left, 0, left + wordWidth * sx, 0, innerGradient.stops)
    }
    if (options.customInternal) return options.internalColour
    return options.customEdge ? options.edgeColour : `rgba(0, 0, 0, ${1 - options.internalBrightness / 100})`
  }

  const shades = []
  const lineDraws = []

  function drawnLines() {
    const pixels = painted.facePixels()
    const key = JSON.stringify([painted.edge, painted.edgeOnly, lineDraws.map(({ from, rect, repeat }) => [from, rect.x, rect.y, rect.width, rect.height, repeat])])
    if (!drawnLineCache.has(pixels)) drawnLineCache.set(pixels, new Map())
    const known = drawnLineCache.get(pixels)
    if (known.has(key)) return known.get(key)
    const lines = []
    const sum = [0, 0, 0, 0]
    for (const { from, rect, repeat } of lineDraws) {
      const row = cornerPixels(painted, ...from)
      const source = new Uint32Array(row.data.buffer, row.data.byteOffset, row.width * row.height)
      const image = new ImageData(rect.width, rect.height)
      const words = new Uint32Array(image.data.buffer)
      const across = new Int32Array(rect.width)
      for (let dx = 0; dx < rect.width; dx++) across[dx] = Math.floor(dx * row.width / rect.width)
      for (let dy = 0; dy < rect.height; dy++) {
        const start = Math.floor(dy * row.height / rect.height) * row.width
        for (let dx = 0; dx < rect.width; dx++) words[dy * rect.width + dx] = source[start + across[dx]]
      }
      lines.push({ image, rect })
      if (!repeat) continue
      for (let i = 0; i < row.data.length; i += 4) {
        if (row.data[i + 3] < 128) continue
        sum[0] += row.data[i] * repeat
        sum[1] += row.data[i + 1] * repeat
        sum[2] += row.data[i + 2] * repeat
        sum[3] += repeat
      }
    }
    const made = { lines, sideSum: sum }
    if (known.size >= LINE_CACHE) known.delete(known.keys().next().value)
    known.set(key, made)
    return made
  }

  function tile(rect, sx, sy, column = 0) {
    fillPattern(ctx, painted.tiles, new DOMMatrix().translate(rect.x - column * sx, rect.y).scale(sx / painted.tileScale, sy / painted.tileScale))
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }

  const stripStops = painted.fade === null && options.customEdge && options.edgeFill === "gradient" ? gradientStops(options.edgeStops, options.edgeSmooth) : null
  for (const run of packed) {
    const block = blockOf.get(run.glyph)
    const entry = entryOf(block)
    if (!entry) continue
    const at = page.runs.get(run)
    const sx = run.length ? at.width / run.width : at.sx
    const sy = at.sy
    const scale = Math.max(at.sx, sy)
    const rect = { x: at.x, y: at.y, width: at.width, height: at.height }
    const { front } = page.regions.get(block.glyph)
    const f = front.sx
    const [fx, fy] = glyphOrigin(block, front)
    if (run.kind === "side") {
      const span = extent(run.points, 1)
      const west = run.name === "west"
      const column = inside(Math.round(run.points[0][0] - block.own.minX) - (west ? 0 : 1), 0, entry.width)
      const row = inside(Math.round(block.own.maxY - span.max), 0, entry.height)
      if (painted.tiles && !covered) {
        tile(rect, sx, sy)
        const totals = totalsOf(painted.tiles)
        const tileWidth = Math.round(run.width * painted.tileScale)
        const whole = Math.floor(tileWidth / totals.width)
        const rest = tileWidth % totals.width
        for (let py = 0; py < run.height * painted.tileScale; py++) {
          const start = (py % totals.height) * (totals.width + 1) * 4
          for (let channel = 0; channel < 4; channel++) sideSum[channel] += whole * totals.sums[start + totals.width * 4 + channel] + totals.sums[start + rest * 4 + channel]
        }
      } else if (!covered) lineDraws.push({ from: [west ? fx + column * f : fx + (column + 1) * f - 1, fy + row * f, run.height * f, true, west ? 1 : -1, f], rect, repeat: rect.width * rect.height / (run.height * f) })
      shades.push([rect, sideFill(run, rect, sy, block, span), options.sideFade, options.sideFadeOpacity ?? 1, rect.x, rect.x + rect.width, true])
      wrapped.push({ rect, scale, sx, sy, width: run.width, height: run.height, glyph: entry.glyph, side: west ? "left" : "right", line: Math.round(run.points[0][0] - block.own.minX), from: Math.round(block.own.maxY - span.max) })
      if (options.sideFade === null && sideGradient && sideGradient.direction !== "along") addGradient(rect, [0, rect.y + (span.max - shared.minY) * sy], [0, rect.y + (span.max - shared.maxY) * sy], sideGradient.stops)
      continue
    }
    const span = extent(run.points, 0)
    const column = inside(Math.round(span.min - block.own.minX), 0, entry.width)
    const near = run.kind === "top" ? rect.y + rect.height : rect.y
    const far = run.kind === "top" ? rect.y : rect.y + rect.height
    const level = extent(run.points, 1).min
    const strip = { rect, scale, sx, sy, width: run.width, height: run.height, glyph: entry.glyph, side: run.kind === "top" ? "up" : "down", line: Math.round(block.own.maxY - level), from: Math.round(span.min - block.own.minX) }
    if (run.region === "edge") {
      wrapped.push({ ...strip, extra: true })
      const start = rect.x - (strip.from + entry.glyph.wordX) * sx
      if (painted.fade !== null) addFade(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height, [0, near], [0, far], painted.fade, painted.fadeOpacity)
      else if (stripStops) addGradient(rect, [start, 0], [start + wordWidth * sx, 0], stripStops)
      continue
    }
    const row = inside(Math.round(block.own.maxY - level) - (run.kind === "top" ? 0 : 1), 0, entry.height)
    const edge = run.kind === "top" ? fy + row * f : fy + (row + 1) * f - 1
    if (painted.tiles && !covered) tile(rect, sx, sy, painted.tilesAcrossLine ? column + entry.glyph.lineX : 0)
    else if (!covered) lineDraws.push({ from: [fx + column * f, edge, run.width * f, false, run.kind === "top" ? 1 : -1, f], rect, repeat: 0 })
    shades.push([rect, innerFill(rect, sx, block, span, level), options.internalFade, options.internalFadeOpacity ?? 1, far, near, false])
    wrapped.push(strip)
    if (options.internalFade === null && innerGradient && innerGradient.direction !== "up") {
      const start = rect.x - (Math.round(span.min - block.own.minX) + entry.glyph.wordX) * sx
      addGradient(rect, [start, 0], [start + wordWidth * sx, 0], innerGradient.stops)
    }
  }

  if (lineDraws.length) {
    const drawn = drawnLines()
    for (let channel = 0; channel < 4; channel++) sideSum[channel] += drawn.sideSum[channel]
    for (const { image, rect } of drawn.lines) ctx.putImageData(image, rect.x, rect.y)
  }
  if (!covered || options.customEdge) {
    copyStrips(ctx, painted.stripSource ?? (extraRuns.length ? snapshot() : canvas))
    for (const edge of painted.edgeFaces ?? []) {
      ctx.globalCompositeOperation = edge.blend
      ctx.globalAlpha = edge.opacity
      for (const { rect, sx, sy, width, height, glyph, side, line, from, extra } of wrapped) {
        if (extra) ctx.drawImage(edge.face(glyph, side, line, from, width, height, Math.max(sx, sy)), rect.x, rect.y, rect.width, rect.height)
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
  }
  for (const wrap of painted.sideWraps) {
    ctx.globalCompositeOperation = wrap.blend
    ctx.globalAlpha = wrap.opacity
    for (const { rect, scale, width, height, glyph, side, line, from, extra } of wrapped) {
      if (extra) continue
      const drawn = wrap.face(glyph, side, line, from, width, height, scale)
      if (drawn) ctx.drawImage(drawn, rect.x, rect.y, rect.width, rect.height)
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  shadeFaces(shades)

  ctx.fillStyle = painted.border
  ctx.fillRect(swatch.x, swatch.y, SWATCH * swatch.scale, SWATCH * swatch.scale)
  if (options.fadeCurves) fadeCurves(ctx, plan.faces, options.rects, chosen, options.reach, options.limits)

  const side = sideSum[3] ? hexOf(sideSum.slice(0, 3).map(value => value / sideSum[3] * options.sideBrightness / 100)) : null
  const edgeStops = stripStops
  const panels = []
  const frontFaces = []
  for (const block of own) {
    const entry = entryOf(block)
    if (!entry) continue
    const { up, front, down } = page.regions.get(block.glyph)
    const upRect = pixelRect(up, block.own.width, depth)
    const frontRect = pixelRect(front, block.own.width, block.own.height)
    const downRect = pixelRect(down, block.own.width, depth)
    panels.push(areaOf(upRect), areaOf(frontRect), areaOf(downRect))
    if (painted.fade !== null) {
      addFade(upRect.x, upRect.y, upRect.x + upRect.width, upRect.y + upRect.height, [0, upRect.y + upRect.height], [0, upRect.y], painted.fade, painted.fadeOpacity)
      addFade(downRect.x, downRect.y, downRect.x + downRect.width, downRect.y + downRect.height, [0, downRect.y], [0, downRect.y + downRect.height], painted.fade, painted.fadeOpacity)
    } else if (edgeStops) {
      for (const [rect, region] of [[upRect, up], [downRect, down]]) {
        const start = glyphOrigin(block, region)[0] - entry.glyph.wordX * region.sx
        addGradient(rect, [start, 0], [start + wordWidth * region.sx, 0], edgeStops)
      }
    }
    if (painted.gradient) {
      const { from, to } = painted.gradient.ends(entry)
      const region = entry.regions.front
      const u0 = region.x - region.u0 * region.sx
      const v0 = region.y - region.v0 * region.sy
      frontFaces.push({ ...areaOf(frontRect), from: [u0 + from[0] * region.sx, v0 + from[1] * region.sy], to: [u0 + to[0] * region.sx, v0 + to[1] * region.sy], stops: painted.gradient.stops })
    }
  }
  const gradient = frontFaces.length || gradientFaces.length ? { faces: frontFaces.concat(gradientFaces) } : null
  return { canvas, swatch, swatched, side, labels, crackShapes, gradient, fades, panels }
}
