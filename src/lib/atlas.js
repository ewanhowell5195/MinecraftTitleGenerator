import { fadeStops, fillPattern, linearGradient, surface } from "./canvas.js"
import { hexOf, packed as packedColour, rgbOf } from "./colour.js"
import { faceDepth, gradientStops, stopColour } from "./material.js"
import { clamp } from "./maths.js"
import { R } from "./paint.js"

export const MAX_DETAIL = 4
export const REGION_KINDS = ["front", "edge", "internal", "side"]

const GAP = 2
const SWATCH = 1
const INSET = 0.125
const CORNER_SAMPLE = 3
const SIMILAR = 24
const WIDTH_STEPS = 48

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
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max }
}

function runsOf(list) {
  const runs = new Map()
  for (const face of list) {
    const key = face.run ?? face
    if (!runs.has(key)) runs.set(key, { kind: face.kind, name: face.name, glyph: face.glyph, faces: [], points: [] })
    runs.get(key).faces.push(face)
    runs.get(key).points.push(...face.points)
  }
  return Array.from(runs.values())
}

export function planAtlas(faces, options) {
  const depth = faceDepth(options.depth)
  const groups = new Map()
  for (const face of faces) {
    if (face.internal || face.kind === "side") continue
    if (!groups.has(face.glyph)) groups.set(face.glyph, [])
    groups.get(face.glyph).push(face)
  }
  const blocks = Array.from(groups.entries()).map(([index, group]) => {
    const rect = options.rects[index]
    const bounds = group[0].mesh ? rect : boundsOf(group)
    const minX = Math.min(bounds.minX, rect.minX)
    const maxX = Math.max(bounds.maxX, rect.maxX)
    const minY = Math.min(bounds.minY, rect.minY)
    const maxY = Math.max(bounds.maxY, rect.maxY)
    const own = { minX, maxX, minY, maxY, width: Math.max(1, Math.round(maxX - minX)), height: Math.max(1, Math.round(maxY - minY)) }
    return { glyph: index, group, own, rect, char: options.chars[index], spaces: options.spaces[index] }
  })

  const extras = []
  for (const block of blocks) {
    for (const kind of ["top", "bottom"]) {
      const outward = kind === "top" ? -1 : 1
      const list = block.group.filter(face => face.kind === kind).map(face => ({ face, span: extent(face.points, 0), level: extent(face.points, 1)[kind === "top" ? "max" : "min"] })).sort((a, b) => (a.level - b.level) * outward)
      const taken = []
      for (const item of list) {
        if (taken.some(other => other.level !== item.level && other.span.min < item.span.max && item.span.min < other.span.max)) {
          item.face.extra = true
          extras.push(item.face)
        } else taken.push(item)
      }
    }
  }

  const runs = runsOf(extras).map(run => ({ ...run, region: "edge", width: extent(run.points, 0).size, height: depth }))
  for (const kind of ["top", "bottom"]) {
    const members = options.internalFaces ? runsOf(faces.filter(face => face.internal && face.kind === kind)) : []
    runs.push(...members.map(run => ({ ...run, region: "internal", width: extent(run.points, 0).size, height: depth })))
  }
  const sides = options.sideFaces ? runsOf(faces.filter(face => face.kind === "side")) : []
  runs.push(...sides.map(run => ({ ...run, region: "side", width: depth, height: extent(run.points, 1).size })))
  const shared = { minY: Math.min(...blocks.map(block => block.own.minY)), maxY: Math.max(...blocks.map(block => block.own.maxY)) }
  const glyphs = Array.from(new Set(faces.map(face => face.glyph))).sort((a, b) => a - b)
  return { faces, blocks, runs, depth, shared, glyphs, spaces: options.spaces }
}

export function regionScales(details) {
  return Object.fromEntries(REGION_KINDS.map(kind => [kind, R * (details?.[kind] ?? 1)]))
}

