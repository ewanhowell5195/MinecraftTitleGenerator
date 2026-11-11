import { clamp } from "./maths.js"

const SIDES = { top: [0, 1], bottom: [0, -1], left: [-1, 0], right: [1, 0] }

const highlight = { key: "thickness", label: "Highlight thickness", min: 1, max: 8, fallback: 1 }
const outline = { ...highlight, label: "Outline thickness" }
const fade = { key: "fade", label: "Fade", min: 0, max: 100, fallback: 80 }
const seed = { key: "seed", label: "Seed", min: 0, max: 99, fallback: 0 }
const bandOffset = { key: "offset", label: "Offset", min: 0, max: 63, fallback: 0 }
const angle = { key: "angle", label: "Angle", min: 0, max: 180, fallback: 45 }
const wave = [{ key: "level", label: "Level", min: 0, max: 100, fallback: 45 }, { key: "amplitude", label: "Wave height", min: 0, max: 24, fallback: 7 }, { key: "length", label: "Wave length", min: 8, max: 160, fallback: 40 }, { key: "offset", label: "Offset", min: 0, max: 200, fallback: 0 }, { key: "randomness", label: "Randomness", min: 0, max: 100, fallback: 60 }, seed]

export const PLACED_KINDS = new Set(["shine", "shine_random", "wave", "wave_inverted"])
export const SMOOTH_KINDS = new Set(["wave", "wave_inverted"])

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
  wave_inverted: { generated: "wave_inverted", name: "Wave (Inverted)", default: { blend: "source-over" } }
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

function finePixels(glyph, fine, kind, settings, scale) {
  const arc = glyph.arc && { ...glyph.arc, top: glyph.arc.top * scale, bottom: glyph.arc.bottom * scale }
  const detailed = { ...glyph, mask: fine, width: glyph.width * scale, height: glyph.height * scale, bottom: glyph.bottom * scale, arc }
  const scaled = { ...settings, capHeight: settings.capHeight * scale, thickness: settings.thickness * scale, inset: settings.inset * scale }
  return upscale(pixels(detailed, kind, scaled), detailed.width, detailed.height, 1, true)
}

export function generatedAlpha(glyph, kind, layer, capHeight, scale) {
  const settings = { ...settingsOf(kind, layer), capHeight }
  const fine = glyph.fine?.(scale) ?? null
  if (kind === "shine" || kind === "shine_random") return shine(glyph, kind, settings, scale, fine)
  if (kind === "wave" || kind === "wave_inverted") return waveFill(glyph, kind, settings, scale, fine)
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

export function edgeAlpha(glyph, side, kind, layer, depth, scale) {
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
