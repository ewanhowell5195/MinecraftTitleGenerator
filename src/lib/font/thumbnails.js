import { blend } from "../texture/blend.js"
import { rgbOf } from "../core/colour.js"
import { keptAt } from "../geometry/joins.js"
import { WHITE, chosenColours, mapColour } from "../texture/overlayColours.js"
import { stripY } from "./strips.js"

export const MARGIN = 2

export function over({ data, width, height }, x, y, [r, g, b, a]) {
  if (!a || x < 0 || y < 0 || x >= width || y >= height) return
  const i = (y * width + x) * 4
  const da = data[i + 3] / 255
  const sa = a / 255
  const oa = sa + da * (1 - sa)
  data[i] = Math.round((r * sa + data[i] * da * (1 - sa)) / oa)
  data[i + 1] = Math.round((g * sa + data[i + 1] * da * (1 - sa)) / oa)
  data[i + 2] = Math.round((b * sa + data[i + 2] * da * (1 - sa)) / oa)
  data[i + 3] = Math.round(oa * 255)
}

export function sceneFrame(placed, margin) {
  const minX = Math.min(...placed.map(item => item.x))
  const maxX = Math.max(...placed.map(item => item.x + item.glyph.width))
  const top = Math.max(...placed.map(item => item.glyph.top))
  const bottom = Math.min(...placed.map(item => item.glyph.bottom))
  return {
    frame: { width: maxX - minX + margin * 2, height: top - bottom + margin * 2 },
    placed: placed.map(item => ({ glyph: item.glyph, x: item.x - minX + margin, y: top - item.glyph.top + margin, lineX: item.x - placed[0].x }))
  }
}

export function drawRing(image, placed, d, border, maskOf = glyph => glyph.mask) {
  for (const { glyph, x, y } of placed) {
    const mask = maskOf(glyph)
    for (let r = 0; r < glyph.height; r++) {
      for (let c = 0; c < glyph.width; c++) {
        if (!mask[(glyph.height - 1 - r) * glyph.width + c]) continue
        for (let dy = -MARGIN; dy <= MARGIN; dy++) {
          for (let dx = -MARGIN; dx <= MARGIN; dx++) {
            for (let j = 0; j < d; j++) {
              for (let i = 0; i < d; i++) over(image, (x + c + dx) * d + i, (y + r + dy) * d + j, border)
            }
          }
        }
      }
    }
  }
}

function maskExtent(glyph) {
  let left = glyph.width
  let right = -1
  for (let row = 0; row < glyph.height; row++) {
    for (let column = 0; column < glyph.width; column++) {
      if (!glyph.mask[row * glyph.width + column]) continue
      left = Math.min(left, column)
      right = Math.max(right, column)
    }
  }
  return right < left ? null : { left, right: right + 1 }
}

function stripShifts(placed, pixel) {
  const shifts = []
  for (const [index, item] of placed.entries()) {
    const own = maskExtent(item.glyph)
    const before = index ? maskExtent(placed[index - 1].glyph) : null
    if (!own) shifts.push(0)
    else if (before && placed[index - 1].lineX + before.right >= item.lineX + own.left) shifts.push(shifts[index - 1])
    else {
      const phase = ((item.lineX + own.left - (placed[0].trim ?? 0)) % pixel + pixel) % pixel
      shifts.push(phase <= pixel / 2 ? phase : phase - pixel)
    }
  }
  return shifts
}

export function drawStrip(image, placed, d, { image: strip, density, snap = 1 / density, top, tiling, shape }) {
  const shifts = tiling === "character" ? null : stripShifts(placed, snap)
  for (const [index, { glyph, x, y, lineX, trim = 0 }] of placed.entries()) {
    const origin = tiling === "character" ? -trim : lineX - (placed[0].trim ?? 0) - shifts[index]
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        if (!glyph.mask[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)] || !keptAt(glyph, glyph.height - 1 - Math.floor(py / d), (px + 0.5) / d)) continue
        const at = glyph.top - 1 - Math.floor(py / d)
        const row = top - 1 - stripY(shape, at)
        const sx = (Math.floor((origin * d + px) * density / d) % strip.width + strip.width) % strip.width
        const sy = Math.floor((row * d + py % d) * density / d)
        const k = (sy * strip.width + sx) * 4
        over(image, x * d + px, y * d + py, [strip.data[k], strip.data[k + 1], strip.data[k + 2], strip.data[k + 3]])
      }
    }
  }
}

export function drawLayer(image, placed, d, layer, { tonesOf = null, texel = null }) {
  const anchors = layer.palette ?? [WHITE]
  const colours = chosenColours(layer, anchors)
  const cache = new Map()

  function coloured(rgb) {
    if (!colours) return layer.tint ? blend(layer.tintBlend, rgb, rgbOf(layer.tint)) : rgb
    const key = rgb[0] << 16 | rgb[1] << 8 | rgb[2]
    if (!cache.has(key)) cache.set(key, mapColour(rgb, anchors, colours))
    return cache.get(key)
  }

  for (const item of placed) {
    const { glyph, x, y } = item
    const tones = tonesOf?.(item)
    const at = texel?.at(item)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        const k = at?.(px, py)
        const index = py * glyph.width * d + px
        const tone = texel ? 0 : Math.max(0, tones.findIndex(alpha => alpha[index]))
        const coverage = texel ? texel.data[k + 3] / 255 : tones[tone][index]
        const strength = keptAt(glyph, glyph.height - 1 - Math.floor(py / d), (px + 0.5) / d) ? coverage * layer.opacity / 100 : 0
        const i = ((y * d + py) * image.width + x * d + px) * 4
        if (!strength || !image.data[i + 3]) continue
        const base = [image.data[i], image.data[i + 1], image.data[i + 2]]
        const mixed = blend(layer.blend, base, coloured(texel ? [texel.data[k], texel.data[k + 1], texel.data[k + 2]] : anchors[tone]))
        for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(base[c] + (mixed[c] - base[c]) * strength)
      }
    }
  }
}
