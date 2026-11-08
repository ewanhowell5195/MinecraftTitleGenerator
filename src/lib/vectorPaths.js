import { clamp } from "./maths.js"

const MIN_SHARED = 0.05
const SHARED_ANGLE = 0.01
const SHARED_OFFSET = 0.1
const FLIP = 1e-4
const WELD = 1
const COVER_SIDE = 4096
const PATH_STEP = 10
const UNION_BAND = 1024
const UNION_SIDE = 0.25
const UNION_SNAP = 8
const UNION_SLIVER = 400
const COVER_LOOKAHEAD = 16
const OVERLAP_MARGIN = 0.005

export function signedArea(polygon) {
  return polygon.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length]
    return sum + x * nextY - nextX * y
  }, 0) / 2
}

export function area(polygon) {
  return Math.abs(signedArea(polygon))
}

export function sameWinding(polygon) {
  return signedArea(polygon) < 0 ? polygon.toReversed() : polygon
}

export function sharedEdges(list) {
  const buckets = new Map()
  const edges = []
  const keyOf = (angle, offset) => `${angle},${offset}`
  for (const [fill, polygons] of list) {
    for (const polygon of polygons) {
      for (const [index, from] of polygon.entries()) {
        const to = polygon[(index + 1) % polygon.length]
        const length = Math.hypot(to[0] - from[0], to[1] - from[1])
        if (length < MIN_SHARED) continue
        let dx = (to[0] - from[0]) / length
        let dy = (to[1] - from[1]) / length
        if (dx < -FLIP || Math.abs(dx) <= FLIP && dy < 0) {
          dx = -dx
          dy = -dy
        }
        const offset = dy * from[0] - dx * from[1]
        const edge = { fill, polygon, from, dx, dy, offset, start: dx * from[0] + dy * from[1], end: dx * to[0] + dy * to[1], id: edges.length, angleBucket: Math.round(Math.atan2(dy, dx) / SHARED_ANGLE), offsetBucket: Math.round(offset / SHARED_OFFSET) }
        if (edge.start > edge.end) [edge.start, edge.end] = [edge.end, edge.start]
        edges.push(edge)
        const key = keyOf(edge.angleBucket, edge.offsetBucket)
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(edge)
      }
    }
  }
  const shared = new Map()
  for (const edge of edges) {
    const { angleBucket: angle, offsetBucket: offset } = edge
    for (const nearAngle of [angle - 1, angle, angle + 1]) {
      for (const nearOffset of [offset - 1, offset, offset + 1]) {
        for (const other of buckets.get(keyOf(nearAngle, nearOffset)) ?? []) {
          if (other.id <= edge.id || other.polygon === edge.polygon || Math.abs(other.offset - edge.offset) > SHARED_OFFSET) continue
          const start = Math.max(edge.start, other.start)
          const end = Math.min(edge.end, other.end)
          if (end - start < MIN_SHARED) continue
          addTo(shared, edge.fill, [[[edge.dx * start + edge.dy * edge.offset, edge.dy * start - edge.dx * edge.offset], [edge.dx * end + edge.dy * edge.offset, edge.dy * end - edge.dx * edge.offset]]])
        }
      }
    }
  }
  return shared
}

export function number(value) {
  return String(Math.round(value * 100) / 100)
}

function short(value) {
  return String(value / 100).replace(/^(-?)0\./, "$1.")
}

function pair(x, y) {
  return joined([short(x), short(y)])
}

function hundredths(value) {
  return Math.round(value * 100)
}

function joined(numbers) {
  let text = ""
  for (const value of numbers) {
    const needsGap = text && !value.startsWith("-") && !(value.startsWith(".") && /\.\d*$/.test(text))
    text += needsGap ? ` ${value}` : value
  }
  return text
}

function snapped(loops) {
  return loops.map(loop => {
    const points = loop.map(([x, y]) => [Math.round(x / PATH_STEP) * PATH_STEP, Math.round(y / PATH_STEP) * PATH_STEP])
    return points.filter(([x, y], index) => x !== points.at(index - 1)[0] || y !== points.at(index - 1)[1])
  }).filter(loop => loop.length > 2)
}

