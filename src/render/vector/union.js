import { clamp } from "#lib/core/maths.js"
import { area, sameWinding } from "./polygons.js"

const WELD = 1
const UNION_BAND = 1024
const UNION_SIDE = 0.25
const UNION_SNAP = 8
const UNION_SLIVER = 400

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

export function withoutCollinear(loop) {
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
