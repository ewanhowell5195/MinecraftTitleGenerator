import { joinedMask } from "../../geometry/joins.js"
import { clamp } from "../../core/maths.js"
import { TONES } from "./settings.js"

const SIDES = { top: [0, 1], bottom: [0, -1], left: [-1, 0], right: [1, 0] }
const LIGHT_SIDES = { 0: [-1, 1], 90: [1, 1], 180: [1, -1], 270: [-1, -1] }

export function upscale(own, width, height, scale, flip) {
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

function twoTonePixels(glyph, kind, settings) {
  const { width, height, mask } = glyph
  const out = new Float32Array(width * height)
  const at = (i, j) => i >= 0 && j >= 0 && i < width && j < height && mask[j * width + i] === 1
  const from = 1
  const reach = Math.ceil(settings.thickness)
  const dist = distances(mask, width, height)
  function ray(i, j, dx, dy) {
    for (let step = 1; step <= reach; step++) if (!at(i + dx * step, j + dy * step)) return true
    return false
  }
  const [h, v] = LIGHT_SIDES[settings.direction] ?? LIGHT_SIDES[0]
  function corner(i, j, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) if ((dy * v > 0 || dx * h > 0) && !at(i + dx, j + dy)) return true
    }
    return false
  }
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const own = dist[j * width + i]
      if (own < from || own >= from + settings.thickness) continue
      const light = ray(i, j, 0, v) || ray(i, j, h, 0) || !ray(i, j, 0, -v) && !ray(i, j, -h, 0) && corner(i, j, own)
      out[j * width + i] = kind === "two_tone_outline" || light === (kind === "two_tone_outline_light") ? 1 : 0
    }
  }
  return out
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
  if (kind === "two_tone_outline" || TONES.two_tone_outline.includes(kind)) return twoTonePixels(glyph, kind, settings)
  const from = settings.inset + 1
  const dist = distances(mask, width, height)
  for (let index = 0; index < out.length; index++) out[index] = dist[index] >= from && dist[index] < from + thickness ? 1 : 0
  return out
}

export function finePixels(glyph, fine, kind, settings, scale) {
  const arc = glyph.arc && { ...glyph.arc, top: glyph.arc.top * scale, bottom: glyph.arc.bottom * scale }
  const detailed = { ...glyph, mask: fine, width: glyph.width * scale, height: glyph.height * scale, bottom: glyph.bottom * scale, arc }
  const scaled = { ...settings, capHeight: settings.capHeight * scale, thickness: settings.thickness * scale, inset: settings.inset * scale }
  return upscale(pixels(detailed, kind, scaled), detailed.width, detailed.height, 1, true)
}

function joinPad(settings) {
  return Math.ceil((settings.thickness ?? 0) + (settings.inset ?? 0) + (settings.size ?? 0)) + 1
}

export function joinedPixels(glyph, kind, settings) {
  const pad = joinPad(settings)
  const joined = joinedMask(glyph, pad)
  if (!joined) return pixels(glyph, kind, settings)
  const full = pixels(joined, kind, settings)
  const out = new Float32Array(glyph.width * glyph.height)
  for (let row = 0; row < glyph.height; row++) out.set(full.subarray((row + pad) * joined.width + pad, (row + pad) * joined.width + pad + glyph.width), row * glyph.width)
  return out
}

function blocks(glyph, scale) {
  const columns = glyph.width * scale
  const mask = new Uint8Array(columns * glyph.height * scale)
  for (let y = 0; y < glyph.height * scale; y++) {
    for (let x = 0; x < columns; x++) mask[y * columns + x] = glyph.mask[Math.floor(y / scale) * glyph.width + Math.floor(x / scale)]
  }
  return mask
}

export function blockPixels(glyph, kind, settings, scale) {
  const pad = joinPad(settings)
  const joined = joinedMask(glyph, pad)
  const source = joined ?? glyph
  const full = finePixels(source, blocks(source, scale), kind, settings, scale)
  if (!joined) return full
  const columns = glyph.width * scale
  const wide = source.width * scale
  const offset = pad * scale
  const out = new Float32Array(columns * glyph.height * scale)
  for (let row = 0; row < glyph.height * scale; row++) out.set(full.subarray((row + offset) * wide + offset, (row + offset) * wide + offset + columns), row * columns)
  return out
}

export function extrusionOutline(glyph, settings, scale) {
  const { width, height, mask, caster } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  if (!caster) return out
  const cell = (sx, sy) => Math.floor(sy / scale) * width + Math.floor(sx / scale)
  const dist = new Float32Array(columns * rows).fill(Infinity)
  for (let sy = 0; sy < rows; sy++) {
    for (let sx = 0; sx < columns; sx++) if (caster[cell(sx, sy)]) dist[sy * columns + sx] = 0
  }
  const get = (sx, sy) => sx >= 0 && sy >= 0 && sx < columns && sy < rows ? dist[sy * columns + sx] : Infinity
  for (let sy = 0; sy < rows; sy++) {
    for (let sx = 0; sx < columns; sx++) dist[sy * columns + sx] = Math.min(dist[sy * columns + sx], get(sx - 1, sy) + 1, get(sx - 1, sy - 1) + 1, get(sx, sy - 1) + 1, get(sx + 1, sy - 1) + 1)
  }
  for (let sy = rows - 1; sy >= 0; sy--) {
    for (let sx = columns - 1; sx >= 0; sx--) dist[sy * columns + sx] = Math.min(dist[sy * columns + sx], get(sx + 1, sy) + 1, get(sx + 1, sy + 1) + 1, get(sx, sy + 1) + 1, get(sx - 1, sy + 1) + 1)
  }
  const reach = settings.thickness * scale
  for (let sy = 0; sy < rows; sy++) {
    for (let sx = 0; sx < columns; sx++) {
      const own = dist[sy * columns + sx]
      if (mask[cell(sx, sy)] && own > 0 && own <= reach) out[(rows - 1 - sy) * columns + sx] = 1
    }
  }
  return out
}
