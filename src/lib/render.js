import * as THREE from "three"
import { canvasOf } from "./canvas.js"
import { gradientLine, gradientStops } from "./material.js"
import { clamp } from "./maths.js"

const LIMIT = 6
const TILE = 4096
const region = new Int32Array(32)
const around = new Int32Array(4)

function autoCrop(canvas) {
  const { width, height } = canvas
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      maxY = y
    }
  }
  if (maxX < 0) return null
  const cropped = canvasOf(maxX - minX + 1, maxY - minY + 1)
  cropped.ctx.drawImage(canvas, -minX, -minY)
  return cropped.canvas
}

export function screenBounds(scene, camera) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const matrix = new THREE.Matrix4()
  const vertex = new THREE.Vector3()
  scene.traverseVisible(object => {
    const position = object.isMesh && object.geometry.attributes.position
    if (!position) return
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(object.matrixWorld)
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix)
      if (vertex.z < -1 || vertex.z > 1) continue
      const x = (vertex.x + 1) / 2
      const y = (1 - vertex.y) / 2
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  })
  minX = Math.max(minX, 0)
  maxX = Math.min(maxX, 1)
  minY = Math.max(minY, 0)
  maxY = Math.min(maxY, 1)
  if (!(maxX > minX && maxY > minY)) return null
  return { minX, maxX, minY, maxY }
}

function neighbours(p, width, height) {
  const x = p % width
  let count = 0
  if (x > 0) around[count++] = p - 1
  if (x < width - 1) around[count++] = p + 1
  if (p >= width) around[count++] = p - width
  if (p < width * (height - 1)) around[count++] = p + width
  return count
}

function same(data, p, solid) {
  return (data[p * 4 + 3] !== 0) === solid
}

function enclosed(data, p, x, y, width, height, solid) {
  return x > 0 && y > 0 && x < width - 1 && y < height - 1 && same(data, p - 1, solid) && same(data, p + 1, solid) && same(data, p - width, solid) && same(data, p + width, solid) && same(data, p - width - 1, solid)
}

function inRegion(q, found) {
  for (let i = 0; i < found; i++) {
    if (region[i] === q) return true
  }
  return false
}

function grow(data, start, width, height, solid) {
  region[0] = start
  let found = 1
  for (let read = 0; read < found; read++) {
    if (read === LIMIT) return 0
    const count = neighbours(region[read], width, height)
    for (let n = 0; n < count; n++) {
      const q = around[n]
      if (same(data, q, solid) && !inRegion(q, found)) region[found++] = q
    }
  }
  return found < LIMIT ? found : 0
}

function fill(data, p, width, height) {
  const sum = [0, 0, 0, 0]
  let solid = 0
  const count = neighbours(p, width, height)
  for (let n = 0; n < count; n++) {
    const q = around[n] * 4
    if (data[q + 3] === 0) continue
    solid++
    for (let c = 0; c < 4; c++) sum[c] += data[q + c]
  }
  if (!solid) return
  for (let c = 0; c < 4; c++) data[p * 4 + c] = sum[c] / solid
}

