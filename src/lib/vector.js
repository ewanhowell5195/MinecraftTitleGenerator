import { FillRule, difference, intersectD, union, unionD } from "@countertype/clipper2-ts"
import * as THREE from "three"
import { packed } from "./colour.js"
import { clamp } from "./maths.js"
import { SAMPLES, placement, titleShot } from "./render.js"
import { near, jump, mixed, within, brightness, simplifyStops, colourTotals, analyse, contains, maskOf, BASE } from "./vectorTexture.js"
import { area, signedArea, sameWinding, sharedEdges, number, writePath, loopsInHundredths, stitched, addInOrder, addTo, boxOfPolygons, boxesOverlap, shapesOverlap, shapeOfPolygons, mergedByFill, unionOf, coverOf, addToCover, visibleLoops } from "./vectorPaths.js"

const EPSILON = 1e-4
const SLIVER = 1e-3
const GRADIENT_AGREE = 3
const NEARLY_FLAT = 2
const SHORT_GRADIENT = 1 / 512
const NEAR_FILLS = 2
const BLEED = 1 / 512
const SEAM_PRECISION = 4
const GROW = 0.05
const BAND_OVERLAP = 0.5
const GRADIENT_MATCH = 0.1
const SEAM = 0.5
const JOIN_REACH = 2
const JOIN_TRIM = 0.25
const PLANE_ERROR = 1e-2
const CROP_MARGIN = 1 / (SAMPLES * 2)
const FIT_ERROR = 1 / 4096
const SPACING_ERROR = 1 / 8192
const MAX_SPLITS = 5

