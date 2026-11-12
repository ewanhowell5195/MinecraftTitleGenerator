import { clamp } from "./maths.js"

const SIDES = { top: [0, 1], bottom: [0, -1], left: [-1, 0], right: [1, 0] }

const highlight = { key: "thickness", label: "Highlight thickness", min: 1, max: 8, fallback: 1 }
const outline = { ...highlight, label: "Outline thickness" }
const fade = { key: "fade", label: "Fade", min: 0, max: 100, fallback: 80 }
const seed = { key: "seed", label: "Seed", min: 0, max: 99, fallback: 0 }
const bandOffset = { key: "offset", label: "Offset", min: 0, max: 63, fallback: 0 }
const angle = { key: "angle", label: "Angle", min: 0, max: 180, fallback: 45 }
const wave = [{ key: "level", label: "Level", min: 0, max: 100, fallback: 45 }, { key: "amplitude", label: "Wave height", min: 0, max: 24, fallback: 7 }, { key: "length", label: "Wave length", min: 8, max: 160, fallback: 40 }, { key: "offset", label: "Offset", min: 0, max: 200, fallback: 0 }, { key: "randomness", label: "Randomness", min: 0, max: 100, fallback: 60 }, seed]
const cracks = [{ key: "amount", label: "Amount", min: 1, max: 100, fallback: 30 }, { key: "length", label: "Length", min: 1, max: 24, fallback: 5 }, { key: "width", label: "Width", min: 1, max: 6, step: 0.25, fallback: 2 }, seed]
const CRACK_SPACING = 1800
const CRACK_BLEND = 0.5
const CRACK_CORNER = 2
const CRACK_EDGE_GAP = 0.5
const CRACK_TIP_GAP = 0.99
const CRACK_SHRINK = 0.3
const CRACK_SHRINK_STEPS = 6
const CRACK_GAP = 2
const CRACK_VARIETY = 0.6
const CRACK_SCATTER = 0.4
const CRACK_OPPOSITE = 6
const CRACK_STEEP_REACH = 2
const CRACK_SIDES = ["up", "down", "left", "right"]

export const PLACED_KINDS = new Set(["shine", "shine_random", "wave", "wave_inverted", "cracks"])
export const WRAPPED_KINDS = new Set(["cracks"])
export const SMOOTH_KINDS = new Set(["wave", "wave_inverted", "cracks"])

export const GENERATED_SETTINGS = {
  top: [highlight],
  bottom: [highlight],
  left: [highlight],
  right: [highlight],
  outline: [{ key: "inset", label: "Inset", min: 0, max: 8, fallback: 0 }, outline],
  outline_fade: [outline, { key: "spread", label: "Fade height", min: 10, max: 100, fallback: 60 }],
  outline_fade_inverted: [outline, { key: "spread", label: "Fade height", min: 10, max: 100, fallback: 75 }],
  corners: [{ key: "size", label: "Dot size", min: 1, max: 8, fallback: 2 }, { key: "inset", label: "Inset", min: 0, max: 8, fallback: 1 }],
  shine: [{ key: "width", label: "Band width", min: 1, max: 32, fallback: 11 }, { key: "gap", label: "Band gap", min: 1, max: 32, fallback: 12 }, angle, bandOffset, fade],
  shine_random: [{ key: "width", label: "Band width", min: 1, max: 32, fallback: 6 }, { key: "gap", label: "Band gap", min: 1, max: 32, fallback: 11 }, { key: "randomness", label: "Randomness", min: 0, max: 100, fallback: 75 }, seed, angle, bandOffset, fade],
  wave,
  wave_inverted: wave,
  cracks,
  edge_outline: [outline],
  edge_outline_open: [outline],
  edge_outline_fade: [outline],
  edge_front: [highlight],
  edge_rounded: [{ key: "radius", label: "Radius", min: 1, max: 8, fallback: 2 }]
}

