import { pixelsOf, surface } from "./canvas.js"
import { expandBands, independentLayers } from "../font/flatSheet.js"
import { defaultDepth } from "../settings/defaults.js"

const bands = new WeakMap()

export function bandOf(source, band, font) {
  const count = font.layers?.length ?? 1
  if (count < 2) return source
  if (!bands.has(source)) bands.set(source, new WeakMap())
  const split = bands.get(source)
  if (!split.has(font)) {
    const expanded = expandBands(pixelsOf(source), source.width, font.cells, font.capHeight, defaultDepth(font), font.layers, independentLayers(font))
    const height = expanded.height / count
    const size = expanded.width * height * 4
    split.set(font, Array.from({ length: count }, (_, index) => {
      const { canvas, ctx } = surface(expanded.width, height)
      const pixels = ctx.createImageData(expanded.width, height)
      pixels.data.set(expanded.data.subarray(index * size, (index + 1) * size))
      ctx.putImageData(pixels, 0, 0)
      return canvas
    }))
  }
  return split.get(font)[band]
}

const stripBands = new WeakMap()

export function stripBand(source, top, height) {
  if (!stripBands.has(source)) stripBands.set(source, new Map())
  const cropped = stripBands.get(source)
  const key = `${top}:${height}`
  if (!cropped.has(key)) {
    if (!Number.isInteger(top) || !Number.isInteger(height) || top + height > source.height) throw new Error(`a strip ${source.height}px tall has no layer band at ${top}px that is ${height}px tall`)
    const { canvas, ctx } = surface(source.width, height)
    ctx.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height)
    cropped.set(key, canvas)
  }
  return cropped.get(key)
}
