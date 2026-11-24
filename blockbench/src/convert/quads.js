import * as THREE from "three"

const PRECISION = 1000
const SQUARE = 0.002

export function keyOf(point) {
  return point.toArray().map(value => Math.round(value * PRECISION)).join()
}

export function facesOf({ positions, uvs, triangles, sizes, glyphs, solids, groups }, matrix, pages) {
  const faces = []
  const count = sizes ? sizes.length : triangles / 2
  let at = 0
  for (let index = 0; index < count; index++) {
    const corners = (sizes?.[index] ?? 6) === 3 ? [0, 1, 2] : [0, 1, 2, 5]
    const page = groups?.findLast(group => group.start <= at)?.page ?? 0
    const { width, height } = pages[page]
    faces.push({
      page,
      glyph: glyphs?.[index] ?? 0,
      solid: solids?.[index] ?? null,
      points: corners.map(corner => new THREE.Vector3().fromArray(positions, (at + corner) * 3).applyMatrix4(matrix)),
      uvs: corners.map(corner => [uvs[(at + corner) * 2] * width, (1 - uvs[(at + corner) * 2 + 1]) * height])
    })
    at += corners.length === 3 ? 3 : 6
  }
  return faces
}

function described(face) {
  const [a, b, c, d] = face.points
  const across = b.clone().sub(a)
  const down = d.clone().sub(a)
  if (across.lengthSq() < 1e-9 || down.lengthSq() < 1e-9) return null
  const square = Math.abs(across.clone().normalize().dot(down.clone().normalize())) < SQUARE && c.distanceTo(b.clone().add(down)) < SQUARE
  if (!square) throw new Error("A face of this title isn't a rectangle, so it can't be made from cubes")
  const centre = a.clone().add(c).multiplyScalar(0.5)
  const keys = face.points.map(keyOf)
  return { ...face, across, down, centre, keys, place: keys.slice().sort().join("|"), normal: across.clone().cross(down).normalize() }
}

function edgesOf({ keys }) {
  return keys.map((key, index) => [key, keys[(index + 1) % 4]].sort().join("|"))
}

function boxFrom(quad, other) {
  const shared = quad.keys.filter(key => other.keys.includes(key))
  if (shared.length !== 2) return null
  const start = other.keys.indexOf(shared[0])
  const away = [1, 3].map(step => (start + step) % 4).find(index => !shared.includes(other.keys[index]))
  const depth = other.points[away].clone().sub(other.points[start])
  if (Math.abs(depth.clone().normalize().dot(quad.normal) + 1) > SQUARE) return null
  return { depth, points: quad.points.concat(quad.points.map(point => point.clone().add(depth))) }
}

function convex(quad, other) {
  const between = other.centre.clone().sub(quad.centre)
  return Math.abs(quad.normal.dot(other.normal)) < SQUARE && between.dot(quad.normal) < 0 && between.dot(other.normal) > 0
}

function axesOf(vectors) {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  const score = order => order.reduce((sum, from, axis) => sum + Math.abs(vectors[from].getComponent(axis)), 0)
  const best = orders.reduce((found, order) => score(order) > score(found) + 1e-6 ? order : found)
  const axes = best.map((from, axis) => vectors[from].clone().multiplyScalar(vectors[from].getComponent(axis) < 0 ? -1 : 1))
  if (axes[0].clone().cross(axes[1]).dot(axes[2]) < 0) axes[2].negate()
  return axes
}

export function boxOf(points, vectors, members) {
  const axes = axesOf(vectors)
  const centre = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length)
  const half = axes.map(axis => Math.max(...points.map(point => Math.abs(point.clone().sub(centre).dot(axis)))))
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(...axes))
  return { centre, half, axes, quaternion, members }
}

export function solidPoints({ from, to }, place) {
  return [from[2], to[2]].flatMap(z => [[from[0], from[1]], [to[0], from[1]], [to[0], to[1]], [from[0], to[1]]].map(([x, y]) => place([x, y, z])))
}

export function solidBox(points, members) {
  const [a, b, , d, e] = points
  return { ...boxOf(points, [b, d, e].map(point => point.clone().sub(a).normalize()), members), volume: true }
}

export function boxesOf(faces) {
  const quads = faces.map(described).filter(Boolean)
  const byPlace = Map.groupBy(quads, quad => quad.place)
  const byEdge = Map.groupBy(quads.flatMap(quad => edgesOf(quad).map(edge => ({ edge, quad }))), item => item.edge)
  const used = new Set()
  const boxes = []

  function membersOf(points, centre) {
    const keys = new Set(points.map(keyOf))
    const taken = new Set()
    const nearby = new Set(points.flatMap(point => byKey.get(keyOf(point)) ?? []))
    return Array.from(nearby).filter(quad => {
      if (used.has(quad) || !quad.keys.every(key => keys.has(key)) || quad.centre.clone().sub(centre).dot(quad.normal) < 0) return false
      const place = quad.place + Math.sign(Math.round(quad.centre.clone().sub(centre).dot(quad.normal) * PRECISION))
      if (taken.has(place)) return false
      taken.add(place)
      return true
    })
  }

  const byKey = new Map()
  for (const quad of quads) {
    for (const key of quad.keys) {
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(quad)
    }
  }

  for (const quad of quads) {
    if (used.has(quad)) continue
    const partners = edgesOf(quad).flatMap(edge => byEdge.get(edge)).map(item => item.quad).filter(other => other !== quad && !used.has(other) && convex(quad, other))
    let best = null
    for (const partner of partners) {
      const found = boxFrom(quad, partner)
      if (!found) continue
      const centre = found.points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 8)
      const members = membersOf(found.points, centre)
      if (members.includes(quad) && members.length > (best?.members.length ?? 1)) best = { ...found, members }
    }
    const flat = byPlace.get(quad.place).filter(other => other !== quad && !used.has(other) && other.normal.dot(quad.normal) < 0).slice(0, 1)
    const members = best ? best.members : [quad].concat(flat)
    const directions = [quad.across.clone().normalize(), quad.down.clone().normalize(), quad.normal.clone()]
    for (const member of members) used.add(member)
    boxes.push({ ...boxOf(best ? best.points : quad.points, directions, members), volume: !!best })
  }
  return boxes
}