export const GENERATED_EDGE_OVERLAYS = {
  edge_outline: { generated: "edge_outline", name: "Outline" },
  edge_outline_open: { generated: "edge_outline_open", name: "Outline (No Front)" },
  edge_outline_fade: { generated: "edge_outline_fade", name: "Outline Fade" },
  edge_front: { generated: "edge_front", name: "Highlight" },
  edge_rounded: { generated: "edge_rounded", name: "Rounded", default: { colour: "#000000", blend: "source-over" } }
}

const GENERATED_OVERLAYS = {
  highlights_top: { generated: "top", name: "Top Highlight" },
  highlights_bottom: { generated: "bottom", name: "Bottom Highlight" },
  highlights_left: { generated: "left", name: "Left Highlight" },
  highlights_right: { generated: "right", name: "Right Highlight" },
  outline: { generated: "outline" },
  outline_fade: { generated: "outline_fade" },
  outline_fade_inverted: { generated: "outline_fade_inverted", name: "Outline Fade (Inverted)" },
  corner_dots: { generated: "corners" },
  shine: { generated: "shine" },
  shine_random: { generated: "shine_random", name: "Shine (Random)" },
  wave: { generated: "wave", default: { blend: "source-over" } },
  wave_inverted: { generated: "wave_inverted", name: "Wave (Inverted)", default: { blend: "source-over" } },
  cracked_edges: { generated: "cracks", default: { colour: "#000000", blend: "source-over" } }
}

export function withGenerated(overlays) {
  return { ...GENERATED_OVERLAYS, ...overlays }
}

export function generatedSetting(layer, item) {
  return layer[item.key] ?? item.fallback
}

function settingsOf(kind, layer) {
  return Object.fromEntries(GENERATED_SETTINGS[kind].map(item => [item.key, generatedSetting(layer, item)]))
}

function upscale(own, width, height, scale, flip) {
  const columns = width * scale
  const out = new Float32Array(columns * height * scale)
  for (let sy = 0; sy < height * scale; sy++) {
    const y = Math.floor(sy / scale)
    const row = (flip ? height - 1 - y : y) * width
    for (let sx = 0; sx < columns; sx++) out[sy * columns + sx] = own[row + Math.floor(sx / scale)]
  }
  return out
}

function distances(mask, width, height) {
  const dist = new Uint16Array(width * height)
  const get = (x, y) => x >= 0 && y >= 0 && x < width && y < height ? dist[y * width + x] : 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) dist[y * width + x] = Math.min(get(x - 1, y), get(x - 1, y - 1), get(x, y - 1), get(x + 1, y - 1)) + 1
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) dist[y * width + x] = Math.min(dist[y * width + x], Math.min(get(x + 1, y), get(x + 1, y + 1), get(x, y + 1), get(x - 1, y + 1)) + 1)
    }
  }
  return dist
}