function closedByLongestEdge(loop) {
  const lengths = loop.map((point, index) => short(point[0] - loop.at(index - 1)[0]).length + short(point[1] - loop.at(index - 1)[1]).length)
  const start = lengths.reduce((best, length, index) => length > lengths[best] ? index : best, 0)
  return loop.slice(start).concat(loop.slice(0, start))
}

function nearestFirst(loops) {
  const left = loops.slice()
  const ordered = []
  let at = [0, 0]
  while (left.length) {
    let best = 0
    let closest = Infinity
    for (const [index, [[x, y]]] of left.entries()) {
      const distance = Math.abs(x - at[0]) + Math.abs(y - at[1])
      if (distance >= closest) continue
      closest = distance
      best = index
    }
    const [loop] = left.splice(best, 1)
    ordered.push(loop)
    at = loop[0]
  }
  return ordered
}

function stepsOf(loop) {
  const runs = []
  for (const [index, [x, y]] of loop.slice(1).entries()) {
    const dx = x - loop[index][0]
    const dy = y - loop[index][1]
    const command = dy === 0 ? "h" : dx === 0 ? "v" : "l"
    const values = command === "h" ? [dx] : command === "v" ? [dy] : [dx, dy]
    if (runs.at(-1)?.command === command) runs.at(-1).values.push(...values)
    else runs.push({ command, values })
  }
  return runs.map(({ command, values }) => command + joined(values.map(short))).join("")
}

export function writePath(loops) {
  let path = ""
  let fromX = 0
  let fromY = 0
  for (const loop of nearestFirst(snapped(loops).map(closedByLongestEdge))) {
    const [startX, startY] = loop[0]
    path += path ? `m${pair(startX - fromX, startY - fromY)}` : `M${pair(startX, startY)}`
    fromX = startX
    fromY = startY
    path += `${stepsOf(loop)}z`
  }
  return path
}

export function loopsInHundredths(polygons, left, top) {
  return polygons.map(polygon => polygon.map(([x, y]) => [hundredths(x - left), hundredths(y - top)]))
}

function welded(loops) {
  const known = new Map()
  const keyOf = (x, y) => x * 4294967296 + y
  return loops.map(loop => loop.map(([x, y]) => {
    for (let dx = -WELD; dx <= WELD; dx++) {
      for (let dy = -WELD; dy <= WELD; dy++) {
        const found = known.get(keyOf(x + dx, y + dy))
        if (found) return found
      }
    }
    const point = [x, y]
    known.set(keyOf(x, y), point)
    return point
  }))
}

function splitAtPoints(from, to, points) {
  const [ax, ay] = from
  const dx = to[0] - ax
  const dy = to[1] - ay
  const lengthSq = dx * dx + dy * dy
  if (!lengthSq) return []
  const low = Math.min(ax, to[0]) - WELD
  const high = Math.max(ax, to[0]) + WELD
  let at = 0
  let end = points.length
  while (at < end) {
    const middle = (at + end) >> 1
    if (points[middle][0] < low) at = middle + 1
    else end = middle
  }
  const between = []
  for (; at < points.length && points[at][0] <= high; at++) {
    const point = points[at]
    if (point === from || point === to) continue
    const along = (point[0] - ax) * dx + (point[1] - ay) * dy
    if (along <= 0 || along >= lengthSq) continue
    const off = (point[0] - ax) * dy - (point[1] - ay) * dx
    if (off * off <= WELD * WELD * lengthSq) between.push({ point, along })
  }
  between.sort((a, b) => a.along - b.along)
  const chain = [from].concat(between.map(item => item.point), [to])
  return chain.slice(1).map((point, index) => [chain[index], point])
}

function withoutCollinear(loop) {
  const kept = []
  for (const [index, point] of loop.entries()) {
    const before = kept.at(-1) ?? loop.at(-1)
    const after = loop[(index + 1) % loop.length]
    const dx = after[0] - before[0]
    const dy = after[1] - before[1]
    const off = (point[0] - before[0]) * dy - (point[1] - before[1]) * dx
    const ahead = (point[0] - before[0]) * dx + (point[1] - before[1]) * dy
    if (off * off > WELD * WELD * (dx * dx + dy * dy) || ahead <= 0 || ahead >= dx * dx + dy * dy) kept.push(point)
  }
  return kept
}

