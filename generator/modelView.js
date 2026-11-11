import { PNG } from "pngjs"
import { modelQuads, normalOf, placed, sideOf } from "../src/lib/modelShape.js"

const SAMPLES = 4
const RING_UNITS = 2
const YAW = 30
const PITCH = 25
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

export function angledView(model, texture, ring = [0, 0, 0]) {
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
