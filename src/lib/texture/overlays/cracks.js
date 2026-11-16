import { joinedMask } from "../../geometry/joins.js"
import { clamp } from "../../core/maths.js"
import { hashed, random } from "./random.js"
import { settingsOf } from "./settings.js"

const CRACK_SPACING = 1800
const CRACK_BLEND = 0.5
const CRACK_CORNER = 2
const CRACK_EDGE_GAP = 0.5
const CRACK_TIP_GAP = 0.99
const CRACK_SHRINK = 0.3
const CRACK_SHRINK_STEPS = 6
const CRACK_GAP = 2
const CRACK_VARIETY = 0.6
const CRACK_SCATTER = 0.4
const CRACK_OPPOSITE = 6
const CRACK_STEEP_REACH = 2
const CRACK_SIDES = ["up", "down", "left", "right"]

function solidOf({ width, height, mask }) {
  return (column, row) => column >= 0 && row >= 0 && column < width && row < height && mask[(height - 1 - row) * width + column] === 1
}

function joinedSolid(glyph) {
  const joined = joinedMask(glyph, 1)
  if (!joined) return solidOf(glyph)
  const solid = solidOf(joined)
  return (column, row) => solid(column + 1, row + 1)
}

function crackEdges(glyph) {
  const { width, height } = glyph
  const solid = solidOf(glyph)
  const filled = joinedSolid(glyph)
  const edges = []
  function runs(side, lines, length, open) {
    for (let line = 0; line <= lines; line++) {
      let start = null
      for (let at = 0; at <= length; at++) {
        const here = at < length && open(line, at)
        if (here && start === null) start = at
        if (here || start === null) continue
        edges.push({ side, line, from: start, to: at })
        start = null
      }
    }
  }
  runs("up", height, width, (line, column) => solid(column, line) && !filled(column, line - 1))
  runs("down", height, width, (line, column) => solid(column, line - 1) && !filled(column, line))
  runs("left", width, height, (line, row) => solid(line, row) && !filled(line - 1, row))
  runs("right", width, height, (line, row) => solid(line - 1, row) && !filled(line, row))
  return edges
}

function crackMiddle({ side, line, from, to }) {
  return side === "up" || side === "down" ? [(from + to) / 2, line] : [line, (from + to) / 2]
}

function spreadOrder(cracks, next) {
  const left = cracks.map(crack => ({ crack, at: crackMiddle(crack), gap: Infinity, luck: 0 }))
  const order = []
  while (left.length) {
    for (const item of left) item.luck = CRACK_SCATTER + (1 - CRACK_SCATTER) * next()
    const best = order.length ? left.reduce((a, b) => b.gap * b.luck > a.gap * a.luck ? b : a) : left[Math.floor(next() * left.length)]
    left.splice(left.indexOf(best), 1)
    order.push(best.crack)
    for (const item of left) item.gap = Math.min(item.gap, Math.hypot(item.at[0] - best.at[0], item.at[1] - best.at[1]))
  }
  return order
}

const crackOrders = new WeakMap()

function orderedCracks(glyph, settings) {
  const key = [settings.seed, settings.width, settings.length].join()
  if (!crackOrders.has(glyph)) crackOrders.set(glyph, new Map())
  const known = crackOrders.get(glyph)
  if (!known.has(key)) {
    const order = spreadOrder(crackCandidates(glyph, settings), random(hashed(settings.seed, Math.round(glyph.placedX ?? 0))))
    known.set(key, order.map((crack, index) => ({ ...crack, priority: index / order.length })))
  }
  return known.get(key)
}

function repeated(crack, glyph, settings) {
  if (!crack.wall) return false
  return [glyph.previous, glyph.next].some((neighbour, index) => neighbour && orderedCracks(neighbour, settings).some(other => other.wall === crack.wall && (other.priority < crack.priority || other.priority === crack.priority && index === 0) && other.from < crack.to + CRACK_OPPOSITE && crack.from < other.to + CRACK_OPPOSITE))
}

