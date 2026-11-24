import * as THREE from "three"
import { boxesFor } from "../../../src/lib/geometry/boxes.js"
import { unionBoxes } from "../../../src/lib/geometry/build.js"

const DIRECTIONS = [["west", "east"], ["down", "up"], ["north", "south"]]
const OPPOSITE = { west: "east", east: "west", down: "up", up: "down", north: "south", south: "north" }
const SWATCH = 0.1
const SAME = 1e-4
const OPAQUE = 128

const round = value => Math.roundTo(value, 4)

function cornersOf(direction, [x1, y1, z1], [x2, y2, z2]) {
  if (direction === "north") return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]]
  if (direction === "south") return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]]
  if (direction === "east") return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]]
  if (direction === "west") return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]]
  if (direction === "up") return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]]
  return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]]
}

function directionOf(normal, axes) {
  const along = axes.map(axis => normal.dot(axis))
  const axis = along.reduce((best, value, index) => Math.abs(value) > Math.abs(along[best]) ? index : best, 0)
  return DIRECTIONS[axis][along[axis] > 0 ? 1 : 0]
}

function faceUv(quad, corners) {
  const coords = corners.map(corner => quad.uvs[quad.points.reduce((best, point, index) => point.distanceToSquared(corner) < quad.points[best].distanceToSquared(corner) ? index : best, 0)])
  for (const turn of [0, 1, 2, 3]) {
    const [a, b, c, d] = [0, 1, 2, 3].map(index => coords[(index + turn) % 4])
    if (Math.abs(a[1] - b[1]) + Math.abs(b[0] - c[0]) + Math.abs(c[1] - d[1]) + Math.abs(d[0] - a[0]) < 0.01) return { uv: [a[0], a[1], c[0], c[1]].map(round), rotation: turn * 90 }
  }
  throw new Error("A face of this title has a slanted texture, so it can't be made from cubes")
}

function rotationOf(quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, Format.euler_order)
  return [euler.x, euler.y, euler.z].map(angle => round(Math.radToDeg(angle)))
}

function isStill(quaternion) {
  return Math.abs(quaternion.w) > 1 - SAME * SAME
}

export function sharedTurn(boxes) {
  const first = boxes[0]?.quaternion
  if (!first || isStill(first)) return null
  return boxes.every(({ quaternion }) => Math.abs(quaternion.dot(first)) > 1 - SAME * SAME) ? first : null
}

export function makeCube({ name, box: { centre, half, quaternion, axes, members }, space, inverted = false, paint }) {
  const unturned = quaternion.clone().premultiply(space.turn.clone().invert())
  const middle = centre.clone().sub(space.centre).applyQuaternion(space.turn.clone().invert()).add(space.centre).add(space.origin)
  const low = middle.toArray().map((value, axis) => round(value - half[axis]))
  const high = middle.toArray().map((value, axis) => round(value + half[axis]))
  const turned = !isStill(unturned)
  const cube = new Cube({
    name,
    from: inverted ? high : low,
    to: inverted ? low : high,
    origin: (turned ? middle : space.pivot).toArray().map(round),
    rotation: turned ? rotationOf(unturned) : [0, 0, 0],
    autouv: 0,
    box_uv: false
  })
  for (const face of Object.values(cube.faces)) face.extend({ texture: null, uv: [0, 0, 0, 0] })
  for (const quad of members) {
    const direction = directionOf(quad.normal, axes)
    const corners = cornersOf(direction, half.map(value => -value), half).map(corner => new THREE.Vector3(...corner).applyQuaternion(quaternion).add(centre))
    cube.faces[inverted ? OPPOSITE[direction] : direction].extend(paint(quad, corners))
  }
  return cube
}

export function texturedPaint(textures) {
  return (quad, corners) => ({ texture: textures[quad.page].uuid, ...faceUv(quad, corners) })
}

export function swatchPaint(texture, { width, height }, [u, v]) {
  const [x, y] = [u * width, (1 - v) * height]
  return () => ({ texture: texture.uuid, uv: [x - SWATCH, y - SWATCH, x + SWATCH, y + SWATCH].map(round) })
}

function pixelsOf(page) {
  return page.getContext("2d").getImageData(0, 0, page.width, page.height)
}