function random(seed) {
  let state = seed + 0x6d2b79f5 * 31 >>> 0
  return () => {
    state = state + 0x6d2b79f5 >>> 0
    let value = Math.imul(state ^ state >>> 15, state | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function hashed(...values) {
  let hash = 0x811c9dc5
  for (const value of values) {
    hash = Math.imul(hash ^ (value | 0), 0x01000193)
    hash ^= hash >>> 13
    hash = Math.imul(hash, 0x5bd1e995)
    hash ^= hash >>> 15
  }
  return hash >>> 0
}

function randomBands(from, to, settings) {
  const next = random(settings.seed)
  const vary = size => Math.max(0.5, size * (1 + settings.randomness / 100 * (next() * 2 - 1)))
  const list = []
  for (let at = -1024; at < to;) {
    const width = vary(settings.width)
    if (at + width > from) list.push([at, at + width])
    at += width + vary(settings.gap)
  }
  return list
}

function pixels(glyph, kind, settings) {
  const { width, height, mask } = glyph
  const out = new Float32Array(width * height)
  const at = (i, j) => i >= 0 && j >= 0 && i < width && j < height && mask[j * width + i] === 1
  if (kind === "corners") {
    const { size, inset } = settings
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        if (!at(i, j)) continue
        for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          if (at(i + dx, j) || at(i, j + dy)) continue
          const dot = []
          for (let b = 0; b < size; b++) for (let a = 0; a < size; a++) dot.push([i - dx * (inset + a), j - dy * (inset + b)])
          if (dot.every(([x, y]) => at(x, y))) for (const [x, y] of dot) out[y * width + x] = 1
        }
      }
    }
    return out
  }
  const { thickness } = settings
  if (SIDES[kind]) {
    const [dx, dy] = SIDES[kind]
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        if (!at(i, j)) continue
        for (let step = 1; step <= thickness && !out[j * width + i]; step++) out[j * width + i] = at(i + dx * step, j + dy * step) ? 0 : 1
      }
    }
    return out
  }
  if (kind === "outline_fade" || kind === "outline_fade_inverted") {
    const arc = glyph.arc ?? { top: 0, bottom: 0 }
    const span = settings.capHeight + arc.top + arc.bottom
    const centre = span / 2 - arc.bottom
    const half = settings.spread / 100 * span / 2
    const dist = distances(mask, width, height)
    for (let j = 0; j < height; j++) {
      const from = Math.abs(glyph.bottom + j + 0.5 - centre)
      const strength = kind === "outline_fade" ? Math.max(0, 1 - (from / half) ** 1.45) : clamp(1 - (span / 2 - from) / half, 0, 1)
      for (let i = 0; i < width; i++) if (dist[j * width + i] >= 1 && dist[j * width + i] <= thickness) out[j * width + i] = strength
    }
    return out
  }
  const from = settings.inset + 1
  const dist = distances(mask, width, height)
  for (let index = 0; index < out.length; index++) out[index] = dist[index] >= from && dist[index] < from + thickness ? 1 : 0
  return out
}

function shine(glyph, kind, settings, scale, fine) {
  const { width, height, mask } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  const arc = glyph.arc ?? { top: 0, bottom: 0 }
  const { capHeight, width: band } = settings
  const period = band + settings.gap
  const sin = Math.sin(settings.angle * Math.PI / 180)
  const cos = Math.cos(settings.angle * Math.PI / 180)
  const start = glyph.placedX * sin + 18.75 + settings.offset
  const position = (x, down) => start + x * sin - down * cos
  const corners = [[0, capHeight - glyph.top], [width, capHeight - glyph.top], [0, capHeight - glyph.bottom], [width, capHeight - glyph.bottom]].map(([x, down]) => position(x, down))
  const list = kind === "shine_random" ? randomBands(Math.min(...corners) - 1, Math.max(...corners) + 1, settings) : null
  const fade = settings.fade / 100
  for (let sy = 0; sy < rows; sy++) {
    const down = capHeight - (glyph.top - (sy + 0.5) / scale)
    const alpha = clamp(1 - fade * (down + arc.top) / (capHeight + arc.top + arc.bottom), 0, 1)
    const row = height - 1 - Math.floor(sy / scale)
    for (let sx = 0; sx < columns; sx++) {
      if (fine ? !fine[(rows - 1 - sy) * columns + sx] : !mask[row * width + Math.floor(sx / scale)]) continue
      const along = position((sx + 0.5) / scale, down)
      const inside = list ? list.some(([from, to]) => along >= from && along < to) : ((along % period) + period) % period < band
      if (inside) out[sy * columns + sx] = alpha
    }
  }
  return out
}

function wavePoints(to, settings) {
  const swing = settings.randomness / 100
  const next = random(settings.seed)
  const points = []
  let at = -1024 - next() * settings.length * 2 * swing
  for (let index = 0; !points.length || points.at(-1)[0] <= to; index++) {
    points.push([at, (index % 2 ? 1 : -1) * settings.amplitude * (1 - 0.5 * swing * next())])
    at += settings.length * (1 + 0.6 * swing * (next() * 2 - 1))
  }
  return points
}

