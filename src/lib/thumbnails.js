import { blend } from "./blend.js"
import { rgbOf } from "./colour.js"
import { keptAt } from "./joins.js"
import { MISSING, stripHasRow, stripRows, stripY } from "./strips.js"

export const MARGIN = 2

const WHITE = [255, 255, 255]

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

export function stripSource(entry, image, range, depth, capHeight) {
  const shape = stripRows(entry, range, depth, capHeight)
  return { image, shape, density: image.height / shape.rows, top: shape.depth + shape.top, tiling: entry.tiling ?? "line" }
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

export function drawStrip(image, placed, d, { image: strip, density, top, tiling, shape }) {
  for (const { glyph, x, y, lineX, trim = 0 } of placed) {
    const origin = tiling === "character" ? -trim : lineX - (placed[0].trim ?? 0)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        if (!glyph.mask[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)] || !keptAt(glyph, glyph.height - 1 - Math.floor(py / d), (px + 0.5) / d)) continue
        const at = glyph.top - 1 - Math.floor(py / d)
        if (!stripHasRow(shape, at)) {
          over(image, x * d + px, y * d + py, MISSING[(x + Math.floor(px / d) + y + Math.floor(py / d)) % 2].concat(255))
          continue
        }
        const row = top - 1 - stripY(shape, at)
        const sx = (Math.floor((origin * d + px) * density / d) % strip.width + strip.width) % strip.width
        const sy = Math.floor((row * d + py % d) * density / d)
        const k = (sy * strip.width + sx) * 4
        over(image, x * d + px, y * d + py, [strip.data[k], strip.data[k + 1], strip.data[k + 2], strip.data[k + 3]])
      }
    }
  }
}

export function drawLayer(image, placed, d, layer, { alphaOf = null, texel = null }) {
  const tint = rgbOf(layer.colour)
  for (const item of placed) {
    const { glyph, x, y } = item
    const alpha = alphaOf?.(item)
    const at = texel?.at(item)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        const k = at?.(px, py)
        const coverage = texel ? texel.data[k + 3] / 255 : alpha[py * glyph.width * d + px]
        const strength = keptAt(glyph, glyph.height - 1 - Math.floor(py / d), (px + 0.5) / d) ? coverage * layer.opacity / 100 : 0
        const i = ((y * d + py) * image.width + x * d + px) * 4
        if (!strength || !image.data[i + 3]) continue
        const base = [image.data[i], image.data[i + 1], image.data[i + 2]]
        const mixed = blend(layer.blend, base, blend(layer.colourBlend, texel ? [texel.data[k], texel.data[k + 1], texel.data[k + 2]] : WHITE, tint))
        for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(base[c] + (mixed[c] - base[c]) * strength)
      }
    }
  }
}