function blockSize(block, depth, scales) {
  return { width: Math.ceil(block.own.width * Math.max(scales.front, scales.edge)), height: depth * scales.edge * 2 + block.own.height * scales.front }
}

function runSize(run, scales) {
  const scale = scales[run.region]
  return { width: Math.ceil(run.width * scale), height: Math.ceil(run.height * scale), scale }
}

function arrange(items, width) {
  let x = 0
  let y = 0
  let row = 0
  let wide = 0
  for (const item of items) {
    if (x > 0 && x + item.width > width) {
      x = 0
      y += row + GAP
      row = 0
    }
    item.x = x
    item.y = y
    x += item.width + GAP
    row = Math.max(row, item.height)
    wide = Math.max(wide, x - GAP)
  }
  return { width: Math.max(1, wide), height: Math.max(1, y + row) }
}

function itemsOf(plan, indexes, scales) {
  const chosen = new Set(indexes)
  const swatch = { swatch: true, width: SWATCH * R, height: SWATCH * R }
  const blocks = plan.blocks.filter(block => chosen.has(block.glyph)).map(block => ({ block, ...blockSize(block, plan.depth, scales) }))
  const runs = plan.runs.filter(run => chosen.has(run.glyph)).map(run => ({ run, ...runSize(run, scales) }))
  return [swatch].concat(blocks, runs).sort((a, b) => b.height - a.height || b.width - a.width)
}

function squarest(items, limit) {
  const widest = Math.max(...items.map(item => item.width))
  const area = items.reduce((sum, item) => sum + (item.width + GAP) * (item.height + GAP), 0)
  const most = Math.max(widest, Math.min(limit, items.reduce((sum, item) => sum + item.width + GAP, 0)))
  const tried = new Set([widest, most])
  for (let step = 0; step <= WIDTH_STEPS; step++) tried.add(Math.round(clamp(Math.sqrt(area) * (0.5 + step * 2 / WIDTH_STEPS), widest, most)))
  let best = null
  for (const width of tried) {
    const size = arrange(items, width)
    const side = Math.max(size.width, size.height)
    if (!best || side < best.side || side === best.side && size.width * size.height < best.width * best.height) best = { ...size, side, shelf: width }
  }
  return best
}

function fits(plan, indexes, scales, limit) {
  const best = squarest(itemsOf(plan, indexes, scales), limit)
  return best.width <= limit && best.height <= limit
}

export function pageGroups(plan, scales, limit) {
  const order = plan.glyphs
  const groups = []
  let start = 0
  while (start < order.length) {
    let low = 0
    let high = order.length - start
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(plan, order.slice(start, start + middle), scales, limit)) low = middle
      else high = middle - 1
    }
    if (!low) {
      const block = plan.blocks.find(item => item.glyph === order[start])
      const { width, height } = blockSize(block, plan.depth, scales)
      throw new Error(`one character's texture would be ${width}x${height}, over the ${limit} limit`)
    }
    let count = low
    if (start + count < order.length) {
      const word = Array.from({ length: count }, (_, at) => count - at).find(at => at > count / 2 && plan.spaces[order[start + at]] > 0)
      if (word) count = word
    }
    groups.push(order.slice(start, start + count))
    start += count
  }
  return groups.length ? groups : [[]]
}