function waveFill(glyph, kind, settings, scale, fine) {
  const { width, height, mask } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  const capTop = settings.capHeight - glyph.top
  const level = settings.level / 100 * settings.capHeight
  const start = glyph.placedX - settings.offset
  const points = wavePoints(start + width, settings)
  let index = 0
  for (let sx = 0; sx < columns; sx++) {
    const along = start + (sx + 0.5) / scale
    while (points[index + 1][0] <= along) index++
    const [[x0, y0], [x1, y1]] = [points[index], points[index + 1]]
    const surface = level + y0 + (y1 - y0) * (1 - Math.cos(Math.PI * (along - x0) / (x1 - x0))) / 2
    for (let sy = 0; sy < rows; sy++) {
      if (fine ? !fine[(rows - 1 - sy) * columns + sx] : !mask[(height - 1 - Math.floor(sy / scale)) * width + Math.floor(sx / scale)]) continue
      const above = clamp((surface - capTop) * scale - sy, 0, 1)
      out[sy * columns + sx] = kind === "wave" ? above : 1 - above
    }
  }
  return out
}

function solidOf({ width, height, mask }) {
  return (column, row) => column >= 0 && row >= 0 && column < width && row < height && mask[(height - 1 - row) * width + column] === 1
}

function crackEdges(glyph) {
  const { width, height } = glyph
  const solid = solidOf(glyph)
  const edges = []
  function runs(side, lines, length, open) {
    for (let line = 0; line <= lines; line++) {
      let start = null
      for (let at = 0; at <= length; at++) {
        const here = at < length && open(line, at)
        if (here && start === null) start = at
        if (here || start === null) continue
        edges.push({ side, line, from: start, to: at })
        start = null
      }
    }
  }
  runs("up", height, width, (line, column) => solid(column, line) && !solid(column, line - 1))
  runs("down", height, width, (line, column) => solid(column, line - 1) && !solid(column, line))
  runs("left", width, height, (line, row) => solid(line, row) && !solid(line - 1, row))
  runs("right", width, height, (line, row) => solid(line - 1, row) && !solid(line, row))
  return edges
}

function crackMiddle({ side, line, from, to }) {
  return side === "up" || side === "down" ? [(from + to) / 2, line] : [line, (from + to) / 2]
}

function spreadOrder(cracks, next) {
  const left = cracks.map(crack => ({ crack, at: crackMiddle(crack), gap: Infinity, luck: 0 }))
  const order = []
  while (left.length) {
    for (const item of left) item.luck = CRACK_SCATTER + (1 - CRACK_SCATTER) * next()
    const best = order.length ? left.reduce((a, b) => b.gap * b.luck > a.gap * a.luck ? b : a) : left[Math.floor(next() * left.length)]
    left.splice(left.indexOf(best), 1)
    order.push(best.crack)
    for (const item of left) item.gap = Math.min(item.gap, Math.hypot(item.at[0] - best.at[0], item.at[1] - best.at[1]))
  }
  return order
}

const crackOrders = new WeakMap()

function orderedCracks(glyph, settings) {
  const key = [settings.seed, settings.width, settings.length].join()
  if (!crackOrders.has(glyph)) crackOrders.set(glyph, new Map())
  const known = crackOrders.get(glyph)
  if (!known.has(key)) {
    const order = spreadOrder(crackCandidates(glyph, settings), random(hashed(settings.seed, Math.round(glyph.placedX ?? 0))))
    known.set(key, order.map((crack, index) => ({ ...crack, priority: index / order.length })))
  }
  return known.get(key)
}

function repeated(crack, glyph, settings) {
  if (!crack.wall) return false
  return [glyph.previous, glyph.next].some((neighbour, index) => neighbour && orderedCracks(neighbour, settings).some(other => other.wall === crack.wall && (other.priority < crack.priority || other.priority === crack.priority && index === 0) && other.from < crack.to + CRACK_OPPOSITE && crack.from < other.to + CRACK_OPPOSITE))
}