export function stitched(loops) {
  const clean = welded(loops)
  const sorted = Array.from(new Set(clean.flat())).sort((a, b) => a[0] - b[0])
  const edges = new Map()
  for (const loop of clean) {
    for (const [index, from] of loop.entries()) {
      for (const [a, b] of splitAtPoints(from, loop[(index + 1) % loop.length], sorted)) {
        if (!edges.has(a)) edges.set(a, [])
        edges.get(a).push(b)
      }
    }
  }
  for (const [from, list] of edges) {
    for (let index = list.length - 1; index >= 0; index--) {
      const back = edges.get(list[index])
      const reverse = back ? back.indexOf(from) : -1
      if (reverse < 0) continue
      back.splice(reverse, 1)
      list.splice(index, 1)
    }
  }
  const result = []
  for (const [start, list] of edges) {
    while (list.length) {
      const loop = [start]
      let at = list.pop()
      while (at !== start) {
        loop.push(at)
        at = edges.get(at).pop()
      }
      const simple = withoutCollinear(loop)
      if (simple.length > 2) result.push(simple)
    }
  }
  return result
}

export function addInOrder(list, fill, polygons) {
  if (!polygons.length) return
  if (list.at(-1)?.[0] === fill) list.at(-1)[1].push(...polygons)
  else list.push([fill, polygons])
}

export function addTo(groups, fill, polygons) {
  if (!groups.has(fill)) groups.set(fill, [])
  const list = groups.get(fill)
  for (const polygon of polygons) list.push(polygon)
}

export function boxOfPolygons(polygons) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      box.minX = Math.min(box.minX, x)
      box.minY = Math.min(box.minY, y)
      box.maxX = Math.max(box.maxX, x)
      box.maxY = Math.max(box.maxY, y)
    }
  }
  return box
}

