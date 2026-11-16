const MIN_SHARED = 0.05
const SHARED_ANGLE = 0.01
const SHARED_OFFSET = 0.1
const FLIP = 1e-4
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
