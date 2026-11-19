import { faceDepth } from "../../geometry/sizes.js"

export function extent(points, axis) {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    min = Math.min(min, point[axis])
    max = Math.max(max, point[axis])
  }
  return { min, max, size: Math.max(1, Math.round(max - min)) }
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
      const outward = kind === "top" ? -1 : 1
      const list = block.group.filter(face => face.kind === kind).map(face => ({ face, span: extent(face.points, 0), level: extent(face.points, 1)[kind === "top" ? "max" : "min"] })).sort((a, b) => (a.level - b.level) * outward)
      const taken = []
      for (const item of list) {
        if (taken.some(other => other.level !== item.level && other.span.min < item.span.max && item.span.min < other.span.max)) {
          item.face.extra = true
          extras.push(item.face)
        } else taken.push(item)
      }
    }
  }

  const runs = runsOf(extras).map(run => ({ ...run, region: "edge", width: extent(run.points, 0).size, height: depth }))
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
