import * as THREE from "three"
import { canvasOf } from "../lib/texture/canvas.js"
import { platform } from "../lib/core/platform.js"
import { cullOutlines } from "./stage.js"
import { clean, writeFlipped } from "./pixelClean.js"

const TILE = 4096
export const SAMPLES = 4
// wider than LIMIT so clean sees whole regions, and divisible by SAMPLES to keep tiles on the output pixel grid
const MARGIN = 8
const STRIDE = TILE - MARGIN * 2
let hidden = null

function opaqueBounds(canvas) {
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
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function cropTo(canvas, { left, top, width, height }) {
  const cropped = canvasOf(width, height)
  cropped.ctx.drawImage(canvas, -left, -top)
  return cropped.canvas
}

export function screenBounds(scene, camera) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const matrix = new THREE.Matrix4()
  const vertex = new THREE.Vector3()
  cullOutlines(scene, camera)
  scene.traverseVisible(object => {
    const position = object.isMesh && (object.userData.extent ?? object.geometry.attributes.position)
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

function tracker({ signal, progress }) {
  let last = performance.now()
  return async function step(fraction, part = 0) {
    if (performance.now() - last < 100) return
    progress(fraction, part)
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

async function draw(framed, scene, camera, samples, step) {
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
        const shrunk = samples > 1 ? halve(halve(tile.canvas, half), quarter) : tile.canvas
        const shownWidth = Math.min(STRIDE, renderWidth - x) / samples
        const shownHeight = Math.min(STRIDE, renderHeight - y) / samples
        final.ctx.drawImage(shrunk, (x - tileLeft) / samples, (y - tileTop) / samples, shownWidth, shownHeight, x / samples, y / samples, shownWidth, shownHeight)
      }
    }
  } finally {
    renderer.setSize(1, 1, false)
  }
  return final.canvas
}

export async function renderTitle(size, scene, camera, resolution, antialias, task) {
  const samples = antialias ? SAMPLES : 1
  const framed = titleShot(scene, camera, size, resolution * samples)
  if (!framed) return null
  const image = await draw(framed, scene, camera, samples, tracker(task))
  const bounds = opaqueBounds(image)
  return bounds && cropTo(image, bounds)
}

export async function renderPasses(size, scene, camera, resolution, antialias, task, passes) {
  const samples = antialias ? SAMPLES : 1
  const framed = titleShot(scene, camera, size, resolution * samples)
  if (!framed) return null
  const step = tracker(task)
  const full = await draw(framed, scene, camera, samples, step)
  const bounds = opaqueBounds(full)
  if (!bounds) return null
  const images = []
  for (const [index, pass] of passes.entries()) {
    const leave = pass()
    try {
      images.push(cropTo(await draw(framed, scene, camera, samples, fraction => step(fraction, index + 1)), bounds))
    } finally {
      leave()
    }
  }
  task.progress(1, passes.length)
  return { image: cropTo(full, bounds), images }
}
