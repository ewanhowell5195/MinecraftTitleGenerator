import { platform } from "../../core/platform.js"
import { pixelsOf, surface } from "../canvas.js"
import { SWATCH } from "../atlas/pages.js"
import { coverFit } from "./cover.js"
import { runBake, STRIDE } from "./coverRaster.js"
import { plain } from "./draw.js"

const DENSITY_PERCENTILE = 0.9
const PREVIEW_SIZE = 512
const levelImages = new WeakMap()
const levelPixels = new WeakMap()
const levelBitmaps = new WeakMap()
const bitmapPixels = new WeakMap()
const waiting = new Map()
const sent = new Set()
let worker = null
let sources = 0
let jobs = 0

function cached(store, image, level, make) {
  if (!store.has(image)) store.set(image, new Map())
  const levels = store.get(image)
  if (!levels.has(level)) levels.set(level, make())
  return levels.get(level)
}

function levelSize(image, level) {
  return [Math.max(1, Math.ceil(image.width / 2 ** level)), Math.max(1, Math.ceil(image.height / 2 ** level))]
}

function levelImage(image, level) {
  return cached(levelImages, image, level, () => {
    if (!level) return image
    const { canvas, ctx } = surface(...levelSize(image, level))
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  })
}

function pixelSource(source) {
  const pixels = pixelsOf(source)
  return { id: ++sources, width: source.width, height: source.height, pixels: new Uint32Array(pixels.buffer, pixels.byteOffset, source.width * source.height) }
}

function levelOf(image, level) {
  return cached(levelPixels, image, level, () => pixelSource(levelImage(image, level)))
}

function bitmapOf(image, level) {
  return cached(levelBitmaps, image, level, () => {
    const [width, height] = levelSize(image, level)
    const entry = { bitmap: null, waiters: new Set() }
    entry.ready = createImageBitmap(image, { ...(level && { resizeWidth: width, resizeHeight: height, resizeQuality: "high" }), premultiplyAlpha: "none", colorSpaceConversion: "none" }).then(bitmap => {
      entry.bitmap = bitmap
      for (const waiter of entry.waiters) waiter()
      entry.waiters.clear()
      return bitmap
    })
    return entry
  })
}

async function bitmapLevelOf(image, level) {
  const bitmap = await bitmapOf(image, level).ready
  return cached(bitmapPixels, image, level, () => pixelSource(bitmap))
}

function previewLevel(image) {
  let level = 0
  while (Math.max(...levelSize(image, level)) > PREVIEW_SIZE) level++
  return level
}

function shownLevel(image, level, refresh) {
  const wanted = bitmapOf(image, level)
  if (wanted.bitmap) return wanted.bitmap
  wanted.waiters.add(refresh)
  const ready = Array.from(levelBitmaps.get(image)).filter(([, entry]) => entry.bitmap).sort(([a], [b]) => (a < level) - (b < level) || Math.abs(a - level) - Math.abs(b - level))
  return ready[0]?.[1].bitmap ?? levelImage(image, Math.max(level, previewLevel(image)))
}

function screenOf({ x, y, z }, { orthographic, lens }) {
  return orthographic ? [x / lens, y / lens ** 2] : [x / z, y / z]
}

function fitOf(projection, image) {
  const { minX, maxX, minY, maxY } = projection.box
  return coverFit({ x: minX, y: -maxY, width: maxX - minX, height: maxY - minY }, image, ...projection.position)
}