function crackCandidates(glyph, settings) {
  const gap = CRACK_SPACING / 100
  const vary = CRACK_VARIETY
  const list = []
  const edges = crackEdges(glyph)
  const lines = side => edges.filter(edge => edge.side === side).map(edge => edge.line)
  const outer = { up: Math.min(...lines("up")), down: Math.max(...lines("down")), left: Math.min(...lines("left")), right: Math.max(...lines("right")) }
  for (const { side, line, from, to } of edges) {
    const wall = line !== outer[side] ? null : side === "left" || side === "right" ? "side" : side
    const next = random(hashed(settings.seed, Math.round(glyph.placedX ?? 0), CRACK_SIDES.indexOf(side), line, from))
    for (let at = from + gap * next(); at < to; at += gap * (1 + vary * (next() - 0.5))) {
      const width = settings.width * (1 + vary * (next() - 0.5))
      const length = settings.length * (1 + vary * (next() - 0.5))
      const lean = () => at + width * vary * (next() * 2 - 1)
      const crack = { side, line, from: at - width / 2, to: at + width / 2, tip: lean(), length, wrapTip: lean(), wrapLength: length * (0.5 + 0.5 * next()), edge: [from, to], wall }
      if (at >= from + CRACK_CORNER * 2 && at <= to - CRACK_CORNER * 2) list.push(crack)
    }
  }
  return list
}

function contained([first, second, tip], solid) {
  const steps = Math.max(4, Math.ceil(Math.hypot(tip[0] - first[0], tip[1] - first[1]) * 2))
  for (let part = 0; part <= 4; part++) {
    const from = [first[0] + (second[0] - first[0]) * part / 4, first[1] + (second[1] - first[1]) * part / 4]
    for (let step = 1; step <= steps; step++) {
      if (!solid(Math.floor(from[0] + (tip[0] - from[0]) * step / steps), Math.floor(from[1] + (tip[1] - from[1]) * step / steps))) return false
    }
  }
  return true
}

function apart(a, b) {
  for (const [shape, other] of [[a, b], [b, a]]) {
    for (let index = 0; index < 3; index++) {
      const [x0, y0] = shape[index]
      const [x1, y1] = shape[(index + 1) % 3]
      const across = point => (point[0] - x0) * (y1 - y0) - (point[1] - y0) * (x1 - x0)
      const own = across(shape[(index + 2) % 3])
      if (other.every(point => across(point) * own <= 0)) return true
    }
  }
  return false
}

function wrapReach({ side, wrapLength }) {
  return side === "up" ? wrapLength : wrapLength * CRACK_STEEP_REACH
}

function wrapTriangle(crack) {
  return [[crack.from, 0], [crack.to, 0], [crack.wrapTip, wrapReach(crack)]]
}

function pointGap([ax, ay], [bx, by], [px, py]) {
  const dx = bx - ax
  const dy = by - ay
  const along = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return Math.hypot(ax + dx * along - px, ay + dy * along - py)
}

function near(a, b) {
  if (!apart(a, b)) return true
  return [[a, b], [b, a]].some(([shape, other]) => shape.some((corner, index) => other.some(point => pointGap(corner, shape[(index + 1) % 3], point) < CRACK_GAP)))
}

function opposite(a, b) {
  const [first, second] = CRACK_SIDES.indexOf(a.side) < CRACK_SIDES.indexOf(b.side) ? [a, b] : [b, a]
  const facing = first.side === "up" && second.side === "down" || first.side === "left" && second.side === "right"
  return facing && first.from < second.to + CRACK_OPPOSITE && second.from < first.to + CRACK_OPPOSITE
}

function crossing(a, b) {
  return opposite(a, b) || near(crackTriangle(a), crackTriangle(b)) || a.side === b.side && a.line === b.line && near(wrapTriangle(a), wrapTriangle(b))
}

function roomy(crack, solid) {
  const [, , [x, y]] = crackTriangle(crack)
  const facing = { up: Math.PI / 2, down: -Math.PI / 2, left: 0, right: Math.PI }[crack.side]
  for (let turn = -1; turn <= 1; turn++) {
    const angle = facing + turn * Math.PI / 4
    if (!solid(Math.floor(x + CRACK_TIP_GAP * Math.cos(angle)), Math.floor(y + CRACK_TIP_GAP * Math.sin(angle)))) return false
  }
  return true
}