function crackCandidates(glyph, settings) {
  const gap = CRACK_SPACING / 100
  const vary = CRACK_VARIETY
  const list = []
  const edges = crackEdges(glyph)
  const lines = side => edges.filter(edge => edge.side === side).map(edge => edge.line)
  const outer = { up: Math.min(...lines("up")), down: Math.max(...lines("down")), left: Math.min(...lines("left")), right: Math.max(...lines("right")) }
  for (const { side, line, from, to } of edges) {
    const wall = line !== outer[side] ? null : side === "left" || side === "right" ? "side" : side
    const next = random(hashed(settings.seed, Math.round(glyph.placedX ?? 0), CRACK_SIDES.indexOf(side), line, from))
    for (let at = from + gap * next(); at < to; at += gap * (1 + vary * (next() - 0.5))) {
      const width = settings.width * (1 + vary * (next() - 0.5))
      const length = settings.length * (1 + vary * (next() - 0.5))
      const lean = () => at + width * vary * (next() * 2 - 1)
      const crack = { side, line, from: at - width / 2, to: at + width / 2, tip: lean(), length, wrapTip: lean(), wrapLength: length * (0.5 + 0.5 * next()), edge: [from, to], wall }
      if (at >= from + CRACK_CORNER * 2 && at <= to - CRACK_CORNER * 2) list.push(crack)
    }
  }
  return list
}

function contained([first, second, tip], solid) {
  const steps = Math.max(4, Math.ceil(Math.hypot(tip[0] - first[0], tip[1] - first[1]) * 2))
  for (let part = 0; part <= 4; part++) {
    const from = [first[0] + (second[0] - first[0]) * part / 4, first[1] + (second[1] - first[1]) * part / 4]
    for (let step = 1; step <= steps; step++) {
      if (!solid(Math.floor(from[0] + (tip[0] - from[0]) * step / steps), Math.floor(from[1] + (tip[1] - from[1]) * step / steps))) return false
    }
  }
  return true
}

function apart(a, b) {
  for (const [shape, other] of [[a, b], [b, a]]) {
    for (let index = 0; index < 3; index++) {
      const [x0, y0] = shape[index]
      const [x1, y1] = shape[(index + 1) % 3]
      const across = point => (point[0] - x0) * (y1 - y0) - (point[1] - y0) * (x1 - x0)
      const own = across(shape[(index + 2) % 3])
      if (other.every(point => across(point) * own <= 0)) return true
    }
  }
  return false
}

function wrapReach({ side, wrapLength }) {
  return side === "up" ? wrapLength : wrapLength * CRACK_STEEP_REACH
}

function wrapTriangle(crack) {
  return [[crack.from, 0], [crack.to, 0], [crack.wrapTip, wrapReach(crack)]]
}

function pointGap([ax, ay], [bx, by], [px, py]) {
  const dx = bx - ax
  const dy = by - ay
  const along = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return Math.hypot(ax + dx * along - px, ay + dy * along - py)
}

function near(a, b) {
  if (!apart(a, b)) return true
  return [[a, b], [b, a]].some(([shape, other]) => shape.some((corner, index) => other.some(point => pointGap(corner, shape[(index + 1) % 3], point) < CRACK_GAP)))
}

function opposite(a, b) {
  const [first, second] = CRACK_SIDES.indexOf(a.side) < CRACK_SIDES.indexOf(b.side) ? [a, b] : [b, a]
  const facing = first.side === "up" && second.side === "down" || first.side === "left" && second.side === "right"
  return facing && first.from < second.to + CRACK_OPPOSITE && second.from < first.to + CRACK_OPPOSITE
}

function crossing(a, b) {
  return opposite(a, b) || near(crackTriangle(a), crackTriangle(b)) || a.side === b.side && a.line === b.line && near(wrapTriangle(a), wrapTriangle(b))
}

