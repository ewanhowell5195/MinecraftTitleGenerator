import { blend } from "../../generator/blend.js"
import { pixelsOf } from "../lib/canvas.js"
import { rgbOf } from "../lib/colour.js"
import { generatedAlpha, withGenerated } from "../lib/generated.js"
import { layout } from "../lib/layout.js"
import { defaultBorder, defaultDepth, overlayLayer } from "../lib/settings.js"
import { stripRows, stripY } from "../lib/strips.js"
import { previewFont } from "./textCanvas.js"

const MARGIN = 2
const TEXT = "abc"
const OVERLAYS = withGenerated({})

export function thumbnailScene(font) {
  const parsed = previewFont(font)
  const placed = layout(parsed, TEXT, { spacing: font.characterSpacing })
  if (!placed.length) return null
  const minX = Math.min(...placed.map(item => item.x))
  const maxX = Math.max(...placed.map(item => item.x + item.glyph.width))
  const top = Math.max(...placed.map(item => item.glyph.top))
  const bottom = Math.min(...placed.map(item => item.glyph.bottom))
  const ring = defaultBorder("top", font) > 0
  const margin = ring ? MARGIN : 0
  const drawn = Object.values(parsed.glyphs).filter(glyph => glyph.width)
  return {
    capHeight: parsed.capHeight,
    depth: defaultDepth(font),
    ring,
    frame: { width: maxX - minX + margin * 2, height: top - bottom + margin * 2 },
    stripTop: Math.max(parsed.capHeight, ...drawn.map(glyph => glyph.top)),
    stripBottom: Math.min(0, ...drawn.map(glyph => glyph.bottom)),
    placed: placed.map(item => ({ glyph: item.glyph, x: item.x - minX + margin, y: top - item.glyph.top + margin, lineX: item.x - placed[0].x }))
  }
}

function over(target, width, x, y, [r, g, b, a]) {
  if (!a || x < 0 || y < 0 || x >= width) return
  const i = (y * width + x) * 4
  if (i >= target.length) return
  const da = target[i + 3] / 255
  const sa = a / 255
  const oa = sa + da * (1 - sa)
  target[i] = Math.round((r * sa + target[i] * da * (1 - sa)) / oa)
  target[i + 1] = Math.round((g * sa + target[i + 1] * da * (1 - sa)) / oa)
  target[i + 2] = Math.round((b * sa + target[i + 2] * da * (1 - sa)) / oa)
  target[i + 3] = Math.round(oa * 255)
}

function filled(glyph, column, row) {
  return glyph.mask[(glyph.height - 1 - row) * glyph.width + column]
}

export function stripThumbnail(scene, entry, image) {
  const pixels = pixelsOf(image)
  const shape = stripRows(entry, { top: scene.stripTop, bottom: scene.stripBottom }, scene.depth, scene.capHeight)
  const density = image.height / shape.rows
  const d = Math.max(1, Math.ceil(density))
  const width = scene.frame.width * d
  const height = scene.frame.height * d
  const data = new Uint8ClampedArray(width * height * 4)
  const border = rgbOf(entry.border ?? "#000000").concat(255)
  if (scene.ring) {
    for (const { glyph, x, y } of scene.placed) {
      for (let r = 0; r < glyph.height; r++) {
        for (let c = 0; c < glyph.width; c++) {
          if (!filled(glyph, c, r)) continue
          for (let dy = -MARGIN; dy <= MARGIN; dy++) {
            for (let dx = -MARGIN; dx <= MARGIN; dx++) {
              for (let j = 0; j < d; j++) {
                for (let i = 0; i < d; i++) over(data, width, (x + c + dx) * d + i, (y + r + dy) * d + j, border)
              }
            }
          }
        }
      }
    }
  }
  const stripTop = shape.depth + shape.top
  for (const { glyph, x, y, lineX } of scene.placed) {
    const origin = (entry.tiling ?? "line") === "character" ? 0 : lineX
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        if (!filled(glyph, Math.floor(px / d), Math.floor(py / d))) continue
        const row = stripTop - 1 - stripY(shape, glyph.top - 1 - Math.floor(py / d))
        const sx = Math.floor((origin * d + px) * density / d) % image.width
        const sy = Math.floor((row * d + py % d) * density / d)
        const k = (sy * image.width + sx) * 4
        over(data, width, x * d + px, y * d + py, [pixels[k], pixels[k + 1], pixels[k + 2], pixels[k + 3]])
      }
    }
  }
  for (const layer of entry.overlays ?? []) {
    const known = OVERLAYS[layer.overlay]
    if (!known?.generated) continue
    const settings = { ...overlayLayer(layer.overlay, known), ...layer }
    const tint = rgbOf(settings.colour)
    for (const { glyph, x, y } of scene.placed) {
      const alpha = generatedAlpha({ ...glyph, placedX: x }, known.generated, settings, scene.capHeight, d)
      for (let py = 0; py < glyph.height * d; py++) {
        for (let px = 0; px < glyph.width * d; px++) {
          const strength = alpha[py * glyph.width * d + px] * settings.opacity / 100
          const i = ((y * d + py) * width + x * d + px) * 4
          if (!strength || !data[i + 3]) continue
          const base = [data[i], data[i + 1], data[i + 2]]
          const mixed = blend(settings.blend, base, blend(settings.colourBlend, [255, 255, 255], tint))
          for (let c = 0; c < 3; c++) data[i + c] = Math.round(base[c] + (mixed[c] - base[c]) * strength)
        }
      }
    }
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d").putImageData(new ImageData(data, width, height), 0, 0)
  return canvas.toDataURL("image/png")
}
