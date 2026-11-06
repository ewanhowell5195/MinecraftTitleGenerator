import { boxFaces, boxesFor } from "./boxes.js"
import { SPACE } from "./layout.js"
import { buildAtlas } from "./material.js"

function expand(bounds, faces) {
  for (const face of faces) {
    for (const point of face.points) {
      bounds.minX = Math.min(bounds.minX, point[0])
      bounds.minY = Math.min(bounds.minY, point[1])
      bounds.maxX = Math.max(bounds.maxX, point[0])
      bounds.maxY = Math.max(bounds.maxY, point[1])
    }
  }
}

function shift(faces, offset) {
  for (const face of faces) {
    for (const point of face.points) point[0] += offset
  }
}

function frameRects(boxes) {
  const edges = Array.from(new Set(boxes.flatMap(box => [box.from[0], box.to[0]]))).sort((a, b) => a - b)
  const spans = []
  for (const [index, x0] of edges.slice(0, -1).entries()) {
    const x1 = edges[index + 1]
    const covering = boxes.filter(box => box.from[0] <= x0 && box.to[0] >= x1)
    spans.push(covering.length ? { x0, x1, y0: Math.min(...covering.map(box => box.from[1])), y1: Math.max(...covering.map(box => box.to[1])) } : { x0, x1, gap: true })
  }
  for (const [index, span] of spans.entries()) {
    if (!span.gap) continue
    const left = spans.slice(0, index).findLast(item => !item.gap)
    const right = spans.slice(index + 1).find(item => !item.gap)
    span.y0 = Math.max(left.y0, right.y0)
    span.y1 = Math.min(left.y1, right.y1)
  }
  return spans.map(span => [span.x0, span.y0, span.x1, span.y1])
}

function toBuffers(faces, units) {
  const positions = []
  const uvs = []
  for (const face of faces) {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = face.points[index]
      const coord = face.uvs[index]
      positions.push(point[0], point[1], point[2])
      uvs.push(coord[0] / units.width, 1 - coord[1] / units.height)
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9 }
}

export function buildText(font, options) {
  const { placed } = options
  if (!placed.length) return null
  const depth = options.depth
  const border = options.border
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const glyphs = []
  for (const item of placed) {
    const glyph = item.glyph
    const boxes = boxesFor(glyph.mask, glyph.width, glyph.height, item.x, glyph.bottom)
    const body = boxFaces(boxes, -depth / 2, depth / 2)
    for (const face of body) face.glyph = glyphs.length
    glyphs.push({ body, boxes, spaces: item.spaces, char: glyph.char, rect: { minX: item.x, maxX: item.x + glyph.width, minY: glyph.bottom, maxY: glyph.bottom + glyph.height } })
    expand(bounds, body)
  }
  const line = options.line ?? bounds
  const offset = -(line.minX + line.maxX) / 2
  for (const glyph of glyphs) {
    shift(glyph.body, offset)
    glyph.rect.minX += offset
    glyph.rect.maxX += offset
    for (const box of glyph.boxes) {
      box.from[0] += offset
      box.to[0] += offset
    }
  }
  const body = glyphs.flatMap(glyph => glyph.body)
  const texture = buildAtlas(body, {
    ...options,
    outline: border > 0,
    chars: glyphs.map(glyph => glyph.char),
    rects: glyphs.map(glyph => glyph.rect),
    spaces: glyphs.map(glyph => glyph.spaces),
    space: font.spaceWidth ?? SPACE
  })
  for (const [index, item] of placed.entries()) {
    const lift = item.glyph.lift
    if (!lift) continue
    for (const face of glyphs[index].body) {
      for (const point of face.points) point[1] += lift
    }
    for (const box of glyphs[index].boxes) {
      box.from[1] += lift
      box.to[1] += lift
    }
  }
  return {
    body: toBuffers(body, texture.units),
    texture: texture.canvas,
    labels: texture.labels,
    depth,
    border,
    boxes: glyphs.flatMap(glyph => glyph.boxes.map(box => [box.from, box.to])),
    line: { min: [line.minX + offset, line.minY, depth / 2 - (options.lineDepth ?? depth)], max: [line.maxX + offset, line.maxY, depth / 2] },
    frame: font.autoBorder ? frameRects(glyphs.flatMap(glyph => glyph.boxes)) : null,
    swatch: texture.swatch ? [(texture.swatch.x + 0.5) / texture.units.width, 1 - (texture.swatch.y + 0.5) / texture.units.height] : null,
    averages: { side: texture.side, get edge() { return options.painted.edgeAverage() } }
  }
}

