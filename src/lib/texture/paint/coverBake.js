import { pixelsOf, surface } from "../canvas.js"
import { SWATCH } from "../atlas/pages.js"
import { coverFit } from "./cover.js"
import { runBake, STRIDE } from "./coverRaster.js"
import { plain } from "./draw.js"

const DENSITY_PERCENTILE = 0.9
const levelCache = new WeakMap()
const waiting = new Map()
const sent = new Set()
let worker = null
let sources = 0
let jobs = 0

function levelOf(image, level) {
  if (!levelCache.has(image)) levelCache.set(image, new Map())
  const levels = levelCache.get(image)
  if (!levels.has(level)) {
    const width = Math.max(1, Math.ceil(image.width / 2 ** level))
    const height = Math.max(1, Math.ceil(image.height / 2 ** level))
    let source = image
    if (level) {
      const { canvas, ctx } = surface(width, height)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(image, 0, 0, width, height)
      source = canvas
    }
    const pixels = pixelsOf(source)
    levels.set(level, { id: ++sources, width, height, pixels: new Uint32Array(pixels.buffer, pixels.byteOffset, width * height) })
  }
  return levels.get(level)
}

function screenOf({ x, y, z }, { orthographic, lens }) {
  return orthographic ? [x / lens, y / lens ** 2] : [x / z, y / z]
}

function densityOf([a, b, c], projection) {
  const uvArea = Math.abs((b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v))
  const [ax, ay] = screenOf(a, projection)
  const [bx, by] = screenOf(b, projection)
  const [cx, cy] = screenOf(c, projection)
  const screenArea = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay))
  return screenArea > 0 ? Math.sqrt(uvArea / screenArea) : 0
}

function levelFor(image, fit, triangles, projection) {
  const densities = triangles.map(({ corners }) => densityOf(corners, projection)).filter(Boolean).sort((a, b) => a - b)
  if (!densities.length) return 0
  const needed = densities[Math.min(densities.length - 1, Math.floor(densities.length * DENSITY_PERCENTILE))]
  let level = 0
  while (Math.min(image.width, image.height) / 2 ** (level + 1) >= 1 && 1 / fit.scale / 2 ** (level + 1) >= needed) level++
  return level
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
  const { minX, maxX, minY, maxY } = projection.box
  const fit = coverFit({ x: minX, y: -maxY, width: maxX - minX, height: maxY - minY }, image, ...projection.position)
  const triangles = trianglesOf(built.body, built.layouts, projection)
  const source = levelOf(image, levelFor(image, fit, triangles, projection))
  const view = { orthographic: projection.orthographic, lens: projection.lens, fitX: fit.x, fitY: fit.y, scale: fit.scale * image.width / source.width, imageWidth: source.width, imageHeight: source.height }
  return { source, job: { pages: built.layouts.map(page => [page.width, page.height]), triangles: packed(triangles), view } }
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
  const { source, job } = prepareBake(built, projection, image)
  return basesFrom(runBake(job, source.pixels), job.pages)
}

export function bakesAside() {
  return typeof Worker !== "undefined"
}

function post(id, source, job, withPixels) {
  if (withPixels) sent.add(source.id)
  worker.postMessage({ id, source: source.id, job, ...(withPixels && { pixels: source.pixels.slice(), width: source.width, height: source.height }) })
}

function workerOf() {
  if (worker) return worker
  worker = new Worker(new URL("./coverWorker.js", import.meta.url), { type: "module" })
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

export function bakeCover(built, projection, image) {
  const { source, job } = prepareBake(built, projection, image)
  workerOf()
  const id = ++jobs
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, source, job })
    post(id, source, job, !sent.has(source.id))
  })
}

export function paintBakedCover(ctx, baked) {
  plain(ctx)
  ctx.drawImage(baked, 0, 0)
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
  ctx.drawImage(source, 0, 0)
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
