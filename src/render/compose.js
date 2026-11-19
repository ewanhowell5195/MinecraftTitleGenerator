import { canvasOf, linearGradient } from "../lib/texture/canvas.js"
import { gradientLine, gradientStops } from "../lib/texture/material.js"
import { clamp } from "../lib/core/maths.js"

const WHOLE = { size: value => Math.max(1, Math.round(value)), drawn: Math.round, offset: Math.floor }
export const EXACT = { size: value => value, drawn: value => value, offset: value => value }

export function minecraftLayout(mode, size) {
  if (mode === "1.19") {
    const width = size * 137 / 128
    const height = size * 22 / 128
    const split = Math.floor(width * 155 / 274)
    return { width, height, left: 0, top: 0, padded: [width, height], output: [size, size], split, shift: [-split, Math.floor(height * 45 / 44)] }
  }
  if (mode === "mojang") {
    const margin = size / 128
    return { width: size * 2 - margin * 2, height: size / 2 - margin / 2, left: margin, top: margin / 4, padded: [size * 2, size / 2], output: [size, size], split: size, shift: [-size, size / 2] }
  }
  return { width: size, height: size * 176 / 1024, left: 0, top: 0, padded: [size, size / 4], output: [size, size / 4], split: null, shift: null }
}

export function fitTitle(layout, width, height) {
  const scale = Math.min(layout.width / width, layout.height / height)
  return { scale, x: layout.left + (layout.width - width * scale) / 2, y: layout.top + (layout.height - height * scale) / 2 }
}

export function drawnTitle(layout, width, height) {
  const { scale, x, y } = fitTitle(layout, width, height)
  return { scale, x: Math.round(x), y: Math.round(y), width: Math.round(width * scale), height: Math.round(height * scale) }
}

function minecraft(image, mode, base, size) {
  const layout = minecraftLayout(mode, size)
  const { x, y, width: drawWidth, height: drawHeight } = drawnTitle(layout, image.width, image.height)
  const padded = canvasOf(Math.round(layout.padded[0]), Math.round(layout.padded[1]))
  padded.ctx.drawImage(image, x, y, drawWidth, drawHeight)
  const result = canvasOf(...layout.output)
  if (mode === "1.19") {
    result.ctx.imageSmoothingEnabled = false
    result.ctx.drawImage(base, 0, 0, size, size)
  }
  if (layout.split === null) {
    result.ctx.drawImage(padded.canvas, 0, 0)
    return result.canvas
  }
  const { width, height } = padded.canvas
  result.ctx.drawImage(padded.canvas, 0, 0, layout.split, height, 0, 0, layout.split, height)
  result.ctx.drawImage(padded.canvas, layout.split, 0, width - layout.split, height, layout.split + layout.shift[0], layout.shift[1], width - layout.split, height)
  return result.canvas
}

export function outputSize(image, settings, padding, snap = WHOLE) {
  const side = Math.max(image.width, image.height)
  if (settings.tab === "square") return [side, side]
  if (settings.tab === "custom") return [settings.width, settings.height]
  const scale = (side - padding * 2) / side
  return [snap.size(image.width * scale) + padding * 2, snap.size(image.height * scale) + padding * 2]
}

export function placement(image, settings, snap = WHOLE) {
  const shortest = settings.tab === "custom" ? Math.min(settings.width, settings.height) : Math.max(image.width, image.height)
  const padding = clamp(settings.padding, 0, Math.floor((shortest - 1) / 2))
  const [width, height] = outputSize(image, settings, padding, snap)
  const ratio = Math.min((width - padding * 2) / image.width, (height - padding * 2) / image.height)
  const drawWidth = snap.drawn(image.width * ratio)
  const drawHeight = snap.drawn(image.height * ratio)
  const background = settings.backgroundEnabled ? { line: gradientLine(0, 0, width, height, settings.backgroundAngle), stops: gradientStops(settings.backgroundStops, settings.backgroundSmooth) } : null
  return { width, height, ratio, x: snap.offset((width - drawWidth) / 2), y: snap.offset((height - drawHeight) / 2), drawWidth, drawHeight, background }
}

export function compose(image, settings, base) {
  if (settings.tab === "minecraft") return minecraft(image, settings.mode, base, settings.textureSize)
  const { width, height, x, y, drawWidth, drawHeight, background } = placement(image, settings)
  const result = canvasOf(width, height)
  if (background) {
    const [from, to] = background.line
    result.ctx.fillStyle = linearGradient(result.ctx, ...from, ...to, background.stops)
    result.ctx.fillRect(0, 0, width, height)
  }
  result.ctx.drawImage(image, x, y, drawWidth, drawHeight)
  return result.canvas
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

export function aspectOf(width, height) {
  const divisor = gcd(width, height)
  return [width / divisor, height / divisor]
}

export function fromAspect(aspectWidth, aspectHeight, width, height, byWidth, max) {
  if (byWidth) {
    const result = [width, Math.floor(width * aspectHeight / aspectWidth)]
    return result[1] > max ? [Math.floor(max * aspectWidth / aspectHeight), max] : result
  }
  const result = [Math.floor(height * aspectWidth / aspectHeight), height]
  return result[0] > max ? [max, Math.floor(max * aspectHeight / aspectWidth)] : result
}
