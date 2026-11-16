import * as THREE from "three"
import { analyse, contains, maskOf } from "./regions.js"
import { boxOfPolygons, boxesOverlap, signedArea } from "./polygons.js"

export const EPSILON = 1e-4
export const PLANE_ERROR = 1e-2

export function split(points, normal, constant) {
  const distances = points.map(point => normal.dot(point) - constant)
  if (distances.every(distance => distance >= -EPSILON)) return [points, null]
  if (distances.every(distance => distance <= EPSILON)) return [null, points]
  const above = []
  const below = []
  for (const [index, point] of points.entries()) {
    const next = (index + 1) % points.length
    const from = distances[index]
    const to = distances[next]
    if (from >= -EPSILON) above.push(point)
    if (from <= EPSILON) below.push(point)
    if (from > EPSILON && to < -EPSILON || from < -EPSILON && to > EPSILON) {
      const crossing = point.clone().lerp(points[next], from / (from - to))
      above.push(crossing)
      below.push(crossing)
    }
  }
  return [above.length > 2 ? above : null, below.length > 2 ? below : null]
}

function toViewer(view, point) {
  return view.perspective ? view.eye.clone().sub(point) : view.direction.clone().negate()
}

function imageOf(texture, cache) {
  if (!cache.has(texture)) {
    const { image, labels, crackShapes, gradient, fades, panels } = texture.userData.plain ?? { image: texture.image, ...texture.userData }
    const { width, height } = image
    cache.set(texture, { data: image.getContext("2d").getImageData(0, 0, width, height).data, width, height, labels: labels?.() ?? null, crackShapes: crackShapes?.() ?? null, gradient: gradient ?? null, fades: fades ?? null, panels: panels ?? null, analyses: new Map() })
  }
  return cache.get(texture)
}

function materialColour(material) {
  return parseInt(material.color.getHexString().replace(/(..)(..)(..)/, "$3$2$1"), 16)
}

export function firstMaterial(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
}

function materialAt(mesh, vertex) {
  if (!Array.isArray(mesh.material)) return mesh.material
  const group = mesh.geometry.groups.find(item => vertex >= item.start && vertex < item.start + item.count)
  return mesh.material[group?.materialIndex ?? 0]
}

export function facesOf(mesh, view, project, cache) {
  const { position, uv, plainUv } = mesh.geometry.attributes
  const mirrored = mesh.matrixWorld.determinant() < 0
  const showsBack = firstMaterial(mesh).side === THREE.BackSide
  const faces = []
  const solids = []
  function faceFrom(corners, texels, rect, analysis, normal, image) {
    const points = view.perspective ? split(corners, view.direction, view.direction.dot(view.eye) + view.near)[0] : corners
    if (!points) return null
    const facing = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).normalize()
    return { index: faces.length, corners, texels, rect, image, analysis, points, facing, normal: normal.dot(toViewer(view, corners[0])) < 0 ? normal.clone().negate().normalize() : normal.clone().normalize(), box: boxOfPolygons([points.map(project)]) }
  }
  function analysisOf(image, rect, parts = null) {
    const key = [rect].concat(parts ?? []).map(({ left, top, right, bottom, triangle }) => `${left},${top},${right},${bottom}${triangle ? `:${triangle.join(";")}` : ""}`).join(" ")
    if (!image.analyses.has(key)) image.analyses.set(key, analyse(image, rect, parts && maskOf(rect, parts)))
    return image.analyses.get(key)
  }
  function wholeOf(panel, quad) {
    if (panel.whole !== undefined) return panel.whole
    const rects = panel.parts.map(part => part.texels.length === 3 ? { ...part.rect, triangle: part.texels } : part.rect)
    const bounds = { left: Math.min(...rects.map(item => item.left)), top: Math.min(...rects.map(item => item.top)), right: Math.max(...rects.map(item => item.right)), bottom: Math.max(...rects.map(item => item.bottom)) }
    const { corners, normal, texels, rect } = quad.texels.length === 3 ? panel.parts.reduce((best, part) => texelArea(part.texels) > texelArea(best.texels) ? part : best) : quad
    const toWorld = worldMap({ corners, texels })
    const wholeTexels = texels.length === 3 ? facingCorners(bounds, toWorld, normal) : texels.map(([x, y]) => [x === rect.left ? bounds.left : bounds.right, y === rect.top ? bounds.top : bounds.bottom])
    const analysis = analysisOf(quad.image, bounds, rects)
    panel.whole = analysis && faceFrom(wholeTexels.map(([x, y]) => toWorld(x, y)), wholeTexels, bounds, analysis, normal, quad.image)
    if (panel.whole) faces.push(panel.whole)
    return panel.whole
  }
  const quads = []
  const panels = new Map()
  const sizes = mesh.geometry.userData.sizes
  for (let start = 0, face = 0; start < position.count; start += sizes?.[face++] ?? 6) {
    const offsets = sizes?.[face] === 3 ? [0, 1, 2] : [0, 1, 2, 5]
    const corners = offsets.map(offset => new THREE.Vector3().fromBufferAttribute(position, start + offset).applyMatrix4(mesh.matrixWorld))
    const normal = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]))
    if (normal.lengthSq() < EPSILON * EPSILON) continue
    if (mirrored) normal.negate()
    if (normal.dot(toViewer(view, corners[0])) > 0 === showsBack) continue
    const material = materialAt(mesh, start)
    const image = material.map ? imageOf(material.map, cache) : null
    const coords = material.map?.userData.plain && plainUv ? plainUv : uv
    let texels = null
    let rect = null
    if (image) {
      texels = offsets.map(offset => [Math.round(coords.getX(start + offset) * image.width), Math.round((1 - coords.getY(start + offset)) * image.height)])
      const xs = texels.map(texel => texel[0])
      const ys = texels.map(texel => texel[1])
      rect = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
      if (rect.right <= rect.left || rect.bottom <= rect.top) {
        rect.left = Math.floor(coords.getX(start) * image.width)
        rect.top = Math.floor((1 - coords.getY(start)) * image.height)
        rect.right = rect.left + 1
        rect.bottom = rect.top + 1
      }
    }
    const quad = { corners, normal, texels, rect, image, material, panel: null }
    quads.push(quad)
    const panelArea = rect && image.panels?.find(item => contains(item, rect))
    if (!panelArea) continue
    const key = `${material.id},${panelArea.left},${panelArea.top},${Math.round(normal.clone().normalize().dot(corners[0]) / PLANE_ERROR)}`
    if (!panels.has(key)) panels.set(key, { parts: [] })
    quad.panel = panels.get(key)
    quad.panel.parts.push(quad)
  }
  for (const quad of quads) {
    const { corners, normal, texels, rect, image, material, panel } = quad
    if (panel) {
      const part = faceFrom(corners, texels, rect, null, normal, image)
      if (!part) continue
      solids.push(part)
      const whole = wholeOf(panel, quad)
      if (whole) part.whole = whole
      continue
    }
    const analysis = rect ? analysisOf(image, rect) : { base: { colour: materialColour(material) }, layers: [] }
    if (!analysis) continue
    const face = faceFrom(corners, texels, rect, analysis, normal, image)
    if (!face) continue
    faces.push(face)
    solids.push(face)
  }
  return { faces, solids }
}

