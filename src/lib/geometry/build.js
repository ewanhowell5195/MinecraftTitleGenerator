import { boxFaces, boxesFor } from "./boxes.js"
import { independentLayers, layerMask, stripLimits } from "../font/flatSheet.js"
import { clippedBoxes } from "./joins.js"
import { SPACE } from "./layout.js"
import { finishAtlas, mapFaces } from "../texture/atlas/finish.js"
import { layoutPages, pageGroups } from "../texture/atlas/pages.js"
import { planAtlas, stripSpans } from "../texture/atlas/plan.js"
import { faceLimits } from "./meshFaces.js"
import { REGION_KINDS, detailOf, regionScales } from "../texture/atlas/scales.js"
import { clamp, remember } from "../core/maths.js"
import { baseChar } from "../font/order.js"
import { defaultDepth } from "../settings/defaults.js"
import { edgeReach } from "./sizes.js"

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

function shift({ body, boxes, slabs, rings }, axis, offset) {
  for (const face of body) {
    for (const point of face.points) point[axis] += offset
  }
  for (const box of boxes.concat(slabs?.flat() ?? [])) {
    box.from[axis] += offset
    box.to[axis] += offset
  }
  for (const ring of rings ?? []) {
    for (const point of ring) point[axis] += offset
  }
}

function gentleAt(contours, x, y, steepest) {
  let nearest = Infinity
  let gentle = false
  for (const points of contours) {
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i]
      const [x1, y1] = points[(i + 1) % points.length]
      const dx = x1 - x0
      const dy = y1 - y0
      const t = dx || dy ? clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy), 0, 1) : 0
      const distance = Math.hypot(x0 + t * dx - x, y0 + t * dy - y)
      if (distance >= nearest) continue
      nearest = distance
      gentle = Math.atan2(Math.abs(dy), Math.abs(dx)) <= steepest
    }
  }
  return gentle
}

function sourceRow(glyph, original, row) {
  const map = glyph.arc?.map
  if (!map) return original.bottom + row
  const whole = clamp(Math.floor(row), 0, map.length - 1)
  return original.bottom + map[whole] + row - whole
}

function stripFaces(body, glyph, original, capHeight) {
  const levels = body.filter(face => face.kind === "top" || face.kind === "bottom").map(face => {
    const ys = face.points.map(point => point[1])
    const level = face.kind === "top" ? sourceRow(glyph, original, Math.max(...ys) - glyph.bottom - 1) + 1 : sourceRow(glyph, original, Math.min(...ys) - glyph.bottom)
    return { face, level }
  })
  const tops = levels.filter(({ face }) => face.kind === "top").map(({ level }) => level)
  const bottoms = levels.filter(({ face }) => face.kind === "bottom").map(({ level }) => level)
  const { topline, baseline } = stripLimits(tops, bottoms, capHeight)
  for (const { face, level } of levels) face.internal &&= face.kind === "top" ? level < topline : level > baseline
}

function layerFronts(layers, depth, reference) {
  const step = Math.min(depth, reference)
  return layers.map(value => depth / 2 - (1 - value) * step)
}

function sliceFaces(glyph, x, depth, planes, independent) {
  const present = Array.from(new Set(Array.from(glyph.depths).filter((value, at) => glyph.mask[at]))).sort((a, b) => a - b)
  const faces = []
  if (independent) {
    for (const layer of present) {
      const own = boxFaces(clippedBoxes(boxesFor(layerMask(glyph, layer, true), glyph.width, glyph.height, x, glyph.bottom), glyph, x), -depth / 2, planes[layer])
      for (const face of own) face.layer = layer
      faces.push(...own)
    }
    return faces
  }
  for (const [index, layer] of present.entries()) {
    const next = present[index + 1]
    const near = planes[layer]
    const far = next === undefined ? -depth / 2 : planes[next]
    const keep = glyph.mask.map((solid, at) => solid && glyph.depths[at] <= layer ? 1 : 0)
    const exposed = glyph.mask.map((solid, at) => solid && glyph.depths[at] === layer ? 1 : 0)
    const sides = clippedBoxes(boxesFor(keep, glyph.width, glyph.height, x, glyph.bottom), glyph, x).map(box => ({ ...box, faces: { ...box.faces, front: next === undefined, back: false } }))
    const fronts = clippedBoxes(boxesFor(exposed, glyph.width, glyph.height, x, glyph.bottom), glyph, x).map(box => ({ ...box, faces: { back: true } }))
    const slice = boxFaces(sides.concat(fronts), far, near)
    for (const face of slice) face.layer = layer
    faces.push(...slice)
  }
  return faces
}