function roomy(crack, solid) {
  const [, , [x, y]] = crackTriangle(crack)
  const facing = { up: Math.PI / 2, down: -Math.PI / 2, left: 0, right: Math.PI }[crack.side]
  for (let turn = -1; turn <= 1; turn++) {
    const angle = facing + turn * Math.PI / 4
    if (!solid(Math.floor(x + CRACK_TIP_GAP * Math.cos(angle)), Math.floor(y + CRACK_TIP_GAP * Math.sin(angle)))) return false
  }
  return true
}

function fittedCrack(crack, solid) {
  if (crack.from < crack.edge[0] + CRACK_EDGE_GAP || crack.to > crack.edge[1] - CRACK_EDGE_GAP) return null
  for (let step = 0; step <= CRACK_SHRINK_STEPS; step++) {
    const shorter = { ...crack, length: crack.length * (1 - CRACK_SHRINK * step / CRACK_SHRINK_STEPS) }
    if (contained(crackTriangle(shorter), solid) && roomy(shorter, solid)) return shorter
  }
  return null
}

export function crackList(glyph, layer) {
  const solid = solidOf(glyph)
  const settings = settingsOf("cracks", layer)
  const ordered = orderedCracks(glyph, settings)
  const chosen = ordered.slice(0, Math.round(ordered.length * settings.amount / 100))
  const fitted = chosen.map(crack => fittedCrack(crack, solid))
  const shown = []
  for (const [index, crack] of fitted.entries()) {
    if (crack && !fitted.slice(0, index).some((other, at) => crossing(crack, other ?? chosen[at])) && !repeated(crack, glyph, settings)) shown.push(crack)
  }
  return shown
}

function fillTriangle(out, columns, rows, points, scale, soft) {
  const [[ax, ay], [bx, by], [cx, cy]] = points.map(point => point.map(value => value * scale))
  const turn = Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
  if (!turn) return
  const inside = (x0, y0, x1, y1, x, y) => ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) * turn / Math.hypot(x1 - x0, y1 - y0)
  for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1); y < Math.min(rows, Math.ceil(Math.max(ay, by, cy)) + 1); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1); x < Math.min(columns, Math.ceil(Math.max(ax, bx, cx)) + 1); x++) {
      const depth = Math.min(inside(ax, ay, bx, by, x + 0.5, y + 0.5), inside(bx, by, cx, cy, x + 0.5, y + 0.5), inside(cx, cy, ax, ay, x + 0.5, y + 0.5))
      const cover = soft ? clamp(depth / CRACK_BLEND + 0.5, 0, 1) : depth >= 0 ? 1 : 0
      if (cover > out[y * columns + x]) out[y * columns + x] = cover
    }
  }
}

export function crackTriangle({ side, line, from, to, tip, length }) {
  const deep = line + (side === "up" || side === "left" ? length : -length)
  return side === "up" || side === "down" ? [[from, line], [to, line], [tip, deep]] : [[line, from], [line, to], [deep, tip]]
}

function crackFaces(glyph, layer, scale, fine, soft) {
  const { width, height, mask } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  for (const crack of crackList(glyph, layer)) fillTriangle(out, columns, rows, crackTriangle(crack), scale, soft)
  for (let sy = 0; sy < rows; sy++) {
    const row = height - 1 - Math.floor(sy / scale)
    for (let sx = 0; sx < columns; sx++) {
      if (fine ? !fine[(rows - 1 - sy) * columns + sx] : !mask[row * width + Math.floor(sx / scale)]) out[sy * columns + sx] = 0
    }
  }
  return out
}

export function wrapTriangles(glyph, layer, side, line, from, width, height) {
  const turned = side === "left" || side === "right"
  const [along, depth] = turned ? [height, width] : [width, height]
  const front = side === "down" ? 0 : depth
  return crackList(glyph, layer).filter(crack => crack.side === side && crack.line === line && crack.to > from && crack.from < from + along).map(crack => {
    const reach = Math.min(wrapReach(crack), depth)
    const tip = side === "down" ? reach : depth - reach
    return turned ? [[front, crack.from - from], [front, crack.to - from], [tip, crack.wrapTip - from]] : [[crack.from - from, front], [crack.to - from, front], [crack.wrapTip - from, tip]]
  })
}