function levelFor(image, fit, { positions, uvs, sizes, groups }, layouts, projection, detail) {
  const e = projection.matrix
  const { orthographic, lens } = projection
  const mirrored = mirrors(e)
  const corners = new Float64Array(12)
  const densities = []
  let vertex = 0
  for (let face = 0; vertex < positions.length / 3; face++) {
    const count = sizes ? sizes[face] : 6
    const page = layouts[pageOf(groups, vertex)]
    const { x: sx, y: sy, scale } = page.swatch
    const size = SWATCH * scale
    for (let start = vertex; start < vertex + count; start += 3) {
      let swatched = true
      for (let corner = 0; corner < 3; corner++) {
        const at = start + corner
        const x = positions[at * 3]
        const y = positions[at * 3 + 1]
        const z = positions[at * 3 + 2]
        const cx = e[0] * x + e[4] * y + e[8] * z + e[12]
        const cy = e[1] * x + e[5] * y + e[9] * z + e[13]
        const depth = -(e[2] * x + e[6] * y + e[10] * z + e[14])
        const u = uvs[at * 2] * page.width
        const v = (1 - uvs[at * 2 + 1]) * page.height
        corners.set([u, v, orthographic ? cx / lens : cx / depth, orthographic ? cy / lens ** 2 : cy / depth], corner * 4)
        swatched &&= u >= sx - 0.01 && u <= sx + size + 0.01 && v >= sy - 0.01 && v <= sy + size + 0.01
      }
      if (swatched) continue
      const screenArea = (corners[6] - corners[2]) * (corners[11] - corners[3]) - (corners[10] - corners[2]) * (corners[7] - corners[3])
      if (mirrored ? screenArea >= 0 : screenArea <= 0) continue
      const uvArea = Math.abs((corners[4] - corners[0]) * (corners[9] - corners[1]) - (corners[8] - corners[0]) * (corners[5] - corners[1]))
      if (uvArea) densities.push(Math.sqrt(uvArea / Math.abs(screenArea)) * detail)
    }
    vertex += count
  }
  if (!densities.length) return 0
  const sorted = Float64Array.from(densities).sort()
  const needed = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * DENSITY_PERCENTILE))]
  let level = 0
  while (Math.min(image.width, image.height) / 2 ** (level + 1) >= 1 && 1 / fit.scale / 2 ** (level + 1) >= needed) level++
  return level
}

function viewOf(projection, fit, image, [width, height]) {
  return { orthographic: projection.orthographic, lens: projection.lens, fitX: fit.x, fitY: fit.y, scale: fit.scale * image.width / width, imageWidth: width, imageHeight: height }
}

function coverView(built, projection, image) {
  const fit = fitOf(projection, image)
  const level = levelFor(image, fit, built.body, built.layouts, projection, 1)
  return { level, view: viewOf(projection, fit, image, levelSize(image, level)) }
}

export function coverShading(built, projection, image, detail, refresh) {
  const fit = fitOf(projection, image)
  const source = shownLevel(image, levelFor(image, fit, built.body, built.layouts, projection, detail), refresh)
  return { source, view: viewOf(projection, fit, image, [source.width, source.height]) }
}

function onTexelEdge(value) {
  return Math.abs(value - Math.round(value)) < 0.01
}

function pageOf(groups, vertex) {
  return groups.find(group => vertex >= group.start && vertex < group.start + group.count).page
}

function cornerOf(positions, uvs, at, page, e) {
  const x = positions[at * 3]
  const y = positions[at * 3 + 1]
  const z = positions[at * 3 + 2]
  return {
    u: uvs[at * 2] * page.width,
    v: (1 - uvs[at * 2 + 1]) * page.height,
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    y: e[1] * x + e[5] * y + e[9] * z + e[13],
    z: -(e[2] * x + e[6] * y + e[10] * z + e[14])
  }
}

function inSwatch({ x, y, scale }, corners) {
  const size = SWATCH * scale
  return corners.every(({ u, v }) => u >= x - 0.01 && u <= x + size + 0.01 && v >= y - 0.01 && v <= y + size + 0.01)
}

function mirrors(e) {
  return e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]) < 0
}

function facesCamera([a, b, c], projection, mirrored) {
  const [ax, ay] = screenOf(a, projection)
  const [bx, by] = screenOf(b, projection)
  const [cx, cy] = screenOf(c, projection)
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
  return mirrored ? area < 0 : area > 0
}

function trianglesOf(body, layouts, projection) {
  const { positions, uvs, sizes, groups } = body
  const found = []
  const mirrored = mirrors(projection.matrix)
  let vertex = 0
  for (let face = 0; vertex < positions.length / 3; face++) {
    const count = sizes ? sizes[face] : 6
    const page = pageOf(groups, vertex)
    for (let start = vertex; start < vertex + count; start += 3) {
      const corners = [0, 1, 2].map(offset => cornerOf(positions, uvs, start + offset, layouts[page], projection.matrix))
      if (inSwatch(layouts[page].swatch, corners) || !facesCamera(corners, projection, mirrored)) continue
      found.push({ page, corners, depth: (corners[0].z + corners[1].z + corners[2].z) / 3 })
    }
    vertex += count
  }
  return found.sort((a, b) => b.depth - a.depth)
}