function roundEdges(body, contours, glyph, original, x, reach, steepest) {
  const top = glyph.bottom + glyph.height
  for (const face of body) {
    if (!face.internal || face.kind !== "top" && face.kind !== "bottom") continue
    const y = face.points[0][1]
    if (face.kind === "top" ? y < top - reach : y > glyph.bottom + reach) continue
    const xs = face.points.map(point => point[0])
    const across = (Math.min(...xs) + Math.max(...xs)) / 2 - x
    const level = face.kind === "top" ? sourceRow(glyph, original, y - glyph.bottom - 1) + 1 : sourceRow(glyph, original, y - glyph.bottom)
    if (gentleAt(contours, across, level, steepest)) face.internal = false
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

function fanCells(spans) {
  const sorted = spans.toSorted((a, b) => a.minX - b.minX)
  return sorted.map((span, index) => ({ from: index ? (sorted[index - 1].maxX + span.minX) / 2 : -Infinity, to: index < sorted.length - 1 ? (span.maxX + sorted[index + 1].minX) / 2 : Infinity, centre: (span.minX + span.maxX) / 2 }))
}

function spine(cells, pivot, x, angleAt) {
  const low = Math.min(pivot, x)
  const high = Math.max(pivot, x)
  const side = x < pivot ? -1 : 1
  let across = 0
  let turn = 0
  for (const cell of cells) {
    const length = Math.min(high, cell.to) - Math.max(low, cell.from)
    if (length <= 0) continue
    const angle = angleAt(cell.centre)
    across += length * Math.cos(angle)
    turn += length * Math.sin(angle)
  }
  return [pivot + side * across - x, side * turn]
}

function twistAngle(part, x, first, last) {
  return -part.amount * twistReach(part, x, first, last) * Math.PI / 180
}

function rolled(door, x, angle, first, last, cells, hinge) {
  if (!door.roll || !door.amount) return { moveX: 0, moveZ: 0 }
  const [along, turn] = spine(cells, first + (last - first) * door.centre, x, at => twistAngle(door, at, first, last))
  return { moveX: along - hinge * Math.sin(angle), moveZ: hinge * (1 - Math.cos(angle)) - turn }
}

function fanRolled(fan, x, angle, first, last, cells, hinge) {
  if (!fan.roll || !fan.amount) return { fanX: 0, fanY: 0 }
  const [along, turn] = spine(cells, first + (last - first) * fan.centre, x, at => twistAngle(fan, at, first, last))
  return { fanX: along + hinge * Math.sin(angle), fanY: turn + hinge * (1 - Math.cos(angle)) }
}

function plainBounds(glyphs) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const glyph of glyphs) {
    for (const face of glyph.body) {
      for (const point of face.points) {
        for (const axis of [0, 1, 2]) {
          min[axis] = Math.min(min[axis], point[axis])
          max[axis] = Math.max(max[axis], point[axis])
        }
      }
    }
  }
  return { min, max }
}

function twistParts({ twist: { ribbon, door, fan }, first, last, cells }, x, { height, back, front }) {
  const angle = twistAngle(door, x, first, last)
  const fanAngle = twistAngle(fan, x, first, last)
  return { ribbon: ribbon.amount * twistReach(ribbon, x, first, last) * Math.PI / 180, door: angle, fan: fanAngle, ...rolled(door, x, angle, first, last, cells, back + (front - back) * (door.depth ?? 0.5)), ...fanRolled(fan, x, fanAngle, first, last, cells, ((fan.height ?? 0.5) - 0.5) * height) }
}

function twistTurn(twists, rect, line, place, scale, depths) {
  const own = (rect.minX + rect.maxX) / 2
  const x = place(own)
  const parts = twists.map(twist => twistParts(twist, x, { height: (line.maxY - line.minY) * scale[1], back: depths[0] * scale[2], front: depths[1] * scale[2] }))
  const sum = key => parts.map(part => part[key]).reduce((total, value) => total + value)
  return {
    scale,
    ribbon: sum("ribbon"),
    door: sum("door"),
    fan: sum("fan"),
    x: own,
    y: (line.minY + line.maxY) / 2,
    moveX: sum("moveX") / scale[0],
    moveZ: sum("moveZ") / scale[2],
    fanX: sum("fanX"),
    fanY: sum("fanY")
  }
}

