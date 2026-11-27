import { faceDepth } from "#lib/geometry/sizes.js"

export function extent(points, axis) {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    min = Math.min(min, point[axis])
    max = Math.max(max, point[axis])
  }
  return { min, max, size: Math.max(1, Math.round(max - min)) }
}

function levelled(face, kind) {
  return { face, span: extent(face.points, 0), level: extent(face.points, 1)[kind === "top" ? "max" : "min"] }
}

export function stripOwners(faces, kind) {
  const outward = kind === "top" ? -1 : 1
  const list = faces.filter(face => face.kind === kind && !face.internal).map(face => levelled(face, kind)).sort((a, b) => (a.level - b.level) * outward)
  const taken = []
  const extras = []
  for (const item of list) {
    if (taken.some(other => other.level !== item.level && other.span.min < item.span.max && item.span.min < other.span.max)) extras.push(item.face)
    else taken.push(item)
  }
  return { taken, extras }
}

function joinLevels(faces, kind) {
  const items = faces.filter(face => !face.run).map(face => levelled(face, kind)).sort((a, b) => a.level - b.level || a.span.min - b.span.min)
  let last = null
  for (const item of items) {
    if (last && last.level === item.level && last.face.layer === item.face.layer && item.span.min <= last.max) {
      item.face.run = last.face.run ??= {}
      last.max = Math.max(last.max, item.span.max)
    } else last = { face: item.face, level: item.level, max: item.span.max }
  }
  return faces
}

export function stripSpans(faces, kind, origin) {
  const spans = []
  for (const { span, level } of stripOwners(faces, kind).taken.sort((a, b) => a.span.min - b.span.min)) {
    const last = spans[spans.length - 1]
    if (last && last.level === level && span.min <= last.to) last.to = Math.max(last.to, span.max)
    else spans.push({ from: span.min, to: span.max, level })
  }
  return spans.map(({ from, to }) => [from - origin, to - origin])
}

function pointKey(kind, [x, y]) {
  return `${kind}:${x},${y}`
}

function steep({ points: [p, , , q] }) {
  return Math.abs(q[1] - p[1]) > Math.abs(q[0] - p[0])
}

function curveRuns(faces, depth) {
  const list = faces.filter(face => face.mesh && (face.kind === "top" || face.kind === "bottom") && !face.internal && (!face.extra || face.arc) && steep(face))
  const starting = new Map(list.map(face => [pointKey(face.kind, face.points[0]), face]))
  const ending = new Set(list.map(face => pointKey(face.kind, face.points[3])))
  const seen = new Set()
  const runs = []
  for (const first of list.filter(face => !ending.has(pointKey(face.kind, face.points[0]))).concat(list)) {
    if (seen.has(first)) continue
    const run = { kind: first.kind, name: first.name, glyph: first.glyph, faces: [], points: [], region: "edge", height: depth }
    let length = 0
    for (let face = first; face && !seen.has(face); face = starting.get(pointKey(face.kind, face.points[3]))) {
      seen.add(face)
      const [p, , , q] = face.points
      face.along = [length, length += Math.hypot(q[0] - p[0], q[1] - p[1])]
      face.extra = true
      face.arc = true
      run.faces.push(face)
      run.points.push(...face.points)
    }
    runs.push({ ...run, width: extent(run.points, 0).size, length: Math.max(1, length) })
  }
  return runs
}

function boundsOf(faces) {
  const points = faces.flatMap(face => face.points)
  const x = extent(points, 0)
  const y = extent(points, 1)
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max }
}

function runsOf(list) {
  const runs = new Map()
  for (const face of list) {
    const key = face.run ?? face
    if (!runs.has(key)) runs.set(key, { kind: face.kind, name: face.name, glyph: face.glyph, faces: [], points: [] })
    runs.get(key).faces.push(face)
    runs.get(key).points.push(...face.points)
  }
  return Array.from(runs.values())
}

export function planAtlas(faces, options) {
  const depth = faceDepth(options.depth)
  const groups = new Map()
  for (const face of faces) {
    if (face.internal || face.kind === "side") continue
    if (!groups.has(face.glyph)) groups.set(face.glyph, [])
    groups.get(face.glyph).push(face)
  }
  const blocks = Array.from(groups.entries()).map(([index, group]) => {
    const rect = options.rects[index]
    const bounds = group[0].mesh ? rect : boundsOf(group)
    const minX = Math.min(bounds.minX, rect.minX)
    const maxX = Math.max(bounds.maxX, rect.maxX)
    const minY = Math.min(bounds.minY, rect.minY)
    const maxY = Math.max(bounds.maxY, rect.maxY)
    const own = { minX, maxX, minY, maxY, width: Math.max(1, Math.round(maxX - minX)), height: Math.max(1, Math.round(maxY - minY)) }
    return { glyph: index, group, own, rect, char: options.chars[index], spaces: options.spaces[index] }
  })

  const extras = []
  for (const block of blocks) {
    for (const kind of ["top", "bottom"]) {
      for (const face of joinLevels(stripOwners(block.group, kind).extras, kind)) {
        face.extra = true
        extras.push(face)
      }
    }
  }

  const runs = runsOf(extras).map(run => ({ ...run, region: "edge", width: extent(run.points, 0).size, height: depth })).concat(curveRuns(faces, depth))
  for (const kind of ["top", "bottom"]) {
    const members = options.internalFaces ? runsOf(faces.filter(face => face.internal && face.kind === kind)) : []
    runs.push(...members.map(run => ({ ...run, region: "internal", width: extent(run.points, 0).size, height: depth })))
  }
  const sides = options.sideFaces ? runsOf(faces.filter(face => face.kind === "side")) : []
  runs.push(...sides.map(run => ({ ...run, region: "side", width: depth, height: extent(run.points, 1).size })))
  const shared = { minY: Math.min(...blocks.map(block => block.own.minY)), maxY: Math.max(...blocks.map(block => block.own.maxY)) }
  const glyphs = Array.from(new Set(faces.map(face => face.glyph))).sort((a, b) => a - b)
  return { faces, blocks, runs, depth, shared, glyphs, spaces: options.spaces }
}
