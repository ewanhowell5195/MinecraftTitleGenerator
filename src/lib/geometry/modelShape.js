import { toRad } from "../core/maths.js"
import { swatchUvs } from "./build.js"
import { MINECRAFT_SCALE, MODEL_BASELINE, rotated } from "./shapes.js"

const NEAR = 1e-3
const WALL_SIDES = ["east", "west", "up", "down"]

export function corners(side, [x1, y1, z1], [x2, y2, z2]) {
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

function placedCorners(side, { from, to, rotation }) {
  return corners(side, from, to).map(point => rotated(point, rotation)).map(([x, y, z]) => [-x, y, -z])
}

function thickness(element) {
  const { faces, from, to } = element
  if (!faces.north || !faces.south || from[2] === to[2] || WALL_SIDES.every(side => faces[side])) return null
  const [, front] = placedCorners("north", element)
  const [back] = placedCorners("south", element)
  return back.map((value, axis) => value - front[axis])
}

export function modelQuads(model, { width, height }) {
  return model.elements.flatMap(element => Object.entries(element.faces).map(([side, face]) => {
    const [u1, v1, u2, v2] = face.uv.map((value, index) => Math.round(value * (index % 2 ? height : width) / 16))
    return { points: placedCorners(side, element), texels: turned([[u1, v1], [u2, v1], [u2, v2], [u1, v2]], face.rotation), source: "base", tint: null, thickness: side === "north" ? thickness(element) : null }
  }))
}

export function minecraftPlaced(quads, turn) {
  const minY = Math.min(...quads.flatMap(quad => quad.points.map(point => point[1])))
  const cos = Math.round(Math.cos(toRad(turn)))
  const sin = Math.round(Math.sin(toRad(turn)))
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

export function cellOf(face) {
  const us = face.texels.map(texel => texel[0])
  const vs = face.texels.map(texel => texel[1])
  const x = Math.floor(Math.min(...us) + 0.001)
  const y = Math.floor(Math.min(...vs) + 0.001)
  return { face, x, y, width: Math.max(1, Math.ceil(Math.max(...us) - 0.001) - x), height: Math.max(1, Math.ceil(Math.max(...vs) - 0.001) - y) }
}

export function bodyOf({ cells, width, height, swatchY }, runs = []) {
  const positions = []
  const uvs = []
  function quad(points, coords) {
    for (const index of [0, 3, 2, 0, 2, 1]) {
      positions.push(...points[index])
      uvs.push(...coords[index])
    }
  }
  for (const { face, at, x: cellX, y: cellY } of cells) quad(face.points, face.texels.map(([u, v]) => [(u - cellX) / width, 1 - (at + v - cellY) / height]))
  const [left, right] = [0.25, 0.75].map(x => x / width)
  const [top, bottom] = [0.25, 0.75].map(y => 1 - (swatchY + y) / height)
  for (const { corners, bare } of runs) {
    if (bare) quad(corners, [[left, top], [right, top], [right, bottom], [left, bottom]])
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9, sizes: null }
}

function coveredBy(faces, opaque) {
  const planes = faces.map(face => {
    const [origin, across, , down] = face.points
    return { face, origin, normal: unit(normalOf(face.points)), across: across.map((value, axis) => value - origin[axis]), down: down.map((value, axis) => value - origin[axis]) }
  })
  return (point, normal) => planes.some(({ face, origin, normal: own, across, down }) => {
    const offset = point.map((value, axis) => value - origin[axis])
    if (dot(own, normal) < 1 - NEAR || Math.abs(dot(offset, own)) > NEAR) return false
    const a = dot(offset, across) / dot(across, across)
    const b = dot(offset, down) / dot(down, down)
    if (a < 0 || a > 1 || b < 0 || b > 1) return false
    const [t0, t1, , t3] = face.texels
    const [u, v] = [0, 1].map(axis => Math.floor(t0[axis] + a * (t1[axis] - t0[axis]) + b * (t3[axis] - t0[axis])))
    return opaque(face.source, u, v)
  })
}

function wallRuns({ face, x, y, width, height }, at, opaque, covered) {
  const solid = (column, row) => column >= 0 && row >= 0 && column < width && row < height && opaque(column, row)
  const runs = []
  function wall(from, to, inside) {
    const [a, b, within] = [from, to, inside].map(([column, row]) => at(x + column, y + row))
    const corners = [a, b, b.map((value, axis) => value + face.thickness[axis]), a.map((value, axis) => value + face.thickness[axis])]
    return dot(normalOf(corners), within.map((value, axis) => value - a[axis])) > 0 ? corners.toReversed() : corners
  }
  function trace(lines, length, place) {
    for (let line = 0; line <= lines; line++) {
      const between = (start, end, side) => wall(place(line, start), place(line, end), place(line + side / 2, (start + end) / 2))
      const open = { start: 0, side: 0, bare: false }
      for (let along = 0; along <= length; along++) {
        const side = along < length ? solid(...place(line, along)) - solid(...place(line - 1, along)) : 0
        const points = side ? between(along, along + 1, side) : null
        const bare = !!points && !covered([0, 1, 2].map(axis => (points[0][axis] + points[2][axis]) / 2), unit(normalOf(points)))
        if (side === open.side && bare === open.bare) continue
        if (open.side) {
          const corners = between(open.start, along, open.side)
          runs.push({ face: { points: corners }, corners, bare: open.bare })
        }
        Object.assign(open, { start: along, side, bare })
      }
    }
  }
  trace(width, height, (line, along) => [line, along])
  trace(height, width, (line, along) => [along, line])
  return runs
}

export function solidRuns(faces, sources) {
  const runs = []
  const pixels = new Map()
  function opaque(key, x, y) {
    const source = sources[key]
    if (!pixels.has(key)) pixels.set(key, source.getContext("2d").getImageData(0, 0, source.width, source.height).data)
    return x >= 0 && y >= 0 && x < source.width && y < source.height && pixels.get(key)[(y * source.width + x) * 4 + 3] >= 128
  }
  const covered = coveredBy(faces, opaque)
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
    if (face.thickness) runs.push(...wallRuns(cell, at, (column, row) => opaque(face.source, cell.x + column, cell.y + row), covered))
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