function packed(triangles) {
  const data = new Float64Array(triangles.length * STRIDE)
  for (const [index, { page, corners }] of triangles.entries()) {
    const at = index * STRIDE
    data[at] = page
    data[at + 1] = corners.every(({ u, v }) => onTexelEdge(u) && onTexelEdge(v)) ? 1 : 0
    for (const [corner, { u, v, x, y, z }] of corners.entries()) data.set([u, v, x, y, z], at + 2 + corner * 5)
  }
  return data
}

function prepareBake(built, projection, image) {
  const { level, view } = coverView(built, projection, image)
  return { level, job: { pages: built.layouts.map(page => [page.width, page.height]), triangles: packed(trianglesOf(built.body, built.layouts, projection)), view } }
}

function basesFrom(results, pages) {
  return results.map((words, index) => {
    if (!words) return null
    const [width, height] = pages[index]
    const { canvas, ctx } = surface(width, height)
    const data = ctx.createImageData(width, height)
    data.data.set(new Uint8ClampedArray(words.buffer, words.byteOffset, width * height * 4))
    ctx.putImageData(data, 0, 0)
    return canvas
  })
}

export function coverBases(built, projection, image) {
  const { level, job } = prepareBake(built, projection, image)
  return basesFrom(runBake(job, levelOf(image, level).pixels), job.pages)
}

export function bakesAside() {
  return platform.coverWorker !== null
}

function post(id, source, job, withPixels) {
  if (withPixels) sent.add(source.id)
  worker.postMessage({ id, source: source.id, job, ...(withPixels && { pixels: source.pixels.slice(), width: source.width, height: source.height }) })
}

function workerOf() {
  if (worker) return worker
  worker = platform.coverWorker()
  worker.onmessage = ({ data }) => {
    const entry = waiting.get(data.id)
    if (!entry) return
    if (data.missing) {
      post(data.id, entry.source, entry.job, true)
      return
    }
    waiting.delete(data.id)
    if (data.error) entry.reject(new Error(`The cover image couldn't be baked: ${data.error}`))
    else entry.resolve(basesFrom(data.results, entry.job.pages))
  }
  worker.onerror = event => {
    for (const entry of waiting.values()) entry.reject(new Error(`The cover image couldn't be baked: ${event.message}`))
    waiting.clear()
  }
  return worker
}

export async function bakeCover(built, projection, image) {
  const { level, job } = prepareBake(built, projection, image)
  const source = await bitmapLevelOf(image, level)
  workerOf()
  const id = ++jobs
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, source, job })
    post(id, source, job, !sent.has(source.id))
  })
}

function cover(ctx, baked) {
  if (typeof baked !== "string") {
    ctx.drawImage(baked, 0, 0)
    return
  }
  ctx.fillStyle = baked
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

export function paintBakedCover(ctx, baked) {
  plain(ctx)
  cover(ctx, baked)
}

function traceRuns(ctx, rects) {
  ctx.beginPath()
  for (const { x, y, width, height } of rects) ctx.rect(x, y, width, height)
}

export function drawRuns(ctx, rects, source) {
  if (!rects.length) return
  ctx.save()
  plain(ctx)
  traceRuns(ctx, rects)
  ctx.clip()
  cover(ctx, source)
  ctx.restore()
}

export function paintBakedRuns(ctx, sheet, baked, edgeBrightness) {
  drawRuns(ctx, Array.from(sheet.runs.values()), baked)
  const edges = Array.from(sheet.runs).filter(([run]) => run.region === "edge").map(([, rect]) => rect)
  if (!edges.length) return
  ctx.globalCompositeOperation = "source-atop"
  ctx.fillStyle = `rgba(0, 0, 0, ${(100 - edgeBrightness) / 100})`
  traceRuns(ctx, edges)
  ctx.fill()
  ctx.globalCompositeOperation = "source-over"
}