function texelArea([a, b, c]) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
}

function facingCorners({ left, top, right, bottom }, toWorld, normal) {
  const texels = [[left, top], [right, top], [right, bottom], [left, bottom]]
  const [a, b, c] = texels.map(([x, y]) => toWorld(x, y))
  return b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) < 0 ? texels.reverse() : texels
}

export function worldMap(face) {
  const [c0, c1] = face.corners
  const [t0, t1] = face.texels
  const c3 = face.corners.at(-1)
  const t3 = face.texels.at(-1)
  const ax = t1[0] - t0[0]
  const ay = t1[1] - t0[1]
  const bx = t3[0] - t0[0]
  const by = t3[1] - t0[1]
  const determinant = ax * by - ay * bx
  const toOne = c1.clone().sub(c0)
  const toTwo = c3.clone().sub(c0)
  return (x, y) => {
    const dx = x - t0[0]
    const dy = y - t0[1]
    return c0.clone().addScaledVector(toOne, (dx * by - dy * bx) / determinant).addScaledVector(toTwo, (ax * dy - ay * dx) / determinant)
  }
}

export function occluderOf(face, view) {
  const middle = face.points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(face.points.length)
  const edges = face.points.map((from, index) => {
    const to = face.points[(index + 1) % face.points.length]
    const normal = view.perspective ? from.clone().sub(view.eye).cross(to.clone().sub(view.eye)) : to.clone().sub(from).cross(view.direction)
    if (normal.dot(middle.clone().sub(from)) > 0) normal.negate()
    normal.normalize()
    return { normal, constant: normal.dot(from) }
  })
  return { face, normal: face.normal, constant: face.normal.dot(face.points[0]), edges }
}

function hide(pieces, occluder) {
  const left = []
  for (const piece of pieces) {
    const [ahead, behind] = split(piece, occluder.normal, occluder.constant)
    const kept = ahead ? [ahead] : []
    let rest = behind
    for (const edge of occluder.edges) {
      if (!rest) break
      const [outside, inside] = split(rest, edge.normal, edge.constant)
      if (outside) kept.push(outside)
      rest = inside
    }
    if (rest) left.push(...kept)
    else left.push(piece)
  }
  return left
}

export function hideAll(pieces, face, occluders) {
  let left = pieces
  for (const occluder of occluders) {
    if (!left.length) break
    if (occluder.face !== face && occluder.face.whole !== face && boxesOverlap(face.box, occluder.face.box)) left = hide(left, occluder)
  }
  return left
}

export function withinConvex(polygon, piece) {
  const sign = Math.sign(signedArea(piece))
  let result = polygon
  for (const [index, [ax, ay]] of piece.entries()) {
    const [bx, by] = piece[(index + 1) % piece.length]
    const side = ([x, y]) => ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) * sign
    const kept = []
    for (const [at, point] of result.entries()) {
      const next = result[(at + 1) % result.length]
      const from = side(point)
      const to = side(next)
      if (from >= 0) kept.push(point)
      if (from * to < 0) kept.push([point[0] + (next[0] - point[0]) * from / (from - to), point[1] + (next[1] - point[1]) * from / (from - to)])
    }
    if (kept.length < 3) return null
    result = kept
  }
  return result
}
