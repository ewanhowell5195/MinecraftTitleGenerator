import { surface } from "./canvas.js"
import { adjusted } from "./paint.js"
import { swatchUvs } from "./build.js"
import { MINECRAFT_SCALE, MODEL_BASELINE, rotated } from "./shapes.js"

const SHADE = { north: 1, south: 1, up: 1, down: 0.6, east: 0.75, west: 0.75 }
const NEAR = 1e-3

function corners(side, [x1, y1, z1], [x2, y2, z2]) {
  if (side === "north") return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]]
  if (side === "south") return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]]
  if (side === "east") return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]]
  if (side === "west") return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]]
  if (side === "up") return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]]
  return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]]
}

function turned(texels, rotation = 0) {
  const steps = rotation / 90
  return texels.map((texel, index) => texels[(index + 4 - steps) % 4])
}

export function modelQuads(model, { width, height }) {
  return model.elements.flatMap(element => Object.entries(element.faces).map(([side, face]) => {
    const [u1, v1, u2, v2] = face.uv.map((value, index) => Math.round(value * (index % 2 ? height : width) / 16))
    return { points: corners(side, element.from, element.to).map(point => rotated(point, element.rotation)).map(([x, y, z]) => [-x, y, -z]), texels: turned([[u1, v1], [u2, v1], [u2, v2], [u1, v2]], face.rotation), source: "base", tint: null }
  }))
}

export function minecraftPlaced(quads, turn) {
  const minY = Math.min(...quads.flatMap(quad => quad.points.map(point => point[1])))
  const cos = Math.round(Math.cos(turn * Math.PI / 180))
  const sin = Math.round(Math.sin(turn * Math.PI / 180))
  return quads.map(quad => ({ ...quad, points: quad.points.map(([x, y, z]) => [(x * cos + z * sin) * MINECRAFT_SCALE, (y - minY) * MINECRAFT_SCALE + MODEL_BASELINE, (z * cos - x * sin) * MINECRAFT_SCALE]) }))
}

export function normalOf([a, b, , d]) {
  const u = [0, 1, 2].map(axis => b[axis] - a[axis])
  const v = [0, 1, 2].map(axis => d[axis] - a[axis])
  return [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]]
}

export function sideOf(quad) {
  const [x, y, z] = normalOf(quad.points)
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)]
  if (ay >= ax && ay >= az) return y > 0 ? "up" : "down"
  return ax > az ? "east" : "north"
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function facet(quad) {
  const normal = normalOf(quad.points)
  return { quad, normal: unit(normal), flat: quad.flat || Math.hypot(...normal) < NEAR, centre: [0, 1, 2].map(axis => quad.points.reduce((sum, point) => sum + point[axis], 0) / 4) }
}

function boxCorner(a, b) {
  if (Math.abs(dot(a.normal, b.normal)) > 0.01) return false
  const between = a.centre.map((value, axis) => b.centre[axis] - value)
  if (dot(between, a.normal) > -NEAR || dot(between, b.normal) < NEAR) return false
  return a.quad.points.filter(point => b.quad.points.some(other => point.every((value, axis) => Math.abs(value - other[axis]) < NEAR))).length === 2
}

export function wholeCubes(quads) {
  const facets = quads.map(facet)
  return facets.map(item => ({ ...item.quad, whole: !item.flat && facets.some(other => other !== item && !other.flat && boxCorner(item, other)) }))
}

export function placed(faces) {
  const points = faces.flatMap(face => face.points)
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minZ = Math.min(...points.map(point => point[2]))
  const maxZ = Math.max(...points.map(point => point[2]))
  const shift = ([x, y, z]) => [x - (minX + maxX) / 2, y - MODEL_BASELINE, z - (minZ + maxZ) / 2]
  return { faces: faces.map(face => ({ ...face, points: face.points.map(shift) })), depth: maxZ - minZ }
}

function cellOf(face) {
  const us = face.texels.map(texel => texel[0])
  const vs = face.texels.map(texel => texel[1])
  const x = Math.floor(Math.min(...us) + 0.001)
  const y = Math.floor(Math.min(...vs) + 0.001)
  return { face, x, y, width: Math.max(1, Math.ceil(Math.max(...us) - 0.001) - x), height: Math.max(1, Math.ceil(Math.max(...vs) - 0.001) - y) }
}

function tinted(ctx, y, width, height, tint) {
  if (!tint || tint.every(channel => channel === 1)) return
  const pixels = ctx.getImageData(0, y, width, height)
  for (let at = 0; at < pixels.data.length; at += 4) {
    for (let channel = 0; channel < 3; channel++) pixels.data[at + channel] = Math.round(pixels.data[at + channel] * tint[channel])
  }
  ctx.putImageData(pixels, 0, y)
}

export function solidAdjusted(surface, look, width, height) {
  const pixels = surface.ctx.getImageData(0, 0, width, height)
  const alpha = pixels.data.filter((value, index) => index % 4 === 3)
  for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = 255
  surface.ctx.putImageData(pixels, 0, 0)
  const out = adjusted(surface.canvas, look, { willReadFrequently: true })
  const result = out.ctx.getImageData(0, 0, width, height)
  for (let at = 3; at < result.data.length; at += 4) result.data[at] = alpha[(at - 3) / 4]
  out.ctx.putImageData(result, 0, 0)
  return out
}

export function packing(faces) {
  const cells = faces.map(cellOf)
  let y = 0
  for (const cell of cells) {
    cell.at = y
    y += cell.height
  }
  return { cells, width: Math.max(...cells.map(cell => cell.width)), height: y + 1, swatchY: y }
}

