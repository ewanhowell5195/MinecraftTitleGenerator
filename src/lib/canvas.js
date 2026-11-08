import { platform } from "./platform.js"

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

let largest = 0

export function canvasLimit() {
  if (largest) return largest
  largest = 4096
  for (const size of [16384, 8192]) {
    try {
      const { ctx } = canvasOf(size, 1)
      ctx.fillRect(size - 1, 0, 1, 1)
      if (ctx.getImageData(size - 1, 0, 1, 1).data[3] === 255) {
        largest = size
        break
      }
    } catch {}
  }
  return largest
}

export function pixelsOf(image) {
  const { ctx } = surface(image.width, image.height, { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, image.width, image.height).data
}