export function crackWrap(glyph, layer, side, line, from, width, height, scale, soft = false) {
  const triangles = wrapTriangles(glyph, layer, side, line, from, width, height)
  if (!triangles.length) return null
  const columns = width * scale
  const out = new Float32Array(columns * height * scale)
  for (const points of triangles) fillTriangle(out, columns, height * scale, points, scale, soft)
  return out
}

function finePixels(glyph, fine, kind, settings, scale) {
  const arc = glyph.arc && { ...glyph.arc, top: glyph.arc.top * scale, bottom: glyph.arc.bottom * scale }
  const detailed = { ...glyph, mask: fine, width: glyph.width * scale, height: glyph.height * scale, bottom: glyph.bottom * scale, arc }
  const scaled = { ...settings, capHeight: settings.capHeight * scale, thickness: settings.thickness * scale, inset: settings.inset * scale }
  return upscale(pixels(detailed, kind, scaled), detailed.width, detailed.height, 1, true)
}

export function generatedAlpha(glyph, kind, layer, capHeight, scale, soft = false) {
  const settings = { ...settingsOf(kind, layer), capHeight }
  const fine = glyph.fine?.(scale) ?? null
  if (kind === "shine" || kind === "shine_random") return shine(glyph, kind, settings, scale, fine)
  if (kind === "wave" || kind === "wave_inverted") return waveFill(glyph, kind, settings, scale, fine)
  if (kind === "cracks") return crackFaces(glyph, layer, scale, fine, soft)
  if (fine && kind !== "corners") return finePixels(glyph, fine, kind, settings, scale)
  const alpha = upscale(pixels(glyph, kind, settings), glyph.width, glyph.height, scale, true)
  if (fine) {
    const columns = glyph.width * scale
    const rows = glyph.height * scale
    for (let index = 0; index < alpha.length; index++) alpha[index] *= fine[(rows - 1 - Math.floor(index / columns)) * columns + index % columns]
  }
  return alpha
}

function edgeRuns(glyph, side) {
  const { width, height, mask } = glyph
  const row = side === "up" ? height - 1 : 0
  const list = []
  for (let start = 0; start < width;) {
    if (!mask[row * width + start]) {
      start++
      continue
    }
    let end = start
    while (end + 1 < width && mask[row * width + end + 1]) end++
    list.push([start, end])
    start = end + 1
  }
  return list
}

function rounded(glyph, side, radius, depth, scale) {
  const columns = glyph.width * scale
  const rows = depth * scale
  const out = new Float32Array(columns * rows)
  for (const [start, end] of edgeRuns(glyph, side)) {
    const size = Math.min(radius, (end - start + 1) / 2, depth) * scale
    const left = start * scale + size
    const right = (end + 1) * scale - size
    const top = rows - size
    for (let sd = Math.floor(top); sd < rows; sd++) {
      const sy = side === "up" ? rows - 1 - sd : sd
      for (let sx = start * scale; sx < (end + 1) * scale; sx++) {
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
  for (const [start, end] of edgeRuns(glyph, side)) open.fill(1, start, end + 1)
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
  const { width } = glyph
  const own = new Float32Array(width * depth)
  for (const [start, end] of edgeRuns(glyph, side)) {
    for (let d = 0; d < depth; d++) {
      const strength = kind === "edge_outline_fade" ? d / Math.max(1, depth - 1) : 1
      const y = side === "up" ? depth - 1 - d : d
      const far = d >= depth - thickness && kind !== "edge_front"
      const front = d < thickness && (kind === "edge_outline" || kind === "edge_front")
      for (let x = start; x <= end; x++) {
        const atEnd = (x - start < thickness || end - x < thickness) && kind !== "edge_front"
        if (far || front || atEnd) own[y * width + x] = strength
      }
    }
  }
  return upscale(own, width, depth, scale, false)
}
