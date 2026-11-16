import { hexOfPacked } from "../../lib/core/colour.js"
import { clamp } from "../../lib/core/maths.js"
import { brightness, colourAlong, mixed, simplifyStops, within } from "./colours.js"
import { EPSILON, split, worldMap } from "./faces.js"

const GRADIENT_AGREE = 3
const NEARLY_FLAT = 2
const GRADIENT_MATCH = 0.1

export function fitGradient(face, rect, model, project, limits) {
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

export function middleOf(list) {
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
  return colourAlong(points, points.findIndex(point => point.t >= t), t)
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

export class Output {
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
      flattened.set(`url(#${entry.id})`, hexOfPacked(flat))
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
      const stops = gradient.stops.map(([offset, colour]) => `<stop offset="${offsetOf(offset)}" stop-color="${hexOfPacked(colour)}"/>`).join("")
      if (owners.has(stops)) return `<linearGradient id="${id}" xlink:href="#${owners.get(stops)}" ${line}/>`
      owners.set(stops, id)
      return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${line}>${stops}</linearGradient>`
    }).join("")
  }
}

export function halved(model, rect) {
  const acrossX = Math.abs(model.axis[1]) >= Math.abs(model.axis[0])
  const middle = acrossX ? Math.round((rect.left + rect.right) / 2) : Math.round((rect.top + rect.bottom) / 2)
  return { acrossX, middle, low: acrossX ? { ...rect, right: middle } : { ...rect, bottom: middle }, high: acrossX ? { ...rect, left: middle } : { ...rect, top: middle }, size: acrossX ? rect.right - rect.left : rect.bottom - rect.top }
}

export function bandRuns(stops) {
  const runs = []
  for (const stop of stops) {
    if (runs.at(-1)?.colour === stop.colour) continue
    if (runs.length) runs.at(-1).to = stop.t
    runs.push({ colour: stop.colour, from: runs.length ? stop.t : -Infinity, to: Infinity })
  }
  return runs
}

export function bandPlane(face, [ax, ay]) {
  const toWorld = worldMap(face)
  const origin = toWorld(0, 0)
  const u = toWorld(1, 0).sub(origin)
  const v = toWorld(0, 1).sub(origin)
  const along = u.clone().multiplyScalar(ax).addScaledVector(v, ay)
  const across = u.clone().multiplyScalar(-ay).addScaledVector(v, ax)
  const normal = along.addScaledVector(across, -along.dot(across) / across.dot(across)).normalize()
  return { normal, at: t => normal.dot(toWorld(ax * t, ay * t)) }
}

export function clippedToBand(polygons, { normal, at }, from, to) {
  return polygons.flatMap(polygon => {
    const above = from === -Infinity ? polygon : split(polygon, normal, at(from))[0]
    const inside = above && to !== Infinity ? split(above, normal, at(to))[1] : above
    return inside ? [inside] : []
  })
}
