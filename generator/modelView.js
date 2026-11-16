import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { rgbOf } from "../src/lib/core/colour.js"
import { modelQuads, normalOf, placed, sideOf } from "../src/lib/geometry/modelShape.js"
import { over } from "../src/lib/font/thumbnails.js"
import { readJson, readPng, writePng } from "./common.js"
import { publicDir } from "./fonts.js"

const SAMPLES = 4
const RING_UNITS = 2
const YAW = 30
const PITCH = 25
const DEEP = 0.75
const FADED = 0.3
const BORDER = "#000000"
const SHADES = { north: 1, south: 1, up: 0.69, down: 0.6, east: 0.85, west: 0.85 }

function radians(degrees) {
  return degrees * Math.PI / 180
}

function turned([x, y, z]) {
  const [cy, sy, cp, sp] = [Math.cos(radians(YAW)), Math.sin(radians(YAW)), Math.cos(radians(PITCH)), Math.sin(radians(PITCH))]
  const depth = z * cy - x * sy
  return [x * cy + z * sy, y * cp - depth * sp, depth * cp + y * sp]
}

function edge(a, b, x, y) {
  return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
}

function grown(solid, width, height, reach) {
  const across = new Uint8Array(solid.length)
  const ring = new Uint8Array(solid.length)
  for (let y = 0; y < height; y++) {
    let last = -Infinity
    for (let x = 0; x < width; x++) {
      if (solid[y * width + x]) last = x
      if (x - last <= reach) across[y * width + x] = 1
    }
    last = Infinity
    for (let x = width - 1; x >= 0; x--) {
      if (solid[y * width + x]) last = x
      if (last - x <= reach) across[y * width + x] = 1
    }
  }
  for (let x = 0; x < width; x++) {
    let last = -Infinity
    for (let y = 0; y < height; y++) {
      if (across[y * width + x]) last = y
      if (y - last <= reach) ring[y * width + x] = 1
    }
    last = Infinity
    for (let y = height - 1; y >= 0; y--) {
      if (across[y * width + x]) last = y
      if (last - y <= reach) ring[y * width + x] = 1
    }
  }
  return ring
}

function shrunk(data, width, height) {
  const view = new PNG({ width: Math.ceil(width / SAMPLES), height: Math.ceil(height / SAMPLES) })
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const sum = [0, 0, 0, 0]
      for (let dy = 0; dy < SAMPLES; dy++) {
        for (let dx = 0; dx < SAMPLES; dx++) {
          const at = ((y * SAMPLES + dy) * width + x * SAMPLES + dx) * 4
          if (y * SAMPLES + dy >= height || x * SAMPLES + dx >= width || !data[at + 3]) continue
          for (let channel = 0; channel < 3; channel++) sum[channel] += data[at + channel] * data[at + 3]
          sum[3] += data[at + 3]
        }
      }
      const to = (y * view.width + x) * 4
      for (let channel = 0; channel < 3; channel++) view.data[to + channel] = sum[3] ? Math.round(sum[channel] / sum[3]) : 0
      view.data[to + 3] = Math.round(sum[3] / (SAMPLES * SAMPLES))
    }
  }
  return view
}