function twisting(twist) {
  return !!twist && !!(twist.ribbon.amount || twist.door.amount || twist.fan.amount)
}

function fanned(across, up, { fan, fanX, fanY }) {
  if (!fan) return [across, up]
  return [across * Math.cos(fan) - up * Math.sin(fan) + fanX, across * Math.sin(fan) + up * Math.cos(fan) + fanY]
}

function turned([x, y, z], turn, [sx, sy, sz] = [1, 1, 1]) {
  const { ribbon, door, x: pivotX, y: pivotY, moveX, moveZ, scale: [wide, tall, deep] } = turn
  const [across, up] = fanned((x / sx - pivotX) * wide, (y / sy - pivotY) * tall, turn)
  const along = z / sz * deep
  const depth = along * Math.cos(door) - across * Math.sin(door)
  return [
    (pivotX + moveX + (across * Math.cos(door) + along * Math.sin(door)) / wide) * sx,
    (pivotY + (up * Math.cos(ribbon) - depth * Math.sin(ribbon)) / tall) * sy,
    (moveZ + (up * Math.sin(ribbon) + depth * Math.cos(ribbon)) / deep) * sz
  ]
}

function toBuffers(faces, mapped, pages) {
  const order = Array.from(faces.keys()).sort((a, b) => pages.indexOf(mapped[a].page) - pages.indexOf(mapped[b].page))
  const positions = []
  const uvs = []
  const sizes = []
  const groups = []
  const glyphs = []
  for (const at of order) {
    const face = faces[at]
    const { page, uvs: coords } = mapped[at]
    const index = pages.indexOf(page)
    const start = positions.length / 3
    if (groups.at(-1)?.page !== index) groups.push({ start, count: 0, page: index })
    sizes.push(face.points.length === 3 ? 3 : 6)
    glyphs.push(face.glyph)
    for (const corner of face.points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]) {
      const point = face.points[corner]
      const coord = coords[corner]
      positions.push(point[0], point[1], point[2])
      uvs.push(coord[0] / page.width, 1 - coord[1] / page.height)
    }
    groups.at(-1).count += positions.length / 3 - start
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9, sizes: sizes.includes(3) ? Uint8Array.from(sizes) : null, groups, glyphs: Uint16Array.from(glyphs) }
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
  const { placed, depth, border } = options
  if (!placed.length) return null
  const reach = edgeReach(font.capHeight, options.curveHeight)
  const limits = faceLimits({ faded: options.fadeCurves, sides: options.sideFaces, angle: options.curveAngle })
  const independent = independentLayers(font)
  const fronts = font.layers ? layerFronts(font.layers, depth, defaultDepth(font)) : null
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const glyphs = []
  for (const item of placed) {
    const glyph = item.glyph
    const boxes = clippedBoxes(boxesFor(glyph.mask, glyph.width, glyph.height, item.x, glyph.bottom), glyph, item.x)
    const char = baseChar(glyph.char)
    const mesh = font.mesh?.glyphs[char]
    const shaped = mesh ? font.mesh.tools.meshFaces(mesh, glyph, font.glyphs[char], item.x + (glyph.inkShift ?? 0), depth, reach, limits, font.capHeight) : null
    const sliced = !shaped && glyph.depths && font.layers
    const body = shaped ? shaped.faces : sliced ? sliceFaces(glyph, item.x, depth, fronts, independent) : boxFaces(boxes, -depth / 2, depth / 2)
    if (sliced) {
      for (const slice of Map.groupBy(body, face => face.layer).values()) stripFaces(slice, glyph, font.glyphs[char], font.capHeight)
    } else if (font.glyphs?.[char]) stripFaces(body, glyph, font.glyphs[char], font.capHeight)
    if (!shaped && font.outlines?.[char]) roundEdges(body, font.outlines[char], glyph, font.glyphs[char], item.x, reach, faceLimits({ angle: options.curveAngle }).slope)
    if (!shaped) glyph.edgeSpans = { up: stripSpans(body, "top", item.x), down: stripSpans(body, "bottom", item.x) }
    for (const face of body) face.glyph = glyphs.length
    const slabs = sliced ? font.layers.map((_, layer) => clippedBoxes(boxesFor(layerMask(glyph, layer, independent), glyph.width, glyph.height, item.x, glyph.bottom), glyph, item.x)) : null
    glyphs.push({ body, boxes, slabs, rings: shaped?.rings ?? null, spaces: item.spaces, char: glyph.char, rect: { minX: item.x, maxX: item.x + glyph.width, minY: glyph.bottom, maxY: glyph.bottom + glyph.height, ...shaped?.lines } })
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
  const atlas = {
    ...options,
    outline: border > 0,
    chars: glyphs.map(glyph => glyph.char),
    rects: glyphs.map(glyph => glyph.rect),
    spaces: glyphs.map(glyph => glyph.spaces),
    space: font.spaceWidth ?? SPACE,
    reach,
    limits
  }
  const flat = body.map(face => ({ ...face, points: face.points.map(point => point.slice()) }))
  const limit = options.textureLimit ?? Infinity
  const parts = (options.layers ? Array.from(Map.groupBy(flat, face => face.layer ?? 0)).sort(([a], [b]) => a - b) : [[0, flat]]).map(([layer, faces]) => {
    const own = { ...atlas, ...options.layers?.[layer].options }
    const plan = planAtlas(faces, own)
    const details = options.details?.[layer] ?? null
    return { layer, plan, details, groups: pageGroups(plan, regionScales(details), limit), options: own }
  })
  const sharpened = parts.some(part => REGION_KINDS.some(kind => Math.max(...Object.values(detailOf(part.details?.[kind]))) > 1))
  function textured(paint, sharp) {
    const layouts = parts.map(part => layoutPages(part.plan, part.groups, regionScales(sharp ? part.details : null), options.sheet, limit).map(page => ({ ...page, sharp, layer: part.layer })))
    if (!paint) {
      for (const [index, part] of parts.entries()) {
        for (const page of layouts[index]) mapFaces(part.plan, page, part.options, options.faded?.[part.layer] ?? false)
      }
      return { layouts: layouts.flat(), pages: [], swatch: null, side: null, edge: () => null }
    }
    const painted = paint(layouts)
    const pages = []
    const finished = []
    for (const [index, part] of parts.entries()) {
      for (const [at, page] of layouts[index].entries()) {
        pages.push(page)
        finished.push({ ...finishAtlas(part.plan, page, painted[index][at], part.options), page, layer: part.layer })
      }
    }
    const first = finished[0]
    const swatched = atlas.outline || finished.some(item => item.swatched)
    return {
      layouts: pages,
      pages: finished.map(({ canvas, labels, crackShapes, gradient, fades, panels, layer }) => ({ texture: canvas, labels, crackShapes, gradient, fades, panels, layer })),
      swatch: swatched ? [(first.swatch.x + first.swatch.scale / 2) / first.page.width, 1 - (first.swatch.y + first.swatch.scale / 2) / first.page.height] : null,
      side: finished.find(item => item.side)?.side ?? null,
      edge: () => painted[0][0].edgeAverage()
    }
  }
  const texture = textured(options.paint, false)
  let drafted = null
  function refine(paint) {
    const sharp = textured(paint, true)
    return { body: { ...toBuffers(body, flat, sharp.layouts), plainUvs: drafted.uvs }, pages: sharp.pages.map((page, index) => ({ ...page, plain: texture.pages[index] })), layouts: sharp.layouts, swatch: sharp.swatch, averages: { side: sharp.side, get edge() { return sharp.edge() } } }
  }
  function repaint(paint) {
    const { pages, swatch } = textured(paint, false)
    return { pages, swatch }
  }
  const scale = options.wordScale ?? [1, 1, 1]
  for (const [index, item] of placed.entries()) {
    const own = (item.glyph.lift ?? 0) - (item.glyph.lineLift ?? 0)
    if (own) shift(glyphs[index], 1, own)
  }
  const plain = scale.some(axis => axis !== 1) ? plainBounds(glyphs) : null
  for (const [index, item] of placed.entries()) {
    if (item.glyph.lineLift) shift(glyphs[index], 1, item.glyph.lineLift / scale[1])
  }
  const middles = glyphs.map(({ rect }) => (rect.minX + rect.maxX) / 2)
  const first = options.ends ? options.ends.first + offset : Math.min(...middles)
  const last = options.ends ? options.ends.last + offset : Math.max(...middles)
  const anchor = plain ? (plain.min[0] + plain.max[0]) / 2 : 0
  const lineScale = options.lineScale ?? [1, 1, 1]
  const stretchX = lineScale[0]
  const place = x => (anchor + (x - anchor) * scale[0]) * stretchX
  const ownSpans = glyphs.map(({ rect }) => ({ minX: place(rect.minX), maxX: place(rect.maxX) }))
  const lineSpans = options.spans ? options.spans.map(span => {
    const [minX, maxX] = [span.minX + offset, span.maxX + offset]
    return span.own ? { minX: place(minX), maxX: place(maxX) } : { minX: minX * stretchX, maxX: maxX * stretchX }
  }) : ownSpans
  const twists = [options.twist && { twist: options.twist, first: first * stretchX, last: last * stretchX, cells: fanCells(lineSpans) }, twisting(options.wordTwist) && { twist: options.wordTwist, first: place(Math.min(...middles)), last: place(Math.max(...middles)), cells: fanCells(ownSpans) }].filter(Boolean)
  const twist = twists.length ? glyphs.map(glyph => {
    const turn = twistTurn(twists, glyph.rect, line, place, scale.map((axis, index) => axis * lineScale[index]), [depth / 2 - (options.lineDepth ?? depth), depth / 2])
    for (const face of glyph.body) face.points = face.points.map(point => turned(point, turn))
    return { turn, rings: font.mesh ? glyphRings(glyph) : null, sources: font.autoBorder ? frameRects(glyph.boxes) : flatRects(glyph.boxes), slabs: font.autoBorder || !font.layers ? null : font.layers.map((_, layer) => flatRects(glyph.slabs?.[layer] ?? glyph.boxes)) }
  }) : null
  drafted = toBuffers(body, flat, texture.layouts)
  return {
    body: drafted,
    pages: texture.pages,
    layouts: texture.layouts,
    refine: sharpened || options.redraw ? refine : null,
    repaint,
    layers: Array.from(new Set(body.map(face => face.layer ?? 0))).sort((a, b) => a - b),
    chars: glyphs.map(glyph => glyph.char),
    depth,
    border,
    boxes: glyphs.flatMap(glyph => glyph.boxes.map(box => [box.from, box.to])),
    bottom: rowBottom(glyphs.map(glyph => glyph.boxes)),
    line: { min: [line.minX + offset, line.minY, depth / 2 - (options.lineDepth ?? depth)], max: [line.maxX + offset, line.maxY, depth / 2] },
    frame: font.autoBorder ? frameRects(glyphs.flatMap(glyph => glyph.boxes)) : null,
    slabs: font.layers && !font.autoBorder ? font.layers.map((_, layer) => glyphs.flatMap(glyph => flatRects(glyph.slabs?.[layer] ?? glyph.boxes))) : null,
    layerFronts: fronts,
    independent,
    shapes: font.mesh ? glyphs.flatMap(glyphRings) : null,
    tools: font.mesh?.tools ?? null,
    twist,
    plain,
    centres: {
      line: { ends: [first, last], extent: [line.minX + offset, line.maxX + offset] },
      word: { ends: [Math.min(...middles), Math.max(...middles)], extent: [Math.min(...glyphs.map(glyph => glyph.rect.minX)), Math.max(...glyphs.map(glyph => glyph.rect.maxX))] },
      y: (line.minY + line.maxY) / 2,
      height: line.maxY - line.minY,
      depths: [depth / 2 - (options.lineDepth ?? depth), depth / 2]
    },
    swatch: texture.swatch,
    averages: { side: texture.side, get edge() { return texture.edge() } }
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

export function unionBoxes(rects) {
  const { xs, ys, width, height, mask } = rectGrid(rects)
  return boxesFor(mask, width, height).map(box => ({ ...box, from: [xs[box.from[0]], ys[box.from[1]]], to: [xs[box.to[0]], ys[box.to[1]]] }))
}

function flatRects(boxes) {
  return boxes.map(box => [box.from[0], box.from[1], box.to[0], box.to[1]])
}

export function buildOutline(built, scale, extra = [0, 0, 0]) {
  const [sx, sy, sz] = scale
  const [rx, ry, rz] = extra.map(value => built.border + value)
  const z = sz * built.depth / 2 + rz
  if (built.shapes) return meshOutline(built, scale, [rx, ry], z)
  const positions = []
  const grow = sources => sources.map(([x0, y0, x1, y1]) => [x0 * sx - rx, y0 * sy - ry, x1 * sx + rx, y1 * sy + ry])
  const front = layer => sz * built.layerFronts[layer] + rz
  function shell(sources, turn, slabs = null) {
    const rects = grow(sources)
    const last = (slabs?.length ?? 1) - 1
    const pieces = slabs ? slabs.map((list, layer) => ({ rects: grow(list), low: layer === last || built.independent ? -z : front(layer + 1), high: front(layer), capped: layer === last || built.independent })) : [{ rects, low: -z, high: z, capped: true }]
    for (const piece of rx > 0 ? pieces : []) {
      const boxes = unionBoxes(piece.rects).map(box => piece.capped ? box : { ...box, faces: { ...box.faces, front: false } })
      for (const face of boxFaces(boxes, piece.low, piece.high)) {
        for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...(turn ? turned(face.points[index], turn, scale) : face.points[index]))
      }
    }
    return rects
  }
  const rects = built.twist ? [] : shell(built.frame ?? built.boxes.map(([from, to]) => [from[0], from[1], to[0], to[1]]), null, built.frame ? null : built.slabs)
  for (const { sources, turn, slabs } of built.twist ?? []) shell(sources, turn, slabs)
  return { positions: new Float32Array(positions), uvs: swatchUvs(positions, built.swatch), triangles: positions.length / 9, scale, rects, z }
}

export function swatchUvs(positions, swatch) {
  const uvs = new Float32Array(positions.length / 3 * 2)
  if (swatch) {
    for (let i = 0; i < uvs.length; i += 2) uvs.set(swatch, i)
  }
  return uvs
}

const CACHED_SHELLS = 16
const shells = new Map()
const holes = new WeakMap()

function ringsKey(groups, ...values) {
  let hash = 2166136261
  let count = 0
  for (const { rings } of groups) {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        hash = Math.imul(hash ^ Math.round(x * 1000), 16777619)
        hash = Math.imul(hash ^ Math.round(y * 1000), 16777619)
        count++
      }
    }
  }
  return JSON.stringify([hash, count].concat(values))
}