export function boxesOverlap(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

function hullOf(polygon) {
  const points = polygon.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  function half(list) {
    const chain = []
    for (const point of list) {
      while (chain.length > 1 && turn(chain.at(-2), chain.at(-1), point) <= 0) chain.pop()
      chain.push(point)
    }
    return chain.slice(0, -1)
  }
  return half(points).concat(half(points.slice().reverse()))
}

function separatedBy(first, second) {
  for (const [index, [ax, ay]] of first.entries()) {
    const [bx, by] = first[(index + 1) % first.length]
    const length = Math.hypot(bx - ax, by - ay) || 1
    const clear = second.every(([x, y]) => ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / length <= OVERLAP_MARGIN)
    if (clear) return true
  }
  return false
}

function hullsOverlap(a, b) {
  return !separatedBy(a, b) && !separatedBy(b, a)
}

export function shapesOverlap(a, b) {
  return boxesOverlap(a.box, b.box) && a.parts.some(first => boxesOverlap(first.box, b.box) && b.parts.some(second => boxesOverlap(first.box, second.box) && hullsOverlap(first.hull, second.hull)))
}

export function shapeOfPolygons(polygons) {
  return { box: boxOfPolygons(polygons), parts: polygons.map(polygon => ({ hull: hullOf(polygon), box: boxOfPolygons([polygon]) })) }
}

export function mergedByFill(entries, totals = new Map()) {
  const shapes = entries.map(entry => shapeOfPolygons(entry[1]))
  const waiting = entries.map(() => 0)
  const followers = entries.map(() => [])
  for (const [later, [fill]] of entries.entries()) {
    for (let earlier = 0; earlier < later; earlier++) {
      if (entries[earlier][0] === fill || !shapesOverlap(shapes[earlier], shapes[later])) continue
      waiting[later]++
      followers[earlier].push(later)
    }
  }
  const remaining = new Map()
  const ready = new Map()
  for (const [at, [fill]] of entries.entries()) {
    remaining.set(fill, (remaining.get(fill) ?? 0) + 1)
    if (!waiting[at]) addTo(ready, fill, [at])
  }
  const merged = []
  function rank(fill) {
    return [ready.get(fill).length / remaining.get(fill), totals.get(fill) || Infinity]
  }
  while (ready.size) {
    const fill = Array.from(ready.keys()).reduce((best, other) => {
      const [share, total] = rank(other)
      const [bestShare, bestTotal] = rank(best)
      return share > bestShare || share === bestShare && total > bestTotal ? other : best
    })
    const polygons = []
    while (ready.get(fill)?.length) {
      const list = ready.get(fill)
      ready.delete(fill)
      for (const at of list) {
        polygons.push(...entries[at][1])
        remaining.set(fill, remaining.get(fill) - 1)
        for (const follower of followers[at]) {
          if (!--waiting[follower]) addTo(ready, entries[follower][0], [follower])
        }
      }
    }
    merged.push([fill, polygons])
  }
  return merged
}

export function linesOf(segments, left, top) {
  let path = ""
  let lastX = null
  let lastY = null
  for (const [from, to] of segments) {
    const startX = hundredths(from[0] - left)
    const startY = hundredths(from[1] - top)
    const endX = hundredths(to[0] - left)
    const endY = hundredths(to[1] - top)
    if (startX !== lastX || startY !== lastY) path += lastX === null ? `M${pair(startX, startY)}` : `m${pair(startX - lastX, startY - lastY)}`
    path += `l${pair(endX - startX, endY - startY)}`
    lastX = endX
    lastY = endY
  }
  return path
}

function cutsBetween(a, b, c, d) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const vx = d[0] - c[0]
  const vy = d[1] - c[1]
  const across = ux * vy - uy * vx
  const wx = c[0] - a[0]
  const wy = c[1] - a[1]
  if (across) {
    const t = (wx * vy - wy * vx) / across
    const s = (wx * uy - wy * ux) / across
    if (t < 0 || t > 1 || s < 0 || s > 1) return [[], []]
    const point = [Math.round(a[0] + t * ux), Math.round(a[1] + t * uy)]
    return [t > 0 && t < 1 ? [point] : [], s > 0 && s < 1 ? [point] : []]
  }
  if (wx * uy !== wy * ux) return [[], []]
  const along = ([x, y], [ox, oy], dx, dy) => ((x - ox) * dx + (y - oy) * dy) / (dx * dx + dy * dy)
  const between = (point, start, dx, dy) => along(point, start, dx, dy) > 0 && along(point, start, dx, dy) < 1
  return [[c, d].filter(point => between(point, a, ux, uy)), [a, b].filter(point => between(point, c, vx, vy))]
}

function pointKey([x, y]) {
  return `${x},${y}`
}

function cutAtCrossings(edges) {
  const byLeft = edges.map(edge => ({ edge, left: Math.min(edge.a[0], edge.b[0]), right: Math.max(edge.a[0], edge.b[0]), top: Math.min(edge.a[1], edge.b[1]), bottom: Math.max(edge.a[1], edge.b[1]) })).sort((p, q) => p.left - q.left)
  let cut = false
  let active = []
  for (const item of byLeft) {
    active = active.filter(other => other.right >= item.left)
    for (const other of active) {
      if (other.top > item.bottom || other.bottom < item.top) continue
      const [mine, theirs] = cutsBetween(item.edge.a, item.edge.b, other.edge.a, other.edge.b)
      if (mine.length || theirs.length) cut = true
      item.edge.cuts.push(...mine)
      other.edge.cuts.push(...theirs)
    }
    active.push(item)
  }
  return cut
}

function fillTester(edges) {
  const bands = new Map()
  for (const { a, b } of edges) {
    for (let band = Math.floor(Math.min(a[1], b[1]) / UNION_BAND); band <= Math.floor(Math.max(a[1], b[1]) / UNION_BAND); band++) {
      if (!bands.has(band)) bands.set(band, [])
      bands.get(band).push([a, b])
    }
  }
  return (x, y) => {
    let winding = 0
    for (const [[ax, ay], [bx, by]] of bands.get(Math.floor(y / UNION_BAND)) ?? []) {
      if (ay > y !== by > y && x < ax + (y - ay) / (by - ay) * (bx - ax)) winding += by > ay ? 1 : -1
    }
    return winding !== 0
  }
}