function fittedCrack(crack, solid) {
  if (crack.from < crack.edge[0] + CRACK_EDGE_GAP || crack.to > crack.edge[1] - CRACK_EDGE_GAP) return null
  for (let step = 0; step <= CRACK_SHRINK_STEPS; step++) {
    const shorter = { ...crack, length: crack.length * (1 - CRACK_SHRINK * step / CRACK_SHRINK_STEPS) }
    if (contained(crackTriangle(shorter), solid) && roomy(shorter, solid)) return shorter
  }
  return null
}

export function crackList(glyph, layer) {
  const solid = solidOf(glyph)
  const settings = settingsOf("cracks", layer)
  const ordered = orderedCracks(glyph, settings)
  const chosen = ordered.slice(0, Math.round(ordered.length * settings.amount / 100))
  const fitted = chosen.map(crack => fittedCrack(crack, solid))
  const shown = []
  for (const [index, crack] of fitted.entries()) {
    if (crack && !fitted.slice(0, index).some((other, at) => crossing(crack, other ?? chosen[at])) && !repeated(crack, glyph, settings)) shown.push(crack)
  }
  return shown
}

function fillTriangle(out, columns, rows, points, scale, soft) {
  const [[ax, ay], [bx, by], [cx, cy]] = points.map(point => point.map(value => value * scale))
  const turn = Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
  if (!turn) return
  const inside = (x0, y0, x1, y1, x, y) => ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) * turn / Math.hypot(x1 - x0, y1 - y0)
  for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1); y < Math.min(rows, Math.ceil(Math.max(ay, by, cy)) + 1); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1); x < Math.min(columns, Math.ceil(Math.max(ax, bx, cx)) + 1); x++) {
      const depth = Math.min(inside(ax, ay, bx, by, x + 0.5, y + 0.5), inside(bx, by, cx, cy, x + 0.5, y + 0.5), inside(cx, cy, ax, ay, x + 0.5, y + 0.5))
      const cover = soft ? clamp(depth / CRACK_BLEND + 0.5, 0, 1) : depth >= 0 ? 1 : 0
      if (cover > out[y * columns + x]) out[y * columns + x] = cover
    }
  }
}

export function crackTriangle({ side, line, from, to, tip, length }) {
  const deep = line + (side === "up" || side === "left" ? length : -length)
  return side === "up" || side === "down" ? [[from, line], [to, line], [tip, deep]] : [[line, from], [line, to], [deep, tip]]
}

export function crackFaces(glyph, layer, scale, fine, soft) {
  const { width, height, mask } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  for (const crack of crackList(glyph, layer)) fillTriangle(out, columns, rows, crackTriangle(crack), scale, soft)
  for (let sy = 0; sy < rows; sy++) {
    const row = height - 1 - Math.floor(sy / scale)
    for (let sx = 0; sx < columns; sx++) {
      if (fine ? !fine[(rows - 1 - sy) * columns + sx] : !mask[row * width + Math.floor(sx / scale)]) out[sy * columns + sx] = 0
    }
  }
  return out
}

export function wrapTriangles(glyph, layer, side, line, from, width, height) {
  const turned = side === "left" || side === "right"
  const [along, depth] = turned ? [height, width] : [width, height]
  const front = side === "down" ? 0 : depth
  return crackList(glyph, layer).filter(crack => crack.side === side && crack.line === line && crack.to > from && crack.from < from + along).map(crack => {
    const reach = Math.min(wrapReach(crack), depth)
    const tip = side === "down" ? reach : depth - reach
    return turned ? [[front, crack.from - from], [front, crack.to - from], [tip, crack.wrapTip - from]] : [[crack.from - from, front], [crack.to - from, front], [crack.wrapTip - from, tip]]
  })
}

export function crackWrap(glyph, layer, side, line, from, width, height, scale, soft = false) {
  const triangles = wrapTriangles(glyph, layer, side, line, from, width, height)
  if (!triangles.length) return null
  const columns = width * scale
  const out = new Float32Array(columns * height * scale)
  for (const points of triangles) fillTriangle(out, columns, height * scale, points, scale, soft)
  return out
}
