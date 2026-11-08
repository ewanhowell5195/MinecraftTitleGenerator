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

function shift({ body, boxes, rings }, axis, offset) {
  for (const face of body) {
    for (const point of face.points) point[axis] += offset
  }
  for (const box of boxes) {
    box.from[axis] += offset
    box.to[axis] += offset
  }
  for (const ring of rings ?? []) {
    for (const point of ring) point[axis] += offset
  }
}

function glyphRings({ rings, boxes }) {
  return rings ?? boxes.map(({ from, to }) => [[from[0], from[1]], [from[0], to[1]], [to[0], to[1]], [to[0], from[1]]])
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

function twistReach({ centre, same }, x, first, last) {
  const span = last - first
  if (!span) return 0
  const pivot = first + span * centre
  const fromCentre = (x - pivot) / Math.max(pivot - first, last - pivot)
  return same ? Math.abs(fromCentre) : fromCentre
}

function twistTurn({ ribbon, door }, rect, line, first, last) {
  const x = (rect.minX + rect.maxX) / 2
  return {
    ribbon: ribbon.amount * twistReach(ribbon, x, first, last) * Math.PI / 180,
    door: -door.amount * twistReach(door, x, first, last) * Math.PI / 180,
    x,
    y: (line.minY + line.maxY) / 2
  }
}

function turned([x, y, z], { ribbon, door, x: pivotX, y: pivotY }, [sx, sy, sz] = [1, 1, 1]) {
  const across = x / sx - pivotX
  const up = y / sy - pivotY
  const depth = z / sz * Math.cos(door) - across * Math.sin(door)
  return [
    (pivotX + across * Math.cos(door) + z / sz * Math.sin(door)) * sx,
    (pivotY + up * Math.cos(ribbon) - depth * Math.sin(ribbon)) * sy,
    (up * Math.sin(ribbon) + depth * Math.cos(ribbon)) * sz
  ]
}

function toBuffers(faces, units) {
  const positions = []
  const uvs = []
  for (const face of faces) {
    for (const index of face.points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]) {
      const point = face.points[index]
      const coord = face.uvs[index]
      positions.push(point[0], point[1], point[2])
      uvs.push(coord[0] / units.width, 1 - coord[1] / units.height)
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9 }
}

export function rowBottom(boxLists) {
  let left = null
  let right = null
  for (const boxes of boxLists) {
    if (!boxes.length) continue
    const y = Math.min(...boxes.map(box => box.from[1]))
    for (const box of boxes) {
      if (box.from[1] !== y) continue
      if (!left || box.from[0] < left[0]) left = [box.from[0], y]
      if (!right || box.to[0] > right[0]) right = [box.to[0], y]
    }
  }
  return left && { left, right }
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
    const char = glyph.char.split("\u0000")[0]
    const mesh = font.mesh?.glyphs[char]
    const shaped = mesh ? font.mesh.tools.meshFaces(mesh, glyph, font.glyphs[char], item.x, depth) : null
    const body = shaped ? shaped.faces : boxFaces(boxes, -depth / 2, depth / 2)
    for (const face of body) face.glyph = glyphs.length
    glyphs.push({ body, boxes, rings: shaped?.rings ?? null, spaces: item.spaces, char: glyph.char, rect: { minX: item.x, maxX: item.x + glyph.width, minY: glyph.bottom, maxY: glyph.bottom + glyph.height } })
    expand(bounds, body)
  }
  const line = options.line ?? bounds
  const offset = -(line.minX + line.maxX) / 2
  for (const glyph of glyphs) {
    shift(glyph, 0, offset)
    glyph.rect.minX += offset
    glyph.rect.maxX += offset
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
    if (item.glyph.lift) shift(glyphs[index], 1, item.glyph.lift)
  }
  const middles = glyphs.map(({ rect }) => (rect.minX + rect.maxX) / 2)
  const first = options.ends ? options.ends.first + offset : Math.min(...middles)
  const last = options.ends ? options.ends.last + offset : Math.max(...middles)
  const twist = options.twist ? glyphs.map(glyph => {
    const turn = twistTurn(options.twist, glyph.rect, line, first, last)
    for (const face of glyph.body) face.points = face.points.map(point => turned(point, turn))
    return { turn, rings: font.mesh ? glyphRings(glyph) : null, sources: font.autoBorder ? frameRects(glyph.boxes) : glyph.boxes.map(box => [box.from[0], box.from[1], box.to[0], box.to[1]]) }
  }) : null
  return {
    body: toBuffers(body, texture.units),
    texture: texture.canvas,
    labels: texture.labels,
    gradient: texture.gradient,
    fades: texture.fades,
    panels: texture.panels,
    depth,
    border,
    boxes: glyphs.flatMap(glyph => glyph.boxes.map(box => [box.from, box.to])),
    bottom: rowBottom(glyphs.map(glyph => glyph.boxes)),
    line: { min: [line.minX + offset, line.minY, depth / 2 - (options.lineDepth ?? depth)], max: [line.maxX + offset, line.maxY, depth / 2] },
    frame: font.autoBorder ? frameRects(glyphs.flatMap(glyph => glyph.boxes)) : null,
    shapes: font.mesh ? glyphs.flatMap(glyphRings) : null,
    tools: font.mesh?.tools ?? null,
    twist,
    swatch: texture.swatch ? [(texture.swatch.x + 0.5) / texture.units.width, 1 - (texture.swatch.y + 0.5) / texture.units.height] : null,
    averages: { side: texture.side, get edge() { return options.painted.edgeAverage() } }
  }
}