function angledView(model, texture, ring = [0, 0, 0]) {
  const seen = placed(modelQuads(model, texture)).faces.map(face => ({ face, points: face.points.map(turned), shade: SHADES[sideOf(face)] })).filter(({ points }) => normalOf(points)[2] > 0)
  if (!seen.length) throw new Error("the model has no faces to show")
  const xs = seen.flatMap(({ points }) => points.map(point => point[0]))
  const ys = seen.flatMap(({ points }) => points.map(point => point[1]))
  const [left, right, bottom, top] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const scale = SAMPLES
  const reach = RING_UNITS * scale
  const width = Math.ceil((right - left) * scale) + reach * 2
  const height = Math.ceil((top - bottom) * scale) + reach * 2
  const data = new Uint8ClampedArray(width * height * 4)
  const solid = new Uint8Array(width * height)
  const depths = new Float32Array(width * height).fill(-Infinity)
  for (const { face, points, shade } of seen) {
    const corners = points.map(([x, y, z]) => [(x - left) * scale + reach, (top - y) * scale + reach, z])
    const us = face.texels.map(texel => texel[0])
    const vs = face.texels.map(texel => texel[1])
    const [firstU, lastU, firstV, lastV] = [Math.floor(Math.min(...us) + 0.001), Math.ceil(Math.max(...us) - 0.001) - 1, Math.floor(Math.min(...vs) + 0.001), Math.ceil(Math.max(...vs) - 0.001) - 1]
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
      const [pa, pb, pc] = [corners[a], corners[b], corners[c]]
      const area = edge(pa, pb, pc[0], pc[1])
      if (!area) continue
      for (let y = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1]))); y <= Math.min(height - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1]))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0]))); x <= Math.min(width - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0]))); x++) {
          const weights = [edge(pb, pc, x + 0.5, y + 0.5) / area, edge(pc, pa, x + 0.5, y + 0.5) / area, edge(pa, pb, x + 0.5, y + 0.5) / area]
          if (weights.some(weight => weight < 0)) continue
          const depth = weights[0] * pa[2] + weights[1] * pb[2] + weights[2] * pc[2]
          if (depth <= depths[y * width + x]) continue
          const u = Math.min(lastU, Math.max(firstU, Math.floor(weights[0] * us[a] + weights[1] * us[b] + weights[2] * us[c])))
          const v = Math.min(lastV, Math.max(firstV, Math.floor(weights[0] * vs[a] + weights[1] * vs[b] + weights[2] * vs[c])))
          const from = (v * texture.width + u) * 4
          if (!(texture.data[from + 3] >= 128)) continue
          depths[y * width + x] = depth
          solid[y * width + x] = 1
          for (let channel = 0; channel < 3; channel++) data[(y * width + x) * 4 + channel] = texture.data[from + channel] * shade
          data[(y * width + x) * 4 + 3] = 255
        }
      }
    }
  }
  const around = ring ? grown(solid, width, height, reach) : solid
  for (let at = 0; at < around.length; at++) {
    if (around[at] && !solid[at]) data.set(ring.concat(255), at * 4)
  }
  return shrunk(data, width, height)
}

function sampled(texture, face, across, down) {
  let [s, t] = [across, down]
  for (let turn = 0; turn < (face.rotation ?? 0) / 90; turn++) [s, t] = [t, 1 - s]
  const [u1, v1, u2, v2] = face.uv
  const x = Math.min(texture.width - 1, Math.floor((u1 + (u2 - u1) * s) / 16 * texture.width))
  const y = Math.min(texture.height - 1, Math.floor((v1 + (v2 - v1) * t) / 16 * texture.height))
  return texture.data.subarray((y * texture.width + x) * 4, (y * texture.width + x) * 4 + 4)
}

function fillEnclosed(view, colour) {
  const outside = new Uint8Array(view.width * view.height)
  const pending = []
  function reach(x, y) {
    if (x < 0 || y < 0 || x >= view.width || y >= view.height) return
    const at = y * view.width + x
    if (outside[at] || view.data[at * 4 + 3]) return
    outside[at] = 1
    pending.push(at)
  }
  for (let x = 0; x < view.width; x++) {
    reach(x, 0)
    reach(x, view.height - 1)
  }
  for (let y = 0; y < view.height; y++) {
    reach(0, y)
    reach(view.width - 1, y)
  }
  while (pending.length) {
    const at = pending.pop()
    const [x, y] = [at % view.width, Math.floor(at / view.width)]
    reach(x - 1, y)
    reach(x + 1, y)
    reach(x, y - 1)
    reach(x, y + 1)
  }
  for (let at = 0; at < outside.length; at++) {
    if (!outside[at] && !view.data[at * 4 + 3]) view.data.set(colour.concat(255), at * 4)
  }
}