export function atlasOf({ cells, width, height }, sources) {
  const atlas = surface(width, height, { willReadFrequently: true })
  for (const cell of cells) {
    atlas.ctx.drawImage(sources[cell.face.source], cell.x, cell.y, cell.width, cell.height, 0, cell.at, cell.width, cell.height)
    tinted(atlas.ctx, cell.at, cell.width, cell.height, cell.face.tint)
    const factor = SHADE[sideOf(cell.face)]
    if (factor < 1) {
      atlas.ctx.globalCompositeOperation = "source-atop"
      atlas.ctx.fillStyle = `rgba(0, 0, 0, ${1 - factor})`
      atlas.ctx.fillRect(0, cell.at, cell.width, cell.height)
      atlas.ctx.globalCompositeOperation = "source-over"
    }
  }
  return atlas
}

export function bodyOf(cells, width, height) {
  const positions = []
  const uvs = []
  for (const { face, at, x: cellX, y: cellY } of cells) {
    const coords = face.texels.map(([u, v]) => [(u - cellX) / width, 1 - (at + v - cellY) / height])
    for (const index of [0, 3, 2, 0, 2, 1]) {
      positions.push(...face.points[index])
      uvs.push(...coords[index])
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9, sizes: null }
}

export function solidRuns(faces, sources) {
  const runs = []
  const pixels = new Map()
  function opaque(key, x, y) {
    const source = sources[key]
    if (!pixels.has(key)) pixels.set(key, source.getContext("2d").getImageData(0, 0, source.width, source.height).data)
    return x >= 0 && y >= 0 && x < source.width && y < source.height && pixels.get(key)[(y * source.width + x) * 4 + 3] >= 128
  }
  for (const face of faces) {
    if (face.whole) {
      runs.push({ face, corners: face.points })
      continue
    }
    const [t0, t1, , t3] = face.texels
    const [p0, p1, , p3] = face.points
    const e1 = [t1[0] - t0[0], t1[1] - t0[1]]
    const e3 = [t3[0] - t0[0], t3[1] - t0[1]]
    const det = e1[0] * e3[1] - e1[1] * e3[0]
    if (Math.abs(det) < 1e-9) continue
    function at(u, v) {
      const a = (e3[1] * (u - t0[0]) - e3[0] * (v - t0[1])) / det
      const b = (e1[0] * (v - t0[1]) - e1[1] * (u - t0[0])) / det
      return [0, 1, 2].map(axis => p0[axis] + a * (p1[axis] - p0[axis]) + b * (p3[axis] - p0[axis]))
    }
    const cell = cellOf(face)
    for (let row = 0; row < cell.height; row++) {
      let start = null
      for (let column = 0; column <= cell.width; column++) {
        const solid = column < cell.width && opaque(face.source, cell.x + column, cell.y + row)
        if (solid && start === null) start = column
        if (solid || start === null) continue
        runs.push({ face, corners: [[start, row], [column, row], [column, row + 1], [start, row + 1]].map(([c, r]) => at(cell.x + c, cell.y + r)) })
        start = null
      }
    }
  }
  return runs
}

export function footprint(runs) {
  return runs.flatMap(({ face, corners }) => {
    const normal = normalOf(face.points)
    if (Math.abs(normal[2]) < 0.01 * Math.hypot(...normal)) return []
    return [{ from: [Math.min(...corners.map(point => point[0])), Math.min(...corners.map(point => point[1]))], to: [Math.max(...corners.map(point => point[0])), Math.max(...corners.map(point => point[1]))] }]
  })
}

const BOX_FACES = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]

function unit(vector) {
  const length = Math.hypot(...vector)
  return length ? vector.map(value => value / length) : vector
}

export function faceOutline(runs, scale, radius, swatch) {
  const positions = []
  const facing = []
  for (const { face, corners } of runs) {
    const scaled = corners.map(point => point.map((value, axis) => value * scale[axis]))
    const across = unit(scaled[1].map((value, axis) => value - scaled[0][axis]))
    const down = unit(scaled[3].map((value, axis) => value - scaled[0][axis]))
    const normal = unit([across[1] * down[2] - across[2] * down[1], across[2] * down[0] - across[0] * down[2], across[0] * down[1] - across[1] * down[0]])
    const outward = unit(normalOf(face.points.map(point => point.map((value, axis) => value * scale[axis]))))
    const grown = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d], index) => scaled[index].map((value, axis) => value + radius[axis] * (a * across[axis] + d * down[axis])))
    const box = [-1, 1].flatMap(side => grown.map(point => point.map((value, axis) => value + side * radius[axis] * normal[axis])))
    const centre = [0, 1, 2].map(axis => box.reduce((sum, point) => sum + point[axis], 0) / 8)
    facing.push({ normal: outward, point: scaled[0], start: positions.length / 3, count: BOX_FACES.length * 6 })
    for (const indices of BOX_FACES) {
      let quad = indices.map(index => box[index])
      const outward = quad[0].map((value, axis) => value - centre[axis])
      if (normalOf(quad).reduce((sum, value, axis) => sum + value * outward[axis], 0) > 0) quad = [quad[0], quad[3], quad[2], quad[1]]
      for (const index of [0, 3, 2, 0, 2, 1]) positions.push(...quad[index])
    }
  }
  return { positions: new Float32Array(positions), uvs: swatchUvs(positions, swatch), triangles: positions.length / 9, scale, rects: [], z: 0, facing }
}