function boundaryPieces(edges) {
  const filled = fillTester(edges)
  const kept = new Map()
  for (const { a, b, cuts } of edges) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    const ordered = [a].concat(cuts.slice().sort((p, q) => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy - (q[0] - a[0]) * dx - (q[1] - a[1]) * dy), [b])
    for (const [index, from] of ordered.slice(0, -1).entries()) {
      const to = ordered[index + 1]
      if (from[0] === to[0] && from[1] === to[1]) continue
      const midX = (from[0] + to[0]) / 2
      const midY = (from[1] + to[1]) / 2
      const offX = -dy / length * UNION_SIDE
      const offY = dx / length * UNION_SIDE
      const inner = filled(midX + offX, midY + offY)
      if (inner === filled(midX - offX, midY - offY)) continue
      const [start, end] = inner ? [from, to] : [to, from]
      kept.set(`${pointKey(start)},${pointKey(end)}`, [start, end])
    }
  }
  return Array.from(kept.values())
}

function followsEdges(edges, from, to) {
  function nearEdges(x, y) {
    return edges.some(({ a, b }) => {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
      return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) <= UNION_SNAP
    })
  }
  return [0.25, 0.5, 0.75].every(t => nearEdges(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t))
}

export function unionOf(loops) {
  const edges = loops.flatMap(loop => loop.map((point, index) => ({ a: point, b: loop[(index + 1) % loop.length], cuts: [] }))).filter(({ a, b }) => a[0] !== b[0] || a[1] !== b[1])
  if (!cutAtCrossings(edges) && loops.length < 2) return loops.map(sameWinding)
  const outgoing = new Map()
  const balance = new Map()
  function link(start, end) {
    const key = pointKey(start)
    if (!outgoing.has(key)) outgoing.set(key, [])
    outgoing.get(key).push(end)
    balance.set(key, (balance.get(key) ?? 0) + 1)
    balance.set(pointKey(end), (balance.get(pointKey(end)) ?? 0) - 1)
  }
  for (const [start, end] of boundaryPieces(edges)) link(start, end)
  const loose = Array.from(balance).filter(([, count]) => count).map(([key, count]) => ({ point: key.split(",").map(Number), count }))
  for (const open of loose.filter(({ count }) => count < 0)) {
    while (open.count < 0) {
      let nearest = null
      for (const other of loose) {
        if (other.count > 0 && (!nearest || Math.hypot(other.point[0] - open.point[0], other.point[1] - open.point[1]) < Math.hypot(nearest.point[0] - open.point[0], nearest.point[1] - open.point[1]))) nearest = other
      }
      if (!nearest || !followsEdges(edges, open.point, nearest.point)) return loops
      link(open.point, nearest.point)
      open.count++
      nearest.count--
    }
  }
  const result = []
  for (const [key, ends] of outgoing) {
    while (ends.length) {
      const loop = []
      let at = key
      do {
        const [x, y] = at.split(",").map(Number)
        loop.push([x, y])
        at = pointKey(outgoing.get(at).pop())
      } while (at !== key)
      result.push(withoutCollinear(loop))
    }
  }
  return result.filter(loop => loop.length >= 3 && area(loop) >= UNION_SLIVER)
}

export function coverOf(width, height) {
  const cell = Math.max(width, height, 1) * 100 / COVER_SIDE
  const columns = Math.ceil(width * 100 / cell) + 1
  const rows = Math.ceil(height * 100 / cell) + 1
  return { cell, columns, rows, cells: new Uint8Array(columns * rows) }
}