function meshOutline(built, scale, radius, z) {
  const groups = built.twist ? built.twist.map(({ turn, rings }) => ({ rings, turn: point => turned(point, turn, scale) })) : [{ rings: built.shapes }]
  const key = ringsKey(groups, scale, radius, z, built.swatch, built.twist?.map(({ turn }) => turn))
  return remember(shells, key, () => shellOutline(built, groups, scale, radius, z), CACHED_SHELLS)
}

function shellOutline(built, groups, scale, radius, z) {
  const shell = radius[0] > 0 && radius[1] > 0 ? built.tools.outlineShell(groups, scale, radius, z) : { positions: [], sizes: [], shapes: [] }
  return { positions: new Float32Array(shell.positions), uvs: swatchUvs(shell.positions, built.swatch), triangles: shell.positions.length / 9, sizes: Uint8Array.from(shell.sizes), scale, rects: [], shapes: shell.shapes, tools: built.tools, z }
}

export function buildHoles(outlines) {
  if (!outlines.length) return null
  const last = holes.get(outlines[0])
  if (last?.outlines.length === outlines.length && last.outlines.every((outline, index) => outline === outlines[index])) return last.result
  const tools = outlines.find(outline => outline.tools)?.tools
  const result = tools ? filledHoles(outlines, tools) : gridHoles(outlines)
  holes.set(outlines[0], { outlines, result })
  return result
}

function filledHoles(outlines, tools) {
  const positions = tools.holeFill(outlines.map(outline => outline.shapes ? { shapes: outline.shapes } : { rects: outline.rects }), -Math.max(...outlines.map(outline => outline.z)))
  if (!positions.length) return null
  return { positions: new Float32Array(positions), uvs: new Float32Array(positions.length / 3 * 2), triangles: positions.length / 9, sizes: new Uint8Array(positions.length / 9).fill(3), scale: outlines[0].scale }
}

function gridHoles(outlines) {
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