function union(rects) {
  const xs = Array.from(new Set(rects.flatMap(rect => [rect[0], rect[2]]))).sort((a, b) => a - b)
  const ys = Array.from(new Set(rects.flatMap(rect => [rect[1], rect[3]]))).sort((a, b) => a - b)
  const column = new Map(xs.map((value, index) => [value, index]))
  const row = new Map(ys.map((value, index) => [value, index]))
  const width = xs.length - 1
  const height = ys.length - 1
  const mask = new Uint8Array(width * height)
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = row.get(y0); y < row.get(y1); y++) mask.fill(1, y * width + column.get(x0), y * width + column.get(x1))
  }
  return boxesFor(mask, width, height).map(box => ({ ...box, from: [xs[box.from[0]], ys[box.from[1]]], to: [xs[box.to[0]], ys[box.to[1]]] }))
}

export function buildOutline(built, scale, extra = [0, 0, 0]) {
  const [sx, sy, sz] = scale
  const [rx, ry, rz] = extra.map(value => built.border + value)
  const sources = built.frame ?? built.boxes.map(([from, to]) => [from[0], from[1], to[0], to[1]])
  const rects = sources.map(([x0, y0, x1, y1]) => [x0 * sx - rx, y0 * sy - ry, x1 * sx + rx, y1 * sy + ry])
  const z = sz * built.depth / 2 + rz
  const positions = []
  for (const face of rx > 0 ? boxFaces(union(rects), -z, z) : []) {
    for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...face.points[index])
  }
  const uvs = new Float32Array(positions.length / 3 * 2)
  if (built.swatch) {
    for (let i = 0; i < uvs.length; i += 2) uvs.set(built.swatch, i)
  }
  return { positions: new Float32Array(positions), uvs, triangles: positions.length / 9, scale, rects, z }
}

export function buildHoles(outlines) {
  const rects = outlines.flatMap(outline => outline.rects)
  if (!rects.length) return null
  const xs = Array.from(new Set(rects.flatMap(rect => [rect[0], rect[2]]))).sort((a, b) => a - b)
  const ys = Array.from(new Set(rects.flatMap(rect => [rect[1], rect[3]]))).sort((a, b) => a - b)
  const column = new Map(xs.map((value, index) => [value, index]))
  const row = new Map(ys.map((value, index) => [value, index]))
  const width = xs.length - 1
  const height = ys.length - 1
  const solid = new Uint8Array(width * height)
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = row.get(y0); y < row.get(y1); y++) solid.fill(1, y * width + column.get(x0), y * width + column.get(x1))
  }
  const outside = new Uint8Array(width * height)
  const pending = []
  function reach(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const at = y * width + x
    if (solid[at] || outside[at]) return
    outside[at] = 1
    pending.push(at)
  }
  for (let x = 0; x < width; x++) {
    reach(x, 0)
    reach(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    reach(0, y)
    reach(width - 1, y)
  }
  while (pending.length) {
    const at = pending.pop()
    const [x, y] = [at % width, Math.floor(at / width)]
    reach(x - 1, y)
    reach(x + 1, y)
    reach(x, y - 1)
    reach(x, y + 1)
  }
  const z = -Math.max(...outlines.map(outline => outline.z))
  const positions = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x
      if (solid[at] || outside[at]) continue
      const corners = [[xs[x], ys[y]], [xs[x + 1], ys[y]], [xs[x + 1], ys[y + 1]], [xs[x], ys[y + 1]]]
      for (const index of [0, 1, 2, 0, 2, 3]) positions.push(corners[index][0], corners[index][1], z)
    }
  }
  if (!positions.length) return null
  return { positions: new Float32Array(positions), uvs: new Float32Array(positions.length / 3 * 2), triangles: positions.length / 9, scale: outlines[0].scale }
}