async function clean(canvas, step) {
  const { width, height } = canvas
  const ctx = canvas.getContext("2d")
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  for (let y = height - 1; y >= 0; y--) {
    await step(1 - y / height)
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x
      const solid = data[p * 4 + 3] !== 0
      if (enclosed(data, p, x, y, width, height, solid)) continue
      const size = grow(data, p, width, height, solid)
      for (let k = 0; k < size; k++) {
        if (solid) data[region[k] * 4 + 3] = 0
        else fill(data, region[k], width, height)
      }
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

function tracker({ signal, progress }) {
  let last = performance.now()
  return async function step(from, to, fraction) {
    progress(from + (to - from) * fraction)
    if (performance.now() - last < 30) return
    await new Promise(resolve => setTimeout(resolve))
    signal.throwIfAborted()
    last = performance.now()
  }
}

export async function renderTitle(renderer, scene, camera, resolution, antialias, task) {
  const step = tracker(task)
  camera.updateMatrixWorld()
  const bounds = screenBounds(scene, camera)
  if (!bounds) return null
  const size = renderer.getSize(new THREE.Vector2())
  const view = camera.view?.enabled ? camera.view : { fullWidth: size.x, fullHeight: size.y, offsetX: 0, offsetY: 0, width: size.x, height: size.y }
  const width = (bounds.maxX - bounds.minX) * view.width
  const height = (bounds.maxY - bounds.minY) * view.height
  const target = antialias ? resolution * 2 : resolution
  const outWidth = Math.max(1, Math.round(width * target / Math.max(width, height)))
  const outHeight = Math.max(1, Math.round(height * target / Math.max(width, height)))
  const scaleX = outWidth / width
  const scaleY = outHeight / height
  const shot = camera.clone()
  const left = (view.offsetX + bounds.minX * view.width) * scaleX
  const top = (view.offsetY + bounds.minY * view.height) * scaleY
  const ratio = renderer.getPixelRatio()
  const raw = canvasOf(outWidth, outHeight)
  raw.ctx.fillRect(outWidth - 1, outHeight - 1, 1, 1)
  if (raw.ctx.getImageData(outWidth - 1, outHeight - 1, 1, 1).data[3] !== 255) throw new Error(`the browser can't make a ${outWidth}x${outHeight} image`)
  raw.ctx.clearRect(outWidth - 1, outHeight - 1, 1, 1)
  try {
    renderer.setPixelRatio(1)
    const tiles = Math.ceil(outWidth / TILE) * Math.ceil(outHeight / TILE)
    let done = 0
    for (let y = 0; y < outHeight; y += TILE) {
      for (let x = 0; x < outWidth; x += TILE) {
        await step(0, 0.35, done++ / tiles)
        const tileWidth = Math.min(TILE, outWidth - x)
        const tileHeight = Math.min(TILE, outHeight - y)
        renderer.setSize(tileWidth, tileHeight, false)
        const { drawingBufferWidth, drawingBufferHeight } = renderer.getContext()
        if (drawingBufferWidth !== tileWidth || drawingBufferHeight !== tileHeight) throw new Error(`the browser only allowed a ${drawingBufferWidth}x${drawingBufferHeight} tile of ${tileWidth}x${tileHeight}`)
        shot.setViewOffset(view.fullWidth * scaleX, view.fullHeight * scaleY, left + x, top + y, tileWidth, tileHeight)
        renderer.render(scene, shot)
        raw.ctx.drawImage(renderer.domElement, x, y)
      }
    }
  } finally {
    renderer.setPixelRatio(ratio)
    renderer.setSize(size.x, size.y, false)
  }
  await step(0.35, 0.35, 0)
  const cropped = autoCrop(raw.canvas)
  if (!cropped) return null
  await clean(cropped, fraction => step(0.4, 0.9, fraction))
  const image = autoCrop(cropped)
  if (!image || !antialias) return image
  await step(0.95, 0.95, 0)
  const blurred = canvasOf(image.width, image.height)
  blurred.ctx.filter = "blur(0.75px)"
  blurred.ctx.drawImage(image, 0, 0)
  const out = canvasOf(Math.max(1, Math.floor(image.width / 2)), Math.max(1, Math.floor(image.height / 2)))
  out.ctx.drawImage(blurred.canvas, 0, 0, out.canvas.width, out.canvas.height)
  return out.canvas
}

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

function minecraft(image, mode, base, size) {
  const layout = minecraftLayout(mode, size)
  const { scale, x, y } = fitTitle(layout, image.width, image.height)
  const padded = canvasOf(Math.round(layout.padded[0]), Math.round(layout.padded[1]))
  padded.ctx.drawImage(image, x, y, image.width * scale, image.height * scale)
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

function outputSize(image, settings, padding) {
  const side = Math.max(image.width, image.height)
  if (settings.tab === "square") return [side, side]
  if (settings.tab === "custom") return [settings.width, settings.height]
  const scale = (side - padding * 2) / side
  return [Math.max(1, Math.round(image.width * scale)) + padding * 2, Math.max(1, Math.round(image.height * scale)) + padding * 2]
}

export function compose(image, settings, base) {
  if (settings.tab === "minecraft") return minecraft(image, settings.mode, base, settings.textureSize)
  const shortest = settings.tab === "custom" ? Math.min(settings.width, settings.height) : Math.max(image.width, image.height)
  const padding = clamp(settings.padding, 0, Math.floor((shortest - 1) / 2))
  const [width, height] = outputSize(image, settings, padding)
  const result = canvasOf(width, height)
  if (settings.backgroundEnabled) {
    const [from, to] = gradientLine(0, 0, width, height, settings.backgroundAngle)
    const gradient = result.ctx.createLinearGradient(...from, ...to)
    for (const stop of gradientStops(settings.backgroundStops, settings.backgroundSmooth)) gradient.addColorStop(stop.position, stop.colour)
    result.ctx.fillStyle = gradient
    result.ctx.fillRect(0, 0, width, height)
  }
  const ratio = Math.min((width - padding * 2) / image.width, (height - padding * 2) / image.height)
  const drawWidth = Math.round(image.width * ratio)
  const drawHeight = Math.round(image.height * ratio)
  result.ctx.drawImage(image, Math.floor((width - drawWidth) / 2), Math.floor((height - drawHeight) / 2), drawWidth, drawHeight)
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
