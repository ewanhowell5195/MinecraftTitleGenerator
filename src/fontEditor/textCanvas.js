import { stretched } from "../lib/arc.js"
import { lineLayout } from "../lib/layout.js"
import { parsedSheet } from "../lib/fontEditor.js"

const METRICS = ["spaceWidth", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "border", "characterSpacing"]
let unkerned = null

export function unkernedFont(font) {
  const { glyphs, capHeight } = parsedSheet(font)
  if (unkerned?.glyphs !== glyphs || METRICS.some(key => unkerned[key] !== font[key])) unkerned = { glyphs, capHeight, ...Object.fromEntries(METRICS.map(key => [key, font[key]])) }
  return unkerned
}

export function previewFont(font) {
  return { ...unkernedFont(font), kerning: font.kerning }
}

export function drawText(canvas, parsed, text, { maxWidth, maxHeight, maxScale = 8, terminators = false, raw = false, stretch = 1 }) {
  const grow = Math.round((stretch - 1) * parsed.capHeight)
  const placed = lineLayout(parsed, [{ text, space: false, creeper: true }], { spacing: parsed.characterSpacing, terminators, raw }).map(item => grow && item.glyph.mask ? { ...item, glyph: stretched(item.glyph, item.glyph.char, [], grow) } : item)
  const ctx = canvas.getContext("2d")
  const border = parsed.border
  if (!placed.length) {
    canvas.width = 1
    canvas.height = 1
    return false
  }
  const left = Math.min(...placed.map(item => item.x)) - border
  const right = Math.max(...placed.map(item => item.x + item.glyph.width)) + border
  const top = Math.max(parsed.capHeight, ...placed.map(item => item.glyph.top)) + border
  const bottom = Math.min(0, ...placed.map(item => item.glyph.bottom)) - border
  const width = right - left
  const height = top - bottom
  const scale = Math.min(maxScale, maxWidth / width, maxHeight / height)
  const pixel = Math.max(1, Math.ceil(scale * (devicePixelRatio || 1)))
  canvas.width = width * pixel
  canvas.height = height * pixel
  canvas.style.width = `${width * scale}px`
  canvas.style.height = `${height * scale}px`
  ctx.setTransform(pixel, 0, 0, pixel, 0, 0)
  for (const [colour, grow] of [["#000", border], ["#fff", 0]]) {
    ctx.fillStyle = colour
    for (const { glyph, x } of placed) {
      const originX = x - left
      const originY = top - glyph.top
      for (let row = 0; row < glyph.height; row++) {
        for (let column = 0; column < glyph.width; column++) {
          if (glyph.mask[(glyph.height - 1 - row) * glyph.width + column]) ctx.fillRect(originX + column - grow, originY + row - grow, 1 + grow * 2, 1 + grow * 2)
        }
      }
    }
  }
  return true
}