function rectGrid(rects) {
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
  return { xs, ys, width, height, mask }
}

function union(rects) {
  const { xs, ys, width, height, mask } = rectGrid(rects)
  return boxesFor(mask, width, height).map(box => ({ ...box, from: [xs[box.from[0]], ys[box.from[1]]], to: [xs[box.to[0]], ys[box.to[1]]] }))
}

export function buildOutline(built, scale, extra = [0, 0, 0]) {
  const [sx, sy, sz] = scale
  const [rx, ry, rz] = extra.map(value => built.border + value)
  const z = sz * built.depth / 2 + rz
  if (built.shapes) return meshOutline(built, scale, [rx, ry], z)
  const positions = []
  function shell(sources, turn) {
    const rects = sources.map(([x0, y0, x1, y1]) => [x0 * sx - rx, y0 * sy - ry, x1 * sx + rx, y1 * sy + ry])
    for (const face of rx > 0 ? boxFaces(union(rects), -z, z) : []) {
      for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...(turn ? turned(face.points[index], turn, scale) : face.points[index]))
    }
    return rects
  }
  const rects = built.twist ? [] : shell(built.frame ?? built.boxes.map(([from, to]) => [from[0], from[1], to[0], to[1]]))
  for (const { sources, turn } of built.twist ?? []) shell(sources, turn)
  const uvs = new Float32Array(positions.length / 3 * 2)
  if (built.swatch) {
    for (let i = 0; i < uvs.length; i += 2) uvs.set(built.swatch, i)
  }
  return { positions: new Float32Array(positions), uvs, triangles: positions.length / 9, scale, rects, z }
}

function meshOutline(built, scale, radius, z) {
  const groups = built.twist ? built.twist.map(({ turn, rings }) => ({ rings, turn: point => turned(point, turn, scale) })) : [{ rings: built.shapes }]
  const shell = radius[0] > 0 && radius[1] > 0 ? built.tools.outlineShell(groups, scale, radius, z) : { positions: [], shapes: [] }
  const uvs = new Float32Array(shell.positions.length / 3 * 2)
  if (built.swatch) {
    for (let i = 0; i < uvs.length; i += 2) uvs.set(built.swatch, i)
  }
  return { positions: new Float32Array(shell.positions), uvs, triangles: shell.positions.length / 9, scale, rects: [], shapes: shell.shapes, tools: built.tools, z }
}

function meshHoles(outlines, tools) {
  const positions = tools.holeFill(outlines.map(outline => outline.shapes ? { shapes: outline.shapes } : { rects: outline.rects }), -Math.max(...outlines.map(outline => outline.z)))
  if (!positions.length) return null
  return { positions: new Float32Array(positions), uvs: new Float32Array(positions.length / 3 * 2), triangles: positions.length / 9, scale: outlines[0].scale }
}

export function buildHoles(outlines) {
  const tools = outlines.find(outline => outline.tools)?.tools
  if (tools) return meshHoles(outlines, tools)
  const rects = outlines.flatMap(outline => outline.rects)
  if (!rects.length) return null
  const { xs, ys, width, height, mask: solid } = rectGrid(rects)
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