export function layoutPage(plan, indexes, scales, sheet) {
  const items = itemsOf(plan, indexes, scales)
  const size = arrange(items, squarest(items, Infinity).shelf)
  const glyphs = {}
  const regions = new Map()
  const swatchItem = items.find(item => item.swatch)
  const swatch = { x: swatchItem.x, y: swatchItem.y, scale: R }
  const placedBlocks = new Map(items.filter(item => item.block).map(item => [item.block, item]))
  for (const block of plan.blocks) {
    const item = placedBlocks.get(block)
    if (!item) continue
    const up = { x: item.x, y: item.y, scale: scales.edge }
    const front = { x: item.x, y: item.y + plan.depth * scales.edge, scale: scales.front }
    const down = { x: item.x, y: front.y + block.own.height * scales.front, scale: scales.edge }
    regions.set(block.glyph, { up, front, down })
    const entry = sheet.glyphs[block.char]
    if (!entry) continue
    const u0 = entry.x + block.own.minX - block.rect.minX
    glyphs[block.char] = { ...entry, regions: { front: { ...front, u0, v0: entry.top + block.rect.maxY - block.own.maxY }, up: { ...up, u0, v0: entry.up }, down: { ...down, u0, v0: entry.down } } }
  }
  const placed = new Map(items.filter(item => item.run).map(item => [item.run, { x: item.x, y: item.y, width: item.width, height: item.height, scale: item.scale }]))
  const key = JSON.stringify([size.width, size.height, swatch, Object.values(glyphs).map(entry => [entry.char, entry.regions])])
  return { width: size.width, height: size.height, glyphs, regions, runs: placed, swatch, tallest: sheet.tallest, wordWidth: sheet.wordWidth, key, indexes }
}

export function layoutPages(plan, groups, scales, sheet) {
  return groups.map(indexes => layoutPage(plan, indexes, scales, sheet))
}

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

function pixelRect({ x, y, scale }, width, height) {
  return { x, y, width: Math.round(width * scale), height: Math.round(height * scale) }
}

function areaOf({ x, y, width, height }) {
  return { left: x, top: y, right: x + width, bottom: y + height }
}