function split(points, normal, constant) {
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

function hexOf(colour) {
  return `#${[colour & 255, colour >> 8 & 255, colour >> 16 & 255].map(value => value.toString(16).padStart(2, "0")).join("")}`
}

function imageOf(texture, cache) {
  if (!cache.has(texture)) {
    const { width, height } = texture.image
    cache.set(texture, { data: texture.image.getContext("2d").getImageData(0, 0, width, height).data, width, height, labels: texture.userData.labels?.() ?? null, gradient: texture.userData.gradient ?? null, fades: texture.userData.fades ?? null, panels: texture.userData.panels ?? null, analyses: new Map() })
  }
  return cache.get(texture)
}

function materialColour(material) {
  return parseInt(material.color.getHexString().replace(/(..)(..)(..)/, "$3$2$1"), 16)
}

function facesOf(mesh, view, project, cache) {
  const { position, uv } = mesh.geometry.attributes
  const mirrored = mesh.matrixWorld.determinant() < 0
  const showsBack = mesh.material.side === THREE.BackSide
  const image = mesh.material.map ? imageOf(mesh.material.map, cache) : null
  const faces = []
  const solids = []
  function faceFrom(corners, texels, rect, analysis, normal) {
    const points = view.perspective ? split(corners, view.direction, view.direction.dot(view.eye) + view.near)[0] : corners
    if (!points) return null
    const facing = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).normalize()
    return { index: faces.length, corners, texels, rect, image, analysis, points, facing, normal: normal.dot(toViewer(view, corners[0])) < 0 ? normal.clone().negate().normalize() : normal.clone().normalize(), box: boxOfPolygons([points.map(project)]) }
  }
  function analysisOf(rect, parts = null) {
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
    const analysis = analysisOf(bounds, rects)
    panel.whole = analysis && faceFrom(wholeTexels.map(([x, y]) => toWorld(x, y)), wholeTexels, bounds, analysis, normal)
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
    let texels = null
    let rect = null
    if (image) {
      texels = offsets.map(offset => [Math.round(uv.getX(start + offset) * image.width), Math.round((1 - uv.getY(start + offset)) * image.height)])
      const xs = texels.map(texel => texel[0])
      const ys = texels.map(texel => texel[1])
      rect = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
      if (rect.right <= rect.left || rect.bottom <= rect.top) {
        rect.left = Math.floor(uv.getX(start) * image.width)
        rect.top = Math.floor((1 - uv.getY(start)) * image.height)
        rect.right = rect.left + 1
        rect.bottom = rect.top + 1
      }
    }
    const quad = { corners, normal, texels, rect, panel: null }
    quads.push(quad)
    const panelArea = rect && image.panels?.find(item => contains(item, rect))
    if (!panelArea) continue
    const key = `${panelArea.left},${panelArea.top},${Math.round(normal.clone().normalize().dot(corners[0]) / PLANE_ERROR)}`
    if (!panels.has(key)) panels.set(key, { parts: [] })
    quad.panel = panels.get(key)
    quad.panel.parts.push(quad)
  }
  for (const quad of quads) {
    const { corners, normal, texels, rect, panel } = quad
    if (panel) {
      const part = faceFrom(corners, texels, rect, null, normal)
      if (!part) continue
      solids.push(part)
      const whole = wholeOf(panel, quad)
      if (whole) part.whole = whole
      continue
    }
    const analysis = rect ? analysisOf(rect) : { base: { colour: materialColour(mesh.material) }, layers: [] }
    if (!analysis) continue
    const face = faceFrom(corners, texels, rect, analysis, normal)
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

function worldMap(face) {
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

function occluderOf(face, view) {
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

function hideAll(pieces, face, occluders) {
  let left = pieces
  for (const occluder of occluders) {
    if (!left.length) break
    if (occluder.face !== face && occluder.face.whole !== face && boxesOverlap(face.box, occluder.face.box)) left = hide(left, occluder)
  }
  return left
}

function grownOutward(polygon) {
  const middleX = polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length
  const middleY = polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length
  return polygon.map(([x, y]) => {
    const length = Math.hypot(x - middleX, y - middleY) || 1
    return [x + (x - middleX) / length * GROW, y + (y - middleY) / length * GROW]
  })
}

function insideFace(point, face) {
  return face.corners.every((corner, index) => {
    const next = face.corners[(index + 1) % face.corners.length]
    return next.clone().sub(corner).cross(point.clone().sub(corner)).dot(face.facing) >= -EPSILON
  })
}

function neighbourOf(face, others, point) {
  return others.find(other => other !== face && other.image && Math.abs(other.normal.dot(face.normal) - 1) < EPSILON && Math.abs(other.normal.dot(point) - other.normal.dot(other.corners[0])) < PLANE_ERROR && insideFace(point, other))
}

function neighbourBeside(face, others, toWorld, x, y, dx, dy) {
  return neighbourOf(face, others, toWorld(face.rect.left + x + 0.5 + dx, face.rect.top + y + 0.5 + dy))
}

function texelIn({ left, top, right, bottom }, x, y) {
  return [clamp(Math.floor(x), left, right - 1), clamp(Math.floor(y), top, bottom - 1)]
}

function colourAt(face, x, y) {
  const { data, width } = face.image
  const [column, row] = texelIn(face.rect, x, y)
  const at = (row * width + column) * 4
  return data[at + 3] < 128 ? null : packed(data, at)
}

function texelOf(face, point) {
  const [c0, c1] = face.corners
  const [t0, t1] = face.texels
  const c3 = face.corners.at(-1)
  const t3 = face.texels.at(-1)
  const across = c1.clone().sub(c0)
  const down = c3.clone().sub(c0)
  const offset = point.clone().sub(c0)
  const aa = across.lengthSq()
  const ab = across.dot(down)
  const bb = down.lengthSq()
  const determinant = aa * bb - ab * ab
  const u = (offset.dot(across) * bb - offset.dot(down) * ab) / determinant
  const v = (offset.dot(down) * aa - offset.dot(across) * ab) / determinant
  return [t0[0] + u * (t1[0] - t0[0]) + v * (t3[0] - t0[0]), t0[1] + u * (t1[1] - t0[1]) + v * (t3[1] - t0[1])]
}

function layerOwns(face, x, y) {
  const { left, top, right } = face.rect
  const [column, row] = texelIn(face.rect, x, y)
  return face.analysis.owner?.[(row - top) * (right - left) + column - left] >= 0
}

function joinKind(face, others, toWorld, x, y, dx, dy) {
  const point = toWorld(x + dx, y + dy)
  const other = neighbourOf(face, others, point)
  if (!other) return null
  const [texelX, texelY] = texelOf(other, point)
  const own = colourAt(face, x - dx, y - dy)
  const beyond = colourAt(other, texelX, texelY)
  if (own === null || beyond === null) return null
  if (near(own, beyond)) return "over"
  if (!layerOwns(other, texelX, texelY)) return other
  return other.index > face.index ? "under" : null
}

function joinsOf(face, loop, others, toWorld) {
  const { left, top, right, bottom } = face.rect
  const joins = { over: [], under: [], covers: [] }
  for (const [index, point] of loop.entries()) {
    const next = loop[(index + 1) % loop.length]
    const dx = point[0] !== next[0] ? 0 : point[0] === left ? -SEAM : point[0] === right ? SEAM : 0
    const dy = point[1] !== next[1] ? 0 : point[1] === top ? -SEAM : point[1] === bottom ? SEAM : 0
    if (!dx && !dy) continue
    const stepX = Math.sign(next[0] - point[0])
    const stepY = Math.sign(next[1] - point[1])
    const length = Math.abs(next[0] - point[0]) + Math.abs(next[1] - point[1])
    function endsHard(inside, outside) {
      const x = point[0] + stepX * outside - dx
      const y = point[1] + stepY * outside - dy
      if (x < left || x >= right || y < top || y >= bottom) return true
      const own = colourAt(face, point[0] + stepX * inside - dx, point[1] + stepY * inside - dy)
      const other = colourAt(face, x, y)
      return own === null || other === null || jump(own, other)
    }
    let start = 0
    let kind = null
    for (let unit = 0; unit <= length; unit++) {
      const current = unit < length ? joinKind(face, others, toWorld, point[0] + stepX * (unit + 0.5), point[1] + stepY * (unit + 0.5), dx, dy) : null
      if (current === kind && unit < length) continue
      if (kind !== null) {
        const head = start + (start === 0 && endsHard(0.5, -0.5) ? JOIN_TRIM : 0)
        const tail = unit - (unit === length && endsHard(length - 0.5, length + 0.5) ? JOIN_TRIM : 0)
        const from = [point[0] + stepX * head, point[1] + stepY * head]
        const to = [point[0] + stepX * tail, point[1] + stepY * tail]
        function quad(inset, reach, shrink) {
          const [fromX, fromY] = [from[0] + stepX * shrink, from[1] + stepY * shrink]
          const [toX, toY] = [to[0] - stepX * shrink, to[1] - stepY * shrink]
          return [[fromX - dx * inset, fromY - dy * inset], [toX - dx * inset, toY - dy * inset], [toX + dx * reach, toY + dy * reach], [fromX + dx * reach, fromY + dy * reach]]
        }
        if (typeof kind === "object") {
          joins.covers.push({ neighbour: kind, quad: quad(0, JOIN_REACH, 0) })
          joins.over.push(quad(1, JOIN_REACH / 2, JOIN_TRIM / 2))
        } else joins[kind].push(quad(kind === "under" ? 0 : 1, JOIN_REACH, 0))
      }
      start = unit
      kind = current
    }
  }
  return joins
}

function outerPixels(face, others, list) {
  const toWorld = worldMap(face)
  const { left, top, right, bottom } = face.rect
  const width = right - left
  const height = bottom - top
  return list.filter(index => {
    const x = index % width
    const y = Math.floor(index / width)
    const sides = [x === 0 && [-1, 0], x === width - 1 && [1, 0], y === 0 && [0, -1], y === height - 1 && [0, 1]].filter(Boolean)
    return sides.every(([dx, dy]) => !neighbourBeside(face, others, toWorld, x, y, dx, dy))
  })
}

function trimmedBase(face, others) {
  const toWorld = worldMap(face)
  const { left, top, right, bottom } = face.rect
  const width = right - left
  const height = bottom - top
  const { owner } = face.analysis
  const dropped = new Set()
  function touchesBase(x, y) {
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (owner[ny * width + nx] === BASE) return true
      }
    }
    return false
  }
  function check(x, y, dx, dy) {
    const index = y * width + x
    if (owner[index] >= 0 && !touchesBase(x, y) && !neighbourBeside(face, others, toWorld, x, y, dx, dy)) dropped.add(index)
  }
  for (let x = 0; x < width; x++) {
    check(x, 0, 0, -1)
    check(x, height - 1, 0, 1)
  }
  for (let y = 0; y < height; y++) {
    check(0, y, -1, 0)
    check(width - 1, y, 1, 0)
  }
  if (!dropped.size) return null
  const kept = []
  for (let index = 0; index < width * height; index++) {
    if (!dropped.has(index)) kept.push(index)
  }
  return kept
}

function fitGradient(face, rect, model, project, limits) {
  const toWorld = worldMap(face)
  const [ax, ay] = model.axis
  const centreX = (rect.left + rect.right) / 2
  const centreY = (rect.top + rect.bottom) / 2
  const middle = ax * centreX + ay * centreY
  const reach = (Math.abs(ay) * (rect.right - rect.left) + Math.abs(ax) * (rect.bottom - rect.top)) / 2
  const at = (t, across) => project(toWorld(centreX + ax * (t - middle) - ay * across, centreY + ay * (t - middle) + ax * across))
  const from = at(middle, -reach)
  const to = at(middle, reach)
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (length < EPSILON) return null
  let nx = -(to[1] - from[1]) / length
  let ny = (to[0] - from[0]) / length
  const first = model.stops[0].t
  const last = model.stops.at(-1).t
  function along(t) {
    const [x, y] = at(t, 0)
    return x * nx + y * ny
  }
  if (along(last) < along(first)) {
    nx = -nx
    ny = -ny
  }
  const start = along(first)
  const span = along(last) - start
  if (span < EPSILON) return null
  const depth = (Math.abs(ax) * (rect.right - rect.left) + Math.abs(ay) * (rect.bottom - rect.top)) / 2
  let error = 0
  for (const t of [middle - depth, middle, middle + depth]) {
    for (const across of [-reach, reach]) {
      const [x, y] = at(t, across)
      error = Math.max(error, Math.abs(x * nx + y * ny - along(t)))
    }
  }
  const knots = []
  function refine(a, b, level) {
    const halfway = (a.t + b.t) / 2
    if (level < 6 && b.t > a.t && Math.abs(along(halfway) - (along(a.t) + along(b.t)) / 2) > limits.spacing) {
      const centre = { t: halfway, colour: mixed(a.colour, b.colour, 0.5) }
      refine(a, centre, level + 1)
      refine(centre, b, level + 1)
      return
    }
    knots.push(b)
  }
  knots.push(model.stops[0])
  for (let index = 1; index < model.stops.length; index++) {
    if (model.stops[index - 1].colour === model.stops[index].colour) knots.push(model.stops[index])
    else refine(model.stops[index - 1], model.stops[index], 0)
  }
  const [x1, y1] = at(first, 0)
  return { x1, y1, x2: x1 + nx * span, y2: y1 + ny * span, stops: knots.map(stop => [clamp((along(stop.t) - start) / span, 0, 1), stop.colour]), error }
}

function tenth(value) {
  return String(Math.round(value * 10) / 10)
}

function offsetOf(value) {
  return String(Math.round(value * 1e3) / 1e3).replace(/^0\./, ".")
}

function alignment({ x1, y1, x2, y2 }) {
  return { upright: Math.abs(x2 - x1) < GRADIENT_MATCH, level: Math.abs(y2 - y1) < GRADIENT_MATCH }
}

function middleOf(list) {
  return list[Math.floor(list.length / 2)]
}

function lineOf(gradient) {
  const { x1, y1, x2, y2, stops } = gradient
  const { upright, level } = alignment(gradient)
  if (!upright && !level) return null
  const [from, to] = upright ? [y1, y2] : [x1, x2]
  if (to < from) return null
  return { upright, points: stops.map(([offset, colour]) => ({ t: from + offset * (to - from), colour })) }
}

function colourOn(points, t) {
  const after = points.findIndex(point => point.t >= t)
  if (after <= 0) return points[after < 0 ? points.length - 1 : 0].colour
  const from = points[after - 1]
  const to = points[after]
  return mixed(from.colour, to.colour, to.t > from.t ? (t - from.t) / (to.t - from.t) : 1)
}

function agree(first, second) {
  const low = Math.max(first[0].t, second[0].t)
  const high = Math.min(first.at(-1).t, second.at(-1).t)
  if (low > high) return false
  const samples = first.concat(second).map(point => point.t).filter(t => t >= low && t <= high).concat(low, high)
  return samples.every(t => within(colourOn(first, t), colourOn(second, t), GRADIENT_AGREE))
}

function joinedPoints(first, second) {
  const low = first[0].t
  const high = first.at(-1).t
  return first.concat(second.filter(point => point.t < low || point.t > high)).sort((a, b) => a.t - b.t)
}

class Output {
  constructor() {
    this.gradients = new Map()
    this.nextId = 0
    this.fills = new Map()
  }

  brightness(fill) {
    const stops = this.fills.get(fill)?.stops
    return brightness(stops ? middleOf(stops)[1] : parseInt(fill.slice(1), 16))
  }

  fill(gradient) {
    const { upright, level } = alignment(gradient)
    const key = JSON.stringify([upright ? 0 : gradient.x1, level ? 0 : gradient.y1, upright ? 0 : gradient.x2, level ? 0 : gradient.y2].map(value => Math.round(value / GRADIENT_MATCH)).concat(gradient.stops.map(([offset, colour]) => [Math.round(offset * 1e3), colour])))
    if (!this.gradients.has(key)) this.gradients.set(key, { id: `g${this.nextId++}`, key, gradient })
    const fill = `url(#${this.gradients.get(key).id})`
    this.fills.set(fill, gradient)
    return fill
  }

  mergeAlongAxis(shortest) {
    const merged = new Map()
    const groups = []
    const entries = Array.from(this.gradients.values()).sort((a, b) => a.gradient.y1 - b.gradient.y1 || a.gradient.x1 - b.gradient.x1)
    for (const entry of entries) {
      const line = lineOf(entry.gradient)
      const group = line && groups.find(other => other.upright === line.upright && agree(other.points, line.points))
      if (!group) {
        if (line) groups.push({ ...line, entry })
        continue
      }
      group.points = joinedPoints(group.points, line.points)
      merged.set(`url(#${entry.id})`, `url(#${group.entry.id})`)
      this.gradients.delete(entry.key)
    }
    for (const { entry, upright, points } of groups) {
      const kept = simplifyStops(points)
      const from = kept[0].t
      const to = kept.at(-1).t
      const span = to - from || 1
      entry.gradient = { x1: upright ? entry.gradient.x1 : from, y1: upright ? from : entry.gradient.y1, x2: upright ? entry.gradient.x1 : to, y2: upright ? to : entry.gradient.y1, stops: kept.map(({ t, colour }) => [(t - from) / span, colour]) }
      this.fills.set(`url(#${entry.id})`, entry.gradient)
    }
    const flats = []
    const flattened = new Map()
    for (const entry of Array.from(this.gradients.values())) {
      const { x1, y1, x2, y2, stops } = entry.gradient
      const middle = middleOf(stops)[1]
      if (Math.hypot(x2 - x1, y2 - y1) > shortest && !stops.every(([, colour]) => within(colour, middle, NEARLY_FLAT))) {
        entry.gradient.stops = simplifyStops(stops.map(([t, colour]) => ({ t, colour })), NEARLY_FLAT).map(({ t, colour }) => [t, colour])
        continue
      }
      let flat = flats.find(colour => within(colour, middle, NEARLY_FLAT))
      if (flat === undefined) {
        flat = middle
        flats.push(flat)
      }
      flattened.set(`url(#${entry.id})`, hexOf(flat))
      this.gradients.delete(entry.key)
    }
    for (const [from, to] of merged) merged.set(from, flattened.get(to) ?? to)
    for (const [from, to] of flattened) merged.set(from, to)
    return merged
  }

  defs(left, top) {
    const owners = new Map()
    return Array.from(this.gradients.values(), ({ id, gradient }) => {
      const { upright, level } = alignment(gradient)
      const line = `x1="${upright ? 0 : tenth(gradient.x1 - left)}" y1="${level ? 0 : tenth(gradient.y1 - top)}" x2="${upright ? 0 : tenth(gradient.x2 - left)}" y2="${level ? 0 : tenth(gradient.y2 - top)}"`
      const stops = gradient.stops.map(([offset, colour]) => `<stop offset="${offsetOf(offset)}" stop-color="${hexOf(colour)}"/>`).join("")
      if (owners.has(stops)) return `<linearGradient id="${id}" xlink:href="#${owners.get(stops)}" ${line}/>`
      owners.set(stops, id)
      return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${line}>${stops}</linearGradient>`
    }).join("")
  }
}

function halved(model, rect) {
  const acrossX = Math.abs(model.axis[1]) >= Math.abs(model.axis[0])
  const middle = acrossX ? Math.round((rect.left + rect.right) / 2) : Math.round((rect.top + rect.bottom) / 2)
  return { acrossX, middle, low: acrossX ? { ...rect, right: middle } : { ...rect, bottom: middle }, high: acrossX ? { ...rect, left: middle } : { ...rect, top: middle }, size: acrossX ? rect.right - rect.left : rect.bottom - rect.top }
}

function bandRuns(stops) {
  const runs = []
  for (const stop of stops) {
    if (runs.at(-1)?.colour === stop.colour) continue
    if (runs.length) runs.at(-1).to = stop.t
    runs.push({ colour: stop.colour, from: runs.length ? stop.t : -Infinity, to: Infinity })
  }
  return runs
}

function bandPlane(face, [ax, ay]) {
  const toWorld = worldMap(face)
  const origin = toWorld(0, 0)
  const u = toWorld(1, 0).sub(origin)
  const v = toWorld(0, 1).sub(origin)
  const along = u.clone().multiplyScalar(ax).addScaledVector(v, ay)
  const across = u.clone().multiplyScalar(-ay).addScaledVector(v, ax)
  const normal = along.addScaledVector(across, -along.dot(across) / across.dot(across)).normalize()
  return { normal, at: t => normal.dot(toWorld(ax * t, ay * t)) }
}

function withinConvex(polygon, piece) {
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

function clippedToBand(polygons, { normal, at }, from, to) {
  return polygons.flatMap(polygon => {
    const above = from === -Infinity ? polygon : split(polygon, normal, at(from))[0]
    const inside = above && to !== Infinity ? split(above, normal, at(to))[1] : above
    return inside ? [inside] : []
  })
}

function basesJoinedToLayers(list, placed) {
  function movedUp(fill, polygon) {
    const at = placed.findIndex(entry => entry[0] === fill)
    if (at < 0) return false
    const shape = shapeOfPolygons([polygon])
    if (list.concat(placed.slice(0, at)).some(([other, polygons]) => other !== fill && shapesOverlap(shapeOfPolygons(polygons), shape))) return false
    placed[at][1].push(polygon)
    return true
  }
  return list.map(([fill, polygons]) => [fill, polygons.filter(polygon => !movedUp(fill, polygon))]).filter(([, polygons]) => polygons.length)
}

function aroundStrokes(polygons, strokes, bleed) {
  const boxes = strokes.flatMap(([, segments]) => segments.map(segment => {
    const { minX, minY, maxX, maxY } = boxOfPolygons([segment])
    return { minX: minX - bleed, minY: minY - bleed, maxX: maxX + bleed, maxY: maxY + bleed }
  }))
  return polygons.filter(polygon => {
    const box = boxOfPolygons([polygon])
    return boxes.some(other => boxesOverlap(box, other))
  }).map(grownOutward)
}

function stripsAlong(segments, width) {
  return segments.map(([[ax, ay], [bx, by]]) => {
    const length = Math.hypot(bx - ax, by - ay) || 1
    const nx = (ay - by) / length * width / 2
    const ny = (bx - ax) / length * width / 2
    return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]
  })
}

function seamsOf(list, bleed, output) {
  const strokes = list.length > 1 ? Array.from(sharedEdges(list)).sort((a, b) => output.brightness(a[0]) - output.brightness(b[0])) : []
  if (!strokes.length) return []
  const toPaths = polygons => polygons.map(polygon => polygon.map(([x, y]) => ({ x, y })))
  const areas = list.map(([, polygons]) => toPaths(aroundStrokes(polygons, strokes, bleed))).filter(paths => paths.length)
  return strokes.map(([fill, segments]) => {
    const strips = toPaths(stripsAlong(segments, bleed))
    return [fill, areas.flatMap(area => intersectD(strips, area, FillRule.NonZero, SEAM_PRECISION)).map(path => sameWinding(path.map(point => [point.x, point.y])))]
  }).filter(([, polygons]) => polygons.length)
}

function entriesOf({ base, layers, joins, covers }, { bleed, output, totals }) {
  const list = Array.from(base)
  const placed = mergedByFill(layers, totals)
  return seamsOf(list, bleed, output).concat(basesJoinedToLayers(list, placed), placed, mergedByFill(joins, totals), Array.from(covers))
}

function filledArea(polygons) {
  if (polygons.every(polygon => signedArea(polygon) > 0)) return polygons
  return unionD(polygons.map(polygon => polygon.map(([x, y]) => ({ x, y }))), FillRule.NonZero, SEAM_PRECISION).map(path => path.map(point => [point.x, point.y]))
}

function pathMarkup(fill, loops) {
  return loops.length ? `<path fill="${fill}" d="${writePath(loops)}"/>` : ""
}

function toPaths64(loops) {
  return loops.map(loop => loop.map(([x, y]) => ({ x, y })))
}

function fromPaths64(paths) {
  return paths.map(path => path.map(({ x, y }) => [x, y]))
}

function sinkToSameFill(shapes) {
  for (const [later, shape] of shapes.entries()) {
    if (!shape.shown.length) continue
    const target = shapes.findIndex(other => other.fill === shape.fill && other.shown.length)
    if (target >= later) continue
    const area = toPaths64(shape.loops)
    const box = boxOfPolygons(shape.loops)
    const cut = []
    for (const other of shapes.slice(target + 1, later)) {
      if (!other.shown.length || other.fill === shape.fill || !boxesOverlap(boxOfPolygons(other.shown), box)) continue
      cut.push({ other, shown: fromPaths64(difference(toPaths64(other.shown), area, FillRule.NonZero)), loops: fromPaths64(difference(toPaths64(other.loops), area, FillRule.NonZero)) })
    }
    const joined = fromPaths64(union(toPaths64(shapes[target].shown), toPaths64(shape.shown), FillRule.NonZero))
    const before = pathMarkup(shape.fill, shapes[target].shown).length + pathMarkup(shape.fill, shape.shown).length + cut.reduce((sum, { other }) => sum + pathMarkup(other.fill, other.shown).length, 0)
    const after = pathMarkup(shape.fill, joined).length + cut.reduce((sum, { other, shown }) => sum + pathMarkup(other.fill, shown).length, 0)
    if (after >= before) continue
    shapes[target].shown = joined
    shapes[target].loops = fromPaths64(union(toPaths64(shapes[target].loops), area, FillRule.NonZero))
    shape.shown = []
    for (const { other, shown, loops } of cut) {
      other.shown = shown
      other.loops = loops
    }
  }
  return shapes
}

function markupOf(entries, { left, top, totals, cover }) {
  const source = new Map(entries.flatMap(([, polygons], index) => polygons.map(polygon => [polygon, index])))
  const shapes = []
  for (const [fill, polygons] of mergedByFill(entries, totals).toReversed()) {
    const filled = Array.from(Map.groupBy(polygons, polygon => source.get(polygon)).values()).flatMap(filledArea)
    const loops = unionOf(stitched(loopsInHundredths(filled, left, top)))
    shapes.unshift({ fill, loops, shown: visibleLoops(loops, cover) })
    addToCover(cover, loops)
  }
  return sinkToSameFill(shapes).map(({ fill, shown }) => pathMarkup(fill, shown)).join("")
}

function useMergedFills(layers, merged) {
  const renamed = entries => entries.map(([fill, polygons]) => [merged.get(fill) ?? fill, polygons])
  function renamedMap(map) {
    const next = new Map()
    for (const [fill, polygons] of map) addTo(next, merged.get(fill) ?? fill, polygons)
    return next
  }
  for (const layer of layers) {
    layer.base = renamedMap(layer.base)
    layer.covers = renamedMap(layer.covers)
    layer.layers = renamed(layer.layers)
    layer.joins = renamed(layer.joins)
  }
}

function nearFillsJoined(layers, totals, level) {
  const used = new Set()
  for (const { base, layers: shapes, joins, covers } of layers) {
    for (const fill of Array.from(base.keys()).concat(shapes.map(entry => entry[0]), joins.map(entry => entry[0]), Array.from(covers.keys()))) {
      if (fill.startsWith("#")) used.add(fill)
    }
  }
  const kept = []
  const joined = new Map()
  for (const fill of Array.from(used).sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))) {
    const colour = parseInt(fill.slice(1), 16)
    const home = kept.find(other => within(parseInt(other.slice(1), 16), colour, level))
    if (home) joined.set(fill, home)
    else kept.push(fill)
  }
  return joined
}

function fillTotals(cache, bandFills) {
  const totals = new Map()
  for (const image of cache.values()) {
    for (const [colour, count] of colourTotals(image)) {
      const fill = hexOf(colour)
      totals.set(fill, (totals.get(fill) ?? 0) + count)
    }
  }
  for (const fill of bandFills) totals.delete(fill)
  return totals
}

function polygonsOfLayer({ base, layers, joins, covers }) {
  return Array.from(base.values()).concat(layers.map(entry => entry[1]), joins.map(entry => entry[1]), Array.from(covers.values())).flat()
}

function joinToLayerBelow(below, layer) {
  if (below.layers.length || below.joins.length || below.covers.size || below.base.size !== 1) return
  const [[fill, polygons]] = below.base
  const shapes = Array.from(layer.base)
  const at = shapes.findIndex(entry => entry[0] === fill)
  if (at < 0) return
  const earlier = shapes.slice(0, at).map(entry => shapeOfPolygons(entry[1]))
  const kept = []
  const moved = polygons.map(sameWinding)
  for (const polygon of shapes[at][1]) {
    const shape = shapeOfPolygons([polygon])
    if (earlier.some(other => shapesOverlap(other, shape))) kept.push(polygon)
    else moved.push(sameWinding(polygon))
  }
  below.base.set(fill, moved)
  if (kept.length) layer.base.set(fill, kept)
  else layer.base.delete(fill)
}

function joinFacesToLayerBelow(layers) {
  const kept = []
  for (const layer of layers) {
    if (kept.length) joinToLayerBelow(kept.at(-1), layer)
    if (polygonsOfLayer(layer).length) kept.push(layer)
  }
  return kept
}

export function vectorTitle(scene, camera, size, resolution) {
  const shot = titleShot(scene, camera, size, resolution * SAMPLES)
  if (!shot) return null
  const { bounds } = shot
  const scaleX = shot.outWidth / SAMPLES / (bounds.maxX - bounds.minX)
  const scaleY = shot.outHeight / SAMPLES / (bounds.maxY - bounds.minY)
  const view = { perspective: camera.isPerspectiveCamera, eye: camera.getWorldPosition(new THREE.Vector3()), direction: camera.getWorldDirection(new THREE.Vector3()), near: camera.near }
  const limits = { fit: resolution * FIT_ERROR, spacing: resolution * SPACING_ERROR }
  const output = new Output()
  const bandFills = new Set()

  function project(point) {
    const { x, y } = point.clone().project(camera)
    return [((x + 1) / 2 - bounds.minX) * scaleX, ((1 - y) / 2 - bounds.minY) * scaleY]
  }

  function bandFill(colour) {
    const fill = hexOf(colour)
    bandFills.add(fill)
    return fill
  }

  function onScreen(pieces) {
    return pieces.map(piece => piece.map(project)).filter(polygon => area(polygon) >= SLIVER)
  }

  function gradientOf(face, rect, model) {
    return model.stops ? fitGradient(face, rect, model, project, limits) : null
  }

  function splits(gradient, depth) {
    return gradient && gradient.error > limits.fit && depth < MAX_SPLITS
  }

  function fillFor(model, gradient) {
    return gradient ? output.fill(gradient) : hexOf(model.stops ? middleOf(model.stops).colour : model.colour)
  }

  function fillBase(face, model, rect, pieces, groups, depth) {
    if (model.bands) {
      const plane = bandPlane(face, model.axis)
      for (const { colour, from, to } of bandRuns(model.stops)) addTo(groups, bandFill(colour), onScreen(clippedToBand(pieces, plane, from, to)))
      return
    }
    const gradient = gradientOf(face, rect, model)
    const half = splits(gradient, depth) && halved(model, rect)
    if (half?.size >= 2) {
      const toWorld = worldMap(face)
      const { acrossX, middle } = half
      const to = acrossX ? toWorld(rect.right, rect.top) : toWorld(rect.left, rect.bottom)
      const normal = to.clone().sub(toWorld(rect.left, rect.top)).normalize()
      const constant = normal.dot(acrossX ? toWorld(middle, rect.top) : toWorld(rect.left, middle))
      const low = []
      const high = []
      for (const piece of pieces) {
        const [above, below] = split(piece, normal, constant)
        if (above) high.push(above)
        if (below) low.push(below)
      }
      if (low.length) fillBase(face, model, half.low, low, groups, depth + 1)
      if (high.length) fillBase(face, model, half.high, high, groups, depth + 1)
      return
    }
    addTo(groups, fillFor(model, gradient), onScreen(pieces))
  }

  function paintPixels(face, layer, list, rect, groups, depth, stacked = true) {
    const toWorld = worldMap(face)
    if (layer.bands) {
      const plane = bandPlane(face, layer.axis)
      const loops = face.analysis.shapeOf(list, layer.smooth).map(loop => loop.map(([x, y]) => toWorld(x, y)))
      for (const { colour, from, to } of bandRuns(layer.stops)) addInOrder(groups, bandFill(colour), clippedToBand(loops, plane, from, stacked ? to + BAND_OVERLAP : to).map(piece => piece.map(project)))
      return
    }
    const gradient = gradientOf(face, rect, layer)
    const half = splits(gradient, depth) && halved(layer, rect)
    if (half?.size >= 2) {
      const { acrossX, middle } = half
      const faceWidth = face.rect.right - face.rect.left
      const coordinate = index => acrossX ? face.rect.left + index % faceWidth : face.rect.top + Math.floor(index / faceWidth)
      const low = list.filter(index => coordinate(index) <= middle)
      const high = list.filter(index => coordinate(index) >= middle)
      if (low.length && high.length && low.length < list.length && high.length < list.length) {
        paintPixels(face, layer, low, half.low, groups, depth + 1)
        paintPixels(face, layer, high, half.high, groups, depth + 1)
        return
      }
    }
    addInOrder(groups, fillFor(layer, gradient), face.analysis.shapeOf(list, layer.smooth).map(loop => loop.map(([x, y]) => project(toWorld(x, y)))))
  }

  function wholeFill(face, model) {
    return fillFor(model, gradientOf(face, face.rect, model))
  }

  function fillLayer(face, faces, layer, { groups, joins, covers }) {
    const toWorld = worldMap(face)
    const found = layer.exact.map(loop => joinsOf(face, loop, faces, toWorld))
    const projected = list => list.map(join => join.map(([x, y]) => project(toWorld(x, y))))
    const under = projected(found.flatMap(item => item.under))
    const over = projected(found.flatMap(item => item.over)).map(sameWinding)
    if (under.length || over.length) {
      const fill = wholeFill(face, layer)
      addInOrder(groups, fill, under)
      addInOrder(joins, fill, over)
    }
    for (const { neighbour, quad } of found.flatMap(item => item.covers)) addTo(covers, wholeFill(neighbour, neighbour.analysis.base), projected([quad]).map(sameWinding))
    paintPixels(face, layer, layer.edges?.length ? layer.pixels.concat(outerPixels(face, faces, layer.edges)) : layer.pixels, face.rect, groups, 0)
  }

  const meshes = []
  scene.traverseVisible(object => {
    if (object.isMesh && object.geometry.attributes.position.count) meshes.push(object)
  })
  meshes.sort((a, b) => a.renderOrder - b.renderOrder)

  const cache = new Map()
  const occluders = []
  const layers = []
  for (const mesh of meshes) {
    const { faces, solids } = facesOf(mesh, view, project, cache)
    const own = mesh.material.depthWrite ? solids.map(face => occluderOf(face, view)) : []
    if (!mesh.material.colorWrite) {
      occluders.push(...own)
      continue
    }
    const layer = { base: new Map(), layers: [], joins: [], covers: new Map() }
    for (const face of faces) {
      const visible = hideAll(hideAll([face.points], face, occluders), face, own)
      if (!visible.length) continue
      const { base, layers: shapes } = face.analysis
      const whole = visible.length === 1 && visible[0] === face.corners
      const target = whole ? { groups: layer.layers, joins: layer.joins, covers: layer.covers } : { groups: [], joins: [], covers: new Map() }
      if (base.masked) fillLayer(face, faces, base, target)
      else {
        const trimmed = whole && shapes.length ? trimmedBase(face, faces) : null
        if (trimmed) {
          const painted = []
          paintPixels(face, base, trimmed, face.rect, painted, 0, false)
          for (const [fill, polygons] of painted) addTo(layer.base, fill, polygons)
        } else fillBase(face, base, face.rect, visible, layer.base, 0)
      }
      for (const shape of shapes) fillLayer(face, faces, shape, target)
      if (!whole) {
        const pieces = visible.map(piece => piece.map(project))
        const shown = polygons => polygons.flatMap(polygon => pieces.map(piece => withinConvex(polygon, piece)).filter(Boolean))
        for (const [fill, polygons] of target.groups) addInOrder(layer.layers, fill, shown(polygons))
        for (const [fill, polygons] of target.joins) addInOrder(layer.joins, fill, shown(polygons))
        for (const [fill, polygons] of target.covers) addTo(layer.covers, fill, shown(polygons))
      }
    }
    occluders.push(...own)
    if (layer.base.size || layer.layers.length) layers.push(layer)
  }
  if (!layers.length) return null

  const { minX, minY, maxX, maxY } = boxOfPolygons(layers.flatMap(layer => Array.from(layer.base.values()).concat(layer.layers.map(entry => entry[1])).flat()))
  const left = Math.floor(minX + CROP_MARGIN)
  const top = Math.floor(minY + CROP_MARGIN)
  const right = Math.ceil(maxX - CROP_MARGIN)
  const bottom = Math.ceil(maxY - CROP_MARGIN)
  const joined = joinFacesToLayerBelow(layers)
  useMergedFills(joined, output.mergeAlongAxis(resolution * SHORT_GRADIENT))
  const totals = fillTotals(cache, bandFills)
  useMergedFills(joined, nearFillsJoined(joined, totals, NEAR_FILLS))
  const context = { left, top, bleed: resolution * BLEED, output, totals, cover: coverOf(right - left, bottom - top) }
  const markup = markupOf(joined.flatMap(layer => entriesOf(layer, context)), context)
  const defs = output.defs(left, top)
  return { width: right - left, height: bottom - top, markup: (defs ? `<defs>${defs}</defs>` : "") + markup }
}

function svgOf(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg"${content.includes("xlink:href") ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ""} width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`
}

function titleGroup(title, x, y, scale) {
  const ratio = Math.round(scale * 1e6) / 1e6
  return x || y || ratio !== 1 ? `<g transform="translate(${number(x)} ${number(y)}) scale(${ratio})">${title.markup}</g>` : title.markup
}

function backgroundOf({ line: [from, to], stops }, width, height) {
  const offsets = stops.map(stop => `<stop offset="${stop.position}" stop-color="${stop.colour}"/>`).join("")
  return `<defs><linearGradient id="background" gradientUnits="userSpaceOnUse" x1="${number(from[0])}" y1="${number(from[1])}" x2="${number(to[0])}" y2="${number(to[1])}">${offsets}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#background)"/>`
}

export function composeVector(title, settings) {
  const { width, height, ratio, x, y, background } = placement(title, settings)
  return svgOf(width, height, (background ? backgroundOf(background, width, height) : "") + titleGroup(title, x, y, ratio))
}