function maskOf({ uvs }, { data, width }) {
  const [left, top] = [0, 1].map(axis => Math.floor(Math.min(...uvs.map(uv => uv[axis])) + 0.01))
  const [right, bottom] = [0, 1].map(axis => Math.ceil(Math.max(...uvs.map(uv => uv[axis])) - 0.01))
  const mask = new Uint8Array(Math.max(0, right - left) * Math.max(0, bottom - top))
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) mask[(y - top) * (right - left) + x - left] = data[(y * width + x) * 4 + 3] >= OPAQUE ? 1 : 0
  }
  return { mask, left, top, width: right - left, height: bottom - top }
}

function cutOut(quad, pixels) {
  const found = maskOf(quad, pixels)
  if (found.mask.every(Boolean)) return null
  const [a, b, , d] = quad.uvs
  const [p0, p1, , p3] = quad.points
  const across = [b[0] - a[0], b[1] - a[1]]
  const down = [d[0] - a[0], d[1] - a[1]]
  const size = across[0] * down[1] - across[1] * down[0]
  const at = (u, v) => {
    const s = (down[1] * (u - a[0]) - down[0] * (v - a[1])) / size
    const t = (across[0] * (v - a[1]) - across[1] * (u - a[0])) / size
    return p0.clone().addScaledVector(p1.clone().sub(p0), s).addScaledVector(p3.clone().sub(p0), t)
  }
  return boxesFor(found.mask, found.width, found.height).map(({ from, to }) => [from, to].map(([x, y]) => at(found.left + x, found.top + y)))
}

function spaceIn({ half: [x, y, z] }) {
  return x * y * z
}

function within(box, outer) {
  return outer !== box && (!box.volume || spaceIn(outer) > spaceIn(box)) && box.members.every(quad => quad.points.every(point => outer.axes.every((axis, index) => Math.abs(point.clone().sub(outer.centre).dot(axis)) < outer.half[index] + 0.01)))
}

function hullBoxes(box, radius, pixels) {
  const reach = box.axes.map(axis => new THREE.Vector3(...radius).multiply(axis).length())
  const local = point => box.axes.map(axis => point.clone().sub(box.centre).dot(axis))
  const masked = box.members.map(quad => ({ quad, pieces: cutOut(quad, pixels[quad.page]) })).filter(({ quad, pieces }) => pieces && (!box.volume || box.members.some(other => other !== quad && other.normal.dot(quad.normal) < -0.99)))
  const face = masked.sort((a, b) => b.quad.across.length() * b.quad.down.length() - a.quad.across.length() * a.quad.down.length())[0]
  if (!face) return [{ low: box.half.map((value, axis) => -value - reach[axis]), high: box.half.map((value, axis) => value + reach[axis]), faces: null }]
  const thin = box.axes.reduce((best, axis, index) => Math.abs(axis.dot(face.quad.normal)) > Math.abs(box.axes[best].dot(face.quad.normal)) ? index : best, 0)
  const [x, y] = [0, 1, 2].filter(axis => axis !== thin)
  const rects = face.pieces.map(ends => {
    const [from, to] = ends.map(local)
    return [Math.min(from[x], to[x]) - reach[x], Math.min(from[y], to[y]) - reach[y], Math.max(from[x], to[x]) + reach[x], Math.max(from[y], to[y]) + reach[y]].map(value => Math.roundTo(value, 4))
  })
  return unionBoxes(rects).map(({ from, to, faces }) => {
    const place = (point, end) => [0, 1, 2].map(axis => axis === x ? point[0] : axis === y ? point[1] : end * (box.half[thin] + reach[thin]))
    return { low: place(from, -1), high: place(to, 1), faces: { [DIRECTIONS[x][0]]: faces.west, [DIRECTIONS[x][1]]: faces.east, [DIRECTIONS[y][0]]: faces.down, [DIRECTIONS[y][1]]: faces.up } }
  })
}

export function hullOf(boxes, radius, pages) {
  const pixels = pages.map(pixelsOf)
  const volumes = boxes.filter(box => box.volume)
  return boxes.filter(box => !volumes.some(outer => within(box, outer))).flatMap(box => hullBoxes(box, radius, pixels).map(({ low, high, faces }) => {
    const centre = new THREE.Vector3(...low.map((value, axis) => (value + high[axis]) / 2)).applyQuaternion(box.quaternion).add(box.centre)
    const half = high.map((value, axis) => (value - low[axis]) / 2)
    const members = DIRECTIONS.flatMap((ends, axis) => ends.map((direction, end) => ({ direction, normal: box.axes[axis].clone().multiplyScalar(end ? 1 : -1) }))).filter(({ direction }) => faces?.[direction] !== false)
    return { ...box, centre, half, members }
  }))
}