export function finishAtlas(plan, page, painted, options) {
  const { depth, blocks, runs, shared } = plan
  const half = depth / 2
  const canvas = painted.canvas
  const ctx = canvas.getContext("2d")
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  const chosen = new Set(page.indexes)
  const own = blocks.filter(block => chosen.has(block.glyph))
  const packed = runs.filter(run => chosen.has(run.glyph))
  function clearRuns(target) {
    for (const run of packed) {
      const { x, y, width, height } = page.runs.get(run)
      target.clearRect(x, y, width, height)
    }
  }
  clearRuns(ctx)
  const blockOf = new Map(own.map(block => [block.glyph, block]))
  const entryOf = block => page.glyphs[block.char] ?? null
  const swatch = page.swatch
  let sideSum = [0, 0, 0, 0]

  function glyphOrigin(block, region) {
    return [region.x + (block.rect.minX - block.own.minX) * region.scale, region.y + (block.own.maxY - block.rect.maxY) * region.scale]
  }

  for (const block of own) {
    const { up, front, down } = page.regions.get(block.glyph)
    const { own: bounds } = block
    for (const face of block.group) {
      if (face.extra) continue
      face.page = page
      const points = face.mesh ? face.points.map(point => [clamp(point[0], bounds.minX + INSET, bounds.maxX - INSET), clamp(point[1], bounds.minY + INSET, bounds.maxY - INSET), clamp(point[2], INSET - half, half - INSET)]) : face.points
      if (face.kind === "top") face.uvs = points.map(point => [up.x + (point[0] - bounds.minX) * up.scale, up.y + (half + point[2]) * up.scale])
      else if (face.kind === "bottom") face.uvs = points.map(point => [down.x + (point[0] - bounds.minX) * down.scale, down.y + (half - point[2]) * down.scale])
      else face.uvs = points.map(point => [front.x + (point[0] - bounds.minX) * front.scale, front.y + (bounds.maxY - point[1]) * front.scale])
    }
  }

  for (const run of packed) {
    const span = extent(run.points, run.kind === "side" ? 1 : 0)
    const { x, y, scale } = page.runs.get(run)
    const width = run.width
    const height = run.height
    const within = run.faces[0].mesh ? (value, size) => clamp(value, INSET, size - INSET) : value => value
    for (const face of run.faces) {
      face.page = page
      if (run.kind === "side") face.uvs = face.points.map(point => [x + within(half + point[2], width) * scale, y + within(span.max - point[1], height) * scale])
      else face.uvs = face.points.map(point => [x + within(point[0] - span.min, width) * scale, y + within(run.kind === "top" ? half + point[2] : half - point[2], height) * scale])
    }
  }

  const edges = plan.faces.filter(face => chosen.has(face.glyph) && (face.kind === "side" ? !options.sideFaces : face.kind === "front" ? painted.fade !== null : face.internal && !options.internalFaces))
  for (const face of edges) {
    face.page = page
    face.uvs = [[swatch.x, swatch.y], [swatch.x, swatch.y + SWATCH * swatch.scale], [swatch.x + SWATCH * swatch.scale, swatch.y + SWATCH * swatch.scale], [swatch.x + SWATCH * swatch.scale, swatch.y]]
  }

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
      target.drawImage(source, from.x + column * from.scale, from.y, run.width * from.scale, depth * from.scale, at.x, at.y, at.width, at.height)
    }
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
        const columns = rect.width
        for (const [index, value] of alpha.entries()) {
          if (value >= 0.5) data[((rect.y + Math.floor(index / columns)) * canvas.width + rect.x + index % columns) * 4 + (wrap.label >> 3)] |= 1 << (wrap.label & 7)
        }
      }
    }
    return data
  }

  function crackShapes() {
    const found = new Map()
    function add(label, triangles, [x, y], scale) {
      if (!found.has(label)) found.set(label, [])
      for (const points of triangles) found.get(label).push(points.map(([px, py]) => [x + px * scale, y + py * scale]))
    }
    for (const wrap of painted.wraps) {
      if (wrap.label === null) continue
      for (const block of own) {
        const entry = entryOf(block)
        if (!entry) continue
        const { glyph } = entry
        const { up, front, down } = page.regions.get(block.glyph)
        add(wrap.label, wrap.front(glyph), glyphOrigin(block, front), front.scale)
        add(wrap.label, wrap.triangles(glyph, "up", 0, 0, glyph.width, depth), glyphOrigin(block, up), up.scale)
        add(wrap.label, wrap.triangles(glyph, "down", glyph.height, 0, glyph.width, depth), glyphOrigin(block, down), down.scale)
      }
      for (const { rect, scale, width, height, glyph, side, line, from } of wrapped) add(wrap.label, wrap.triangles(glyph, side, line, from, width, height), [rect.x, rect.y], scale)
    }
    return found
  }

  const clear = painted.border.replace("rgb(", "rgba(").replace(")", ", 0)")
  const fades = []
  const gradientFaces = []

  function addFade(left, top, right, bottom, near, far, amount) {
    if (amount < 1) fades.push({ left, top, right, bottom, near, far, amount, colour: painted.borderColour })
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

  function fadeGradient(fade, back, front, horizontal) {
    const stops = fadeStops(painted.border, clear, fade)
    return horizontal ? linearGradient(ctx, front, 0, back, 0, stops) : linearGradient(ctx, 0, front, 0, back, stops)
  }

  function wrapFaces() {
    for (const { rect, scale, width, height, glyph, side, line, from } of wrapped) {
      for (const wrap of painted.wraps) {
        const drawn = wrap.face(glyph, side, line, from, width, height, scale)
        if (!drawn) continue
        ctx.globalCompositeOperation = wrap.blend
        ctx.globalAlpha = wrap.opacity
        ctx.drawImage(drawn, rect.x, rect.y)
      }
    }
    ctx.globalAlpha = 1
  }

  function shadeFaces(shades) {
    const fills = new Map()
    const gradients = new Map()
    for (const [rect, fill, amount, back, front, horizontal] of shades) {
      if (!fills.has(fill)) fills.set(fill, [])
      fills.get(fill).push(rect)
      if (amount === null) continue
      const fade = clamp(amount, 0, 1)
      const key = [fade, back, front, horizontal].join()
      if (!gradients.has(key)) gradients.set(key, { gradient: fadeGradient(fade, back, front, horizontal), rects: [] })
      gradients.get(key).rects.push(rect)
      const { x, y, width, height } = rect
      if (typeof fill === "string") addFade(x, y, x + width, y + height, horizontal ? [front, 0] : [0, front], horizontal ? [back, 0] : [0, back], fade)
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

  function sideFill(run, rect, scale, block, span) {
    if (!options.customSide) return `rgba(0, 0, 0, ${1 - options.sideBrightness / 100})`
    if (!sideGradient) return options.sideColour
    if (sideGradient.direction === "along") return stopColour(sideGradient.stops, clamp((Math.round(run.points[0][0] - block.own.minX) + entryOf(block).glyph.wordX) / wordWidth, 0, 1))
    return linearGradient(ctx, 0, rect.y + (span.max - shared.minY) * scale, 0, rect.y + (span.max - shared.maxY) * scale, sideGradient.stops)
  }

  function innerFill(rect, scale, block, span, level) {
    if (innerGradient?.direction === "up") return stopColour(innerGradient.stops, heightOf(level))
    if (innerGradient) {
      const left = rect.x - (Math.round(span.min - block.own.minX) + entryOf(block).glyph.wordX) * scale
      return linearGradient(ctx, left, 0, left + wordWidth * scale, 0, innerGradient.stops)
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

  function tile(rect, scale, column = 0) {
    fillPattern(ctx, painted.tiles, new DOMMatrix().translate(rect.x - column * scale, rect.y).scale(scale / painted.tileScale))
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }

  const stripStops = painted.fade === null && options.customEdge && options.edgeFill === "gradient" ? gradientStops(options.edgeStops, options.edgeSmooth) : null
  for (const run of packed) {
    const block = blockOf.get(run.glyph)
    const entry = entryOf(block)
    if (!entry) continue
    const at = page.runs.get(run)
    const { scale } = at
    const rect = { x: at.x, y: at.y, width: at.width, height: at.height }
    const { front } = page.regions.get(block.glyph)
    const f = front.scale
    const [fx, fy] = glyphOrigin(block, front)
    if (run.kind === "side") {
      const span = extent(run.points, 1)
      const west = run.name === "west"
      const column = inside(Math.round(run.points[0][0] - block.own.minX) - (west ? 0 : 1), 0, entry.width)
      const row = inside(Math.round(block.own.maxY - span.max), 0, entry.height)
      if (painted.tiles) {
        tile(rect, scale)
        const totals = totalsOf(painted.tiles)
        const tileWidth = Math.round(run.width * painted.tileScale)
        const whole = Math.floor(tileWidth / totals.width)
        const rest = tileWidth % totals.width
        for (let py = 0; py < run.height * painted.tileScale; py++) {
          const start = (py % totals.height) * (totals.width + 1) * 4
          for (let channel = 0; channel < 4; channel++) sideSum[channel] += whole * totals.sums[start + totals.width * 4 + channel] + totals.sums[start + rest * 4 + channel]
        }
      } else lineDraws.push({ from: [west ? fx + column * f : fx + (column + 1) * f - 1, fy + row * f, run.height * f, true, west ? 1 : -1, f], rect, repeat: rect.width * rect.height / (run.height * f) })
      shades.push([rect, sideFill(run, rect, scale, block, span), options.sideFade, rect.x, rect.x + rect.width, true])
      wrapped.push({ rect, scale, width: run.width, height: run.height, glyph: entry.glyph, side: west ? "left" : "right", line: Math.round(run.points[0][0] - block.own.minX), from: Math.round(block.own.maxY - span.max) })
      if (options.sideFade === null && sideGradient && sideGradient.direction !== "along") addGradient(rect, [0, rect.y + (span.max - shared.minY) * scale], [0, rect.y + (span.max - shared.maxY) * scale], sideGradient.stops)
      continue
    }
    const span = extent(run.points, 0)
    const column = inside(Math.round(span.min - block.own.minX), 0, entry.width)
    const near = run.kind === "top" ? rect.y + rect.height : rect.y
    const far = run.kind === "top" ? rect.y : rect.y + rect.height
    const level = extent(run.points, 1).min
    const strip = { rect, scale, width: run.width, height: run.height, glyph: entry.glyph, side: run.kind === "top" ? "up" : "down", line: Math.round(block.own.maxY - level), from: Math.round(span.min - block.own.minX) }
    if (run.region === "edge") {
      wrapped.push({ ...strip, extra: true })
      const start = rect.x - (strip.from + entry.glyph.wordX) * scale
      if (painted.fade !== null) addFade(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height, [0, near], [0, far], painted.fade)
      else if (stripStops) addGradient(rect, [start, 0], [start + wordWidth * scale, 0], stripStops)
      continue
    }
    const row = inside(Math.round(block.own.maxY - level) - (run.kind === "top" ? 0 : 1), 0, entry.height)
    const edge = run.kind === "top" ? fy + row * f : fy + (row + 1) * f - 1
    if (painted.tiles) tile(rect, scale, painted.tilesAcrossLine ? column + entry.glyph.lineX : 0)
    else lineDraws.push({ from: [fx + column * f, edge, run.width * f, false, run.kind === "top" ? 1 : -1, f], rect, repeat: 0 })
    shades.push([rect, innerFill(rect, scale, block, span, level), options.internalFade, far, near, false])
    wrapped.push(strip)
    if (options.internalFade === null && innerGradient && innerGradient.direction !== "up") {
      const start = rect.x - (Math.round(span.min - block.own.minX) + entry.glyph.wordX) * scale
      addGradient(rect, [start, 0], [start + wordWidth * scale, 0], innerGradient.stops)
    }
  }

  if (lineDraws.length) {
    const drawn = drawnLines()
    for (let channel = 0; channel < 4; channel++) sideSum[channel] += drawn.sideSum[channel]
    for (const { image, rect } of drawn.lines) ctx.putImageData(image, rect.x, rect.y)
  }
  copyStrips(ctx, canvas)
  for (const wrap of painted.sideWraps) {
    ctx.globalCompositeOperation = wrap.blend
    ctx.globalAlpha = wrap.opacity
    for (const { rect, scale, width, height, glyph, side, line, from, extra } of wrapped) {
      if (extra) continue
      const drawn = wrap.face(glyph, side, line, from, width, height, scale)
      if (drawn) ctx.drawImage(drawn, rect.x, rect.y)
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  shadeFaces(shades)

  ctx.fillStyle = painted.border
  ctx.fillRect(swatch.x, swatch.y, SWATCH * swatch.scale, SWATCH * swatch.scale)

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
      addFade(upRect.x, upRect.y, upRect.x + upRect.width, upRect.y + upRect.height, [0, upRect.y + upRect.height], [0, upRect.y], painted.fade)
      addFade(downRect.x, downRect.y, downRect.x + downRect.width, downRect.y + downRect.height, [0, downRect.y], [0, downRect.y + downRect.height], painted.fade)
    } else if (edgeStops) {
      for (const [rect, region] of [[upRect, up], [downRect, down]]) {
        const start = glyphOrigin(block, region)[0] - entry.glyph.wordX * region.scale
        addGradient(rect, [start, 0], [start + wordWidth * region.scale, 0], edgeStops)
      }
    }
    if (painted.gradient) {
      const { from, to } = painted.gradient.ends(entry)
      const region = entry.regions.front
      const u0 = region.x - region.u0 * region.scale
      const v0 = region.y - region.v0 * region.scale
      frontFaces.push({ ...areaOf(frontRect), from: [u0 + from[0] * front.scale, v0 + from[1] * front.scale], to: [u0 + to[0] * front.scale, v0 + to[1] * front.scale], stops: painted.gradient.stops })
    }
  }
  const gradient = frontFaces.length || gradientFaces.length ? { faces: frontFaces.concat(gradientFaces) } : null
  return { canvas, swatch, swatched: edges.length > 0, side, labels, crackShapes, gradient, fades, panels }
}
