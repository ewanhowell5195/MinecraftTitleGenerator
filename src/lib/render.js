import * as THREE from "three"
import { canvasOf } from "./canvas.js"
import { gradientLine, gradientStops } from "./material.js"
import { clamp } from "./maths.js"
import { platform } from "./platform.js"

const LIMIT = 6
const TILE = 4096
export const SAMPLES = 4
// wider than LIMIT so clean sees whole regions, and divisible by SAMPLES to keep tiles on the output pixel grid
const MARGIN = 8
const STRIDE = TILE - MARGIN * 2
const region = new Int32Array(32)
const around = new Int32Array(4)
let hidden = null

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

export function titleShot(scene, camera, size, target) {
  camera.updateMatrixWorld()
  const bounds = screenBounds(scene, camera)
  if (!bounds) return null
  const view = camera.view?.enabled ? camera.view : { fullWidth: size.x, fullHeight: size.y, offsetX: 0, offsetY: 0, width: size.x, height: size.y }
  const width = (bounds.maxX - bounds.minX) * view.width
  const height = (bounds.maxY - bounds.minY) * view.height
  const longest = Math.max(width, height)
  return { bounds, view, width, height, outWidth: Math.max(1, Math.round(width * target / longest)), outHeight: Math.max(1, Math.round(height * target / longest)) }
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

function same(pixels, p, solid) {
  return (pixels[p] !== 0) === solid
}

// rows run bottom to top, as gl.readPixels returns them
function enclosed(pixels, p, x, y, width, height) {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return false
  const a = pixels[p]
  const b = pixels[p - 1]
  const c = pixels[p + 1]
  const d = pixels[p - width]
  const e = pixels[p + width]
  const f = pixels[p + width - 1]
  return (a | b | c | d | e | f) === 0 || (a & b & c & d & e & f) >>> 24 === 255
}

function inRegion(q, found) {
  for (let i = 0; i < found; i++) {
    if (region[i] === q) return true
  }
  return false
}

function grow(pixels, start, width, height, solid) {
  region[0] = start
  let found = 1
  for (let read = 0; read < found; read++) {
    if (read === LIMIT) return 0
    const count = neighbours(region[read], width, height)
    for (let n = 0; n < count; n++) {
      const q = around[n]
      if (same(pixels, q, solid) && !inRegion(q, found)) region[found++] = q
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

function cleanRow(data, pixels, y, width, height) {
  let changed = false
  for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x
    if (enclosed(pixels, p, x, y, width, height)) continue
    const solid = pixels[p] !== 0
    const size = grow(pixels, p, width, height, solid)
    if (size) changed = true
    for (let k = 0; k < size; k++) {
      if (solid) pixels[region[k]] = 0
      else fill(data, region[k], width, height)
    }
  }
  return changed
}

async function clean(data, width, height, step) {
  const pixels = new Uint32Array(data.buffer, 0, width * height)
  let changed = false
  for (let y = 0; y < height; y++) {
    await step(y / height)
    if (cleanRow(data, pixels, y, width, height)) changed = true
  }
  return changed
}

export function writeFlipped(ctx, data, width, height) {
  const image = new ImageData(width, height)
  for (let y = 0; y < height; y++) image.data.set(data.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4)
  ctx.putImageData(image, 0, 0)
}

function tracker({ signal, progress }) {
  let last = performance.now()
  return async function step(fraction) {
    if (performance.now() - last < 100) return
    progress(fraction)
    await new Promise(resolve => setTimeout(resolve))
    signal.throwIfAborted()
    last = performance.now()
  }
}

function resize({ canvas, ctx }, width, height) {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  ctx.globalCompositeOperation = "copy"
}

function halve(image, out) {
  resize(out, image.width / 2, image.height / 2)
  out.ctx.drawImage(image, 0, 0, image.width / 2, image.height / 2)
  return out.canvas
}

function hiddenRenderer() {
  if (hidden) return hidden
  hidden = platform.createWebGLRenderer()
  hidden.setPixelRatio(1)
  return hidden
}

export async function renderTitle(size, scene, camera, resolution, antialias, task) {
  const step = tracker(task)
  const samples = antialias ? SAMPLES : 1
  const framed = titleShot(scene, camera, size, resolution * samples)
  if (!framed) return null
  const { bounds, view, width, height, outWidth, outHeight } = framed
  const scaleX = outWidth / width
  const scaleY = outHeight / height
  const shot = camera.clone()
  shot.layers.set(0)
  const left = (view.offsetX + bounds.minX * view.width) * scaleX
  const top = (view.offsetY + bounds.minY * view.height) * scaleY
  const finalWidth = Math.ceil(outWidth / samples)
  const finalHeight = Math.ceil(outHeight / samples)
  const renderWidth = finalWidth * samples
  const renderHeight = finalHeight * samples
  const final = canvasOf(finalWidth, finalHeight)
  final.ctx.fillRect(finalWidth - 1, finalHeight - 1, 1, 1)
  if (final.ctx.getImageData(finalWidth - 1, finalHeight - 1, 1, 1).data[3] !== 255) throw new Error(`the browser can't make a ${finalWidth}x${finalHeight} image`)
  final.ctx.clearRect(finalWidth - 1, finalHeight - 1, 1, 1)
  final.ctx.imageSmoothingEnabled = false
  const tile = canvasOf(1, 1)
  const half = canvasOf(1, 1)
  const quarter = canvasOf(1, 1)
  const data = new Uint8ClampedArray(Math.min(TILE, renderWidth) * Math.min(TILE, renderHeight) * 4)
  const bytes = new Uint8Array(data.buffer)
  const renderer = hiddenRenderer()
  const gl = renderer.getContext()
  try {
    const tiles = Math.ceil(renderWidth / STRIDE) * Math.ceil(renderHeight / STRIDE)
    let done = 0
    for (let y = 0; y < renderHeight; y += STRIDE) {
      for (let x = 0; x < renderWidth; x += STRIDE) {
        const tileLeft = Math.max(0, x - MARGIN)
        const tileTop = Math.max(0, y - MARGIN)
        const tileWidth = Math.min(renderWidth, x + STRIDE + MARGIN) - tileLeft
        const tileHeight = Math.min(renderHeight, y + STRIDE + MARGIN) - tileTop
        renderer.setSize(tileWidth, tileHeight, false)
        if (gl.drawingBufferWidth !== tileWidth || gl.drawingBufferHeight !== tileHeight) throw new Error(`the browser only allowed a ${gl.drawingBufferWidth}x${gl.drawingBufferHeight} tile of ${tileWidth}x${tileHeight}`)
        shot.setViewOffset(view.fullWidth * scaleX, view.fullHeight * scaleY, left + tileLeft, top + tileTop, tileWidth, tileHeight)
        renderer.render(scene, shot)
        resize(tile, tileWidth, tileHeight)
        tile.ctx.imageSmoothingEnabled = false
        tile.ctx.drawImage(renderer.domElement, 0, 0)
        gl.readPixels(0, 0, tileWidth, tileHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
        if (await clean(data, tileWidth, tileHeight, fraction => step((done + fraction) / tiles))) writeFlipped(tile.ctx, data, tileWidth, tileHeight)
        done++
        const shrunk = antialias ? halve(halve(tile.canvas, half), quarter) : tile.canvas
        const shownWidth = Math.min(STRIDE, renderWidth - x) / samples
        const shownHeight = Math.min(STRIDE, renderHeight - y) / samples
        final.ctx.drawImage(shrunk, (x - tileLeft) / samples, (y - tileTop) / samples, shownWidth, shownHeight, x / samples, y / samples, shownWidth, shownHeight)
      }
    }
  } finally {
    renderer.setSize(1, 1, false)
  }
  return autoCrop(final.canvas)
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

export function outputSize(image, settings, padding) {
  const side = Math.max(image.width, image.height)
  if (settings.tab === "square") return [side, side]
  if (settings.tab === "custom") return [settings.width, settings.height]
  const scale = (side - padding * 2) / side
  return [Math.max(1, Math.round(image.width * scale)) + padding * 2, Math.max(1, Math.round(image.height * scale)) + padding * 2]
}

export function placement(image, settings) {
  const shortest = settings.tab === "custom" ? Math.min(settings.width, settings.height) : Math.max(image.width, image.height)
  const padding = clamp(settings.padding, 0, Math.floor((shortest - 1) / 2))
  const [width, height] = outputSize(image, settings, padding)
  const ratio = Math.min((width - padding * 2) / image.width, (height - padding * 2) / image.height)
  const drawWidth = Math.round(image.width * ratio)
  const drawHeight = Math.round(image.height * ratio)
  const background = settings.backgroundEnabled ? { line: gradientLine(0, 0, width, height, settings.backgroundAngle), stops: gradientStops(settings.backgroundStops, settings.backgroundSmooth) } : null
  return { width, height, ratio, x: Math.floor((width - drawWidth) / 2), y: Math.floor((height - drawHeight) / 2), drawWidth, drawHeight, background }
}

export function compose(image, settings, base) {
  if (settings.tab === "minecraft") return minecraft(image, settings.mode, base, settings.textureSize)
  const { width, height, x, y, drawWidth, drawHeight, background } = placement(image, settings)
  const result = canvasOf(width, height)
  if (background) {
    const [from, to] = background.line
    const gradient = result.ctx.createLinearGradient(...from, ...to)
    for (const stop of background.stops) gradient.addColorStop(stop.position, stop.colour)
    result.ctx.fillStyle = gradient
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