export function frontView(model, texture, colour = [0, 0, 0]) {
  const fronts = model.elements.filter(element => element.faces.north && !element.rotation)
  if (!fronts.length) throw new Error("the model has no unrotated north faces to show")
  const left = Math.min(...fronts.map(element => -Math.max(element.from[0], element.to[0])))
  const right = Math.max(...fronts.map(element => -Math.min(element.from[0], element.to[0])))
  const bottom = Math.min(...fronts.map(element => Math.min(element.from[1], element.to[1])))
  const top = Math.max(...fronts.map(element => Math.max(element.from[1], element.to[1])))
  const ring = RING_UNITS
  const view = new PNG({ width: Math.ceil(right - left) + ring * 2, height: Math.ceil(top - bottom) + ring * 2 })
  view.data.fill(0)
  const solid = new Uint8Array(view.width * view.height)
  for (const element of fronts.toSorted((a, b) => Math.min(b.from[2], b.to[2]) - Math.min(a.from[2], a.to[2]))) {
    const x0 = -Math.max(element.from[0], element.to[0]) - left + ring
    const x1 = -Math.min(element.from[0], element.to[0]) - left + ring
    const y0 = top - Math.max(element.from[1], element.to[1]) + ring
    const y1 = top - Math.min(element.from[1], element.to[1]) + ring
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        const pixel = sampled(texture, element.faces.north, (x + 0.5 - x0) / (x1 - x0), (y + 0.5 - y0) / (y1 - y0))
        if (pixel[3] < 128) continue
        view.data.set(pixel, (y * view.width + x) * 4)
        solid[y * view.width + x] = 1
      }
    }
  }
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      if (solid[y * view.width + x]) continue
      let near = false
      for (let dy = -ring; dy <= ring && !near; dy++) {
        for (let dx = -ring; dx <= ring && !near; dx++) near = solid[(y + dy) * view.width + x + dx] === 1 && x + dx >= 0 && x + dx < view.width && y + dy >= 0 && y + dy < view.height
      }
      if (near && colour) view.data.set(colour.concat(255), (y * view.width + x) * 4)
    }
  }
  if (colour) fillEnclosed(view, colour)
  return view
}

function facesFront(model) {
  const extent = [0, 1, 2].map(axis => Math.max(...model.elements.flatMap(element => [element.from[axis], element.to[axis]])) - Math.min(...model.elements.flatMap(element => [element.from[axis], element.to[axis]])))
  return extent[2] < Math.max(extent[0], extent[1]) * DEEP && model.elements.some(element => element.faces.north && !element.rotation)
}

function overlaid(base, top) {
  for (let at = 0; at < base.data.length; at++) base.data[at] = Math.round(base.data[at] * FADED)
  for (let at = 0; at < top.data.length; at += 4) over(base, at / 4 % base.width, Math.floor(at / 4 / base.width), top.data.subarray(at, at + 4))
  return base
}

export function modelThumbnails(root, id) {
  const folder = path.join(publicDir(root), "shapes", id)
  const model = readJson(path.join(folder, "model.json"))
  const list = readJson(path.join(folder, "textures.json"))
  const view = facesFront(model) ? frontView : angledView
  const textures = Object.entries(list.textures).flatMap(([name, data]) => [[name, data.border]].concat(Object.entries(data.variants ?? {}).map(([variant, own]) => [variant, own.border ?? data.border])))
  const views = new Map(textures.map(([name, border]) => [name, view(model, readPng(path.join(folder, "textures", `${name}.png`)), rgbOf(border ?? BORDER).slice(0, 3))]))
  if (!views.has("flat")) views.set("flat", views.get(list.primary ?? textures[0][0]))
  const flat = path.join(folder, "textures", "flat.png")
  for (const [name, data] of Object.entries(list.overlays ?? {})) {
    const file = path.join(folder, "overlays", `${name}.png`)
    if (data.generated || !fs.existsSync(file) || !fs.existsSync(flat)) continue
    const base = readPng(flat)
    const overlay = readPng(file)
    if (overlay.width === base.width && overlay.height === base.height) views.set(name, overlaid(view(model, base), view(model, overlay, null)))
  }
  for (const [name, image] of views) writePng(path.join(folder, "thumbnails", `${name}.png`), image)
  for (const file of fs.readdirSync(path.join(folder, "thumbnails"))) {
    if (file.endsWith(".png") && !views.has(file.slice(0, -4))) fs.rmSync(path.join(folder, "thumbnails", file))
  }
}