function everySpanInside({ cell, columns, rows }, polygons, check) {
  const edges = []
  for (const polygon of polygons) {
    for (const [index, [ax, ay]] of polygon.entries()) {
      const [bx, by] = polygon[(index + 1) % polygon.length]
      if (ay !== by) edges.push({ ax, ay, bx, by, low: Math.min(ay, by), high: Math.max(ay, by) })
    }
  }
  if (!edges.length) return true
  edges.sort((a, b) => a.low - b.low)
  const highest = edges.reduce((most, edge) => Math.max(most, edge.high), -Infinity)
  let active = []
  let next = 0
  for (let row = Math.max(0, Math.floor(edges[0].low / cell)); row <= Math.min(rows - 1, Math.ceil(highest / cell)); row++) {
    const y = (row + 0.5) * cell
    while (next < edges.length && edges[next].low <= y) active.push(edges[next++])
    active = active.filter(edge => edge.high > y)
    const crossings = active.map(({ ax, ay, bx, by }) => ({ x: ax + (y - ay) / (by - ay) * (bx - ax), winding: by > ay ? 1 : -1 })).sort((a, b) => a.x - b.x)
    let winding = 0
    for (const [index, crossing] of crossings.entries()) {
      winding += crossing.winding
      if (!winding || index === crossings.length - 1) continue
      if (!check(row, Math.max(0, Math.ceil(crossing.x / cell - 0.5)), Math.min(columns - 1, Math.ceil(crossings[index + 1].x / cell - 0.5) - 1))) return false
    }
  }
  return true
}

function everyCellInside(cover, polygons, check) {
  return everySpanInside(cover, polygons, (row, first, last) => {
    for (let column = first; column <= last; column++) {
      if (!check(column, row)) return false
    }
    return true
  })
}

export function addToCover(cover, loops) {
  const { columns, cells } = cover
  everySpanInside(cover, loops, (row, first, last) => {
    if (first <= last) cells.fill(1, row * columns + first, row * columns + last + 1)
    return true
  })
}

export function visibleLoops(loops, cover) {
  const { cell, columns, rows, cells } = cover
  function coveredCell(column, row) {
    if (column < 1 || row < 1 || column >= columns - 1 || row >= rows - 1) return false
    for (let y = row - 1; y <= row + 1; y++) {
      for (let x = column - 1; x <= column + 1; x++) {
        if (!cells[y * columns + x]) return false
      }
    }
    return true
  }
  function coveredPoint(x, y) {
    const column = Math.floor(x / cell)
    const row = Math.floor(y / cell)
    return column >= 0 && row >= 0 && column < columns && row < rows && coveredCell(column, row)
  }
  function coveredLine([ax, ay], [bx, by]) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 2)) || 1
    for (let step = 0; step <= steps; step++) {
      if (!coveredPoint(ax + (bx - ax) * step / steps, ay + (by - ay) * step / steps)) return false
    }
    return true
  }
  function simplifiedRun(run) {
    const kept = [run[0]]
    let from = 0
    while (from < run.length - 1) {
      let best = from + 1
      let misses = 0
      for (let to = from + 2; to < run.length && misses < COVER_LOOKAHEAD; to++) {
        if (coveredLine(run[from], run[to]) && everyCellInside(cover, [run.slice(from, to + 1)], coveredCell)) {
          best = to
          misses = 0
        } else misses++
      }
      kept.push(run[best])
      from = best
    }
    return kept
  }
  const result = []
  for (const loop of loops) {
    if (signedArea(loop) < 0 && everyCellInside(cover, [loop], (column, row) => cells[row * columns + column] === 1)) continue
    const size = loop.length
    const hidden = loop.map((point, index) => coveredLine(point, loop[(index + 1) % size]))
    if (!hidden.includes(true)) {
      result.push(loop)
      continue
    }
    if (!hidden.includes(false)) {
      if (everyCellInside(cover, [loop], coveredCell)) continue
      const closed = simplifiedRun(loop.concat([loop[0]])).slice(0, -1)
      result.push(closed.length >= 3 ? closed : loop)
      continue
    }
    const start = hidden.findIndex((value, index) => value && !hidden[(index + size - 1) % size])
    const simplified = []
    let index = 0
    while (index < size) {
      const at = (start + index) % size
      if (!hidden[at]) {
        simplified.push(loop[at])
        index++
        continue
      }
      const run = [loop[at]]
      while (index < size && hidden[(start + index) % size]) {
        index++
        run.push(loop[(start + index) % size])
      }
      simplified.push(...simplifiedRun(run).slice(0, -1))
    }
    result.push(withoutCollinear(simplified))
  }
  return result
}
