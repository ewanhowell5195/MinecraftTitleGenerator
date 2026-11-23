import { platform } from "../core/platform.js"

export function canvasOf(width, height, options) {
  const canvas = platform.createCanvas()
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext("2d", options) }
}

export function surface(width, height, options) {
  const result = canvasOf(width, height, options)
  result.ctx.imageSmoothingEnabled = false
  return result
}

export function fillPattern(ctx, image, matrix) {
  // Safari keeps a pattern's first transform, so every transform needs a fresh pattern
  const pattern = ctx.createPattern(image, "repeat")
  pattern.setTransform(matrix)
  ctx.fillStyle = pattern
}

export function linearGradient(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const stop of stops) gradient.addColorStop(stop.position, stop.colour)
  return gradient
}

export function fadeStops(colour, clear, fade) {
  return [{ position: 0, colour: clear }, { position: Math.max(0, -fade), colour: clear }, { position: 1 - Math.max(0, fade), colour }, { position: 1, colour }]
}

function drawsAt(width, height) {
  try {
    const { canvas, ctx } = canvasOf(width, height)
    ctx.fillRect(width - 1, height - 1, 1, 1)
    const drawn = ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255
    canvas.width = 0
    canvas.height = 0
    return drawn
  } catch {
    return false
  }
}

let largest = 0

export function canvasLimit() {
  largest ||= [16384, 8192].find(size => drawsAt(size, 1)) ?? 4096
  return largest
}

const TEXTURE_CEILING = 8192
let textureSide = 0

export function largestTexture(gpu, draws) {
  return [TEXTURE_CEILING, 4096, 2048].find(size => size <= (gpu || TEXTURE_CEILING) && draws(size)) ?? 2048
}

export function textureLimit() {
  textureSide ||= largestTexture(platform.maxTextureSize(), size => drawsAt(size, size))
  return textureSide
}

export function pixelsOf(image) {
  const { ctx } = surface(image.width, image.height, { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, image.width, image.height).data
}
