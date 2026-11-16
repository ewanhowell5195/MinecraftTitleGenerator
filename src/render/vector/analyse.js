import { FillRule, intersectD } from "@countertype/clipper2-ts"
import { packed } from "../../lib/core/colour.js"
import { colourTotals, jump, majority, near, tally, within } from "./colours.js"
import { BASE_SHARE, STEP_EDGE, fadedModel, flatOf, joinedBands, modelOf, paintedModel, rampsOneWay, rising, segmentsOf, smoothBands, without } from "./models.js"
import { smoothStairs, trace } from "./trace.js"

const CUT_PRECISION = 3
const SLIDE_CONTRAST = 48
const SOFT_LABEL = 1 << 16
const MAX_MODELS = 6
const LAYER_SHARE = 0.5
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const HOLE = -2
export const BASE = -1
const COVERED = -1
const PEEL_SHARE = 0.1

function asPaths(polygons) {
  return polygons.map(polygon => polygon.map(([x, y]) => ({ x, y })))
}

export function analyse(image, rect, mask = null) {
  const { data, width: atlasWidth, labels, gradient, fades } = image
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const colours = new Int32Array(width * height)
  const regions = new Map()
  const solid = []
  let holes = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = ((y + rect.top) * atlasWidth + x + rect.left) * 4
      if (data[at + 3] < 128 || mask && !mask[y * width + x]) {
        holes = true
        continue
      }
      const index = y * width + x
      colours[index] = packed(data, at)
      solid.push(index)
      const label = labels ? packed(labels, at) : 0
      if (!regions.has(label)) regions.set(label, [])
      regions.get(label).push(index)
    }
  }
  if (!solid.length) return null

  function sidesOf(pixel) {
    const x = pixel % width
    return SIDES.filter(([dx, dy]) => x + dx >= 0 && x + dx < width && pixel + dy * width >= 0 && pixel + dy * width < width * height).map(([dx, dy]) => pixel + dy * width + dx)
  }

  function shapeOf(list, smooth) {
    const drawn = new Uint8Array(width * height)
    for (const index of list) drawn[index] = 1
    return trace(drawn, width, height).map(loop => (smooth ? smoothStairs(loop) : loop).map(([x, y]) => [x + rect.left, y + rect.top]))
  }

  function placedOn(model) {
    if (!model.stops) return model
    const shift = model.axis[0] * rect.left + model.axis[1] * rect.top
    return { ...model, stops: model.stops.map(stop => ({ t: stop.t + shift, colour: stop.colour })) }
  }

  const [main, ...overlaid] = Array.from(regions.entries()).sort((a, b) => b[1].length - a[1].length)
  const anySoft = main[0] >= SOFT_LABEL || overlaid.some(([label]) => label >= SOFT_LABEL)
  const totals = colourTotals(image)

  function bandsOf(label) {
    function rowColour(y) {
      const counts = new Map()
      let opaque = false
      function count(x) {
        const at = (y * atlasWidth + x) * 4
        if (data[at + 3] < 128) return
        opaque = true
        if (labels && packed(labels, at) !== label) return
        tally(counts, packed(data, at))
      }
      for (let x = rect.left; x < rect.right; x++) count(x)
      for (let reach = 1; !counts.size && (rect.left - reach >= 0 || rect.right - 1 + reach < atlasWidth); reach++) {
        if (rect.left - reach >= 0) count(rect.left - reach)
        if (rect.right - 1 + reach < atlasWidth) count(rect.right - 1 + reach)
      }
      return counts.size ? majority(counts) : opaque ? COVERED : null
    }
    const rows = []
    for (let y = rect.top; y < rect.bottom; y++) {
      const colour = rowColour(y)
      if (colour !== null && colour !== COVERED) rows.push({ y, colour })
    }
    if (!rows.length) return null
    for (let y = rect.top - 1; y >= 0; y--) {
      const colour = rowColour(y)
      if (colour === COVERED) continue
      if (colour === null || jump(colour, rows[0].colour)) break
      rows.unshift({ y, colour })
    }
    for (let y = rect.bottom; y < image.height; y++) {
      const colour = rowColour(y)
      if (colour === COVERED) continue
      if (colour === null || jump(rows.at(-1).colour, colour)) break
      rows.push({ y, colour })
    }
    const inside = new Map()
    for (const [row, colour] of smoothBands(rows.map(row => row.colour))) {
      const { y } = rows[row]
      if (y >= rect.top && y < rect.bottom) inside.set(y - rect.top, colour)
    }
    return inside
  }

  function isGentle(region) {
    const present = new Set(region)
    const gentle = (a, b) => within(colours[a], colours[b], STEP_EDGE)
    return region.every(index => (index % width === width - 1 || !present.has(index + 1) || gentle(index, index + 1)) && (!present.has(index + width) || gentle(index, index + width)))
  }

  function nearColourParts(list) {
    const present = new Set(list)
    const parts = []
    for (const start of list) {
      if (!present.delete(start)) continue
      const part = [start]
      for (const index of part) {
        for (const other of sidesOf(index)) {
          if (present.has(other) && near(colours[index], colours[other])) {
            present.delete(other)
            part.push(other)
          }
        }
      }
      parts.push(part)
    }
    return parts
  }

  function decompose(region, exact, label, known = null) {
    let free = region
    function take(matched) {
      free = without(free, matched)
    }
    const layers = []
    let fitted = known ?? modelOf(free, colours, width, height, BASE_SHARE, exact, bandsOf(label)) ?? flatOf(free, colours)
    if (!known && fitted.stops?.some((stop, index) => index && stop.t === fitted.stops[index - 1].t)) {
      const peeled = flatOf(free, colours)
      const remainder = without(free, peeled.matched)
      const trial = peeled.matched.length >= free.length * PEEL_SHARE && remainder.length ? modelOf(remainder, colours, width, height, BASE_SHARE, exact) : null
      if (trial?.stops && rising(trial.stops)) {
        layers.push({ ...peeled, pixels: peeled.matched, smooth: anySoft })
        take(peeled.matched)
        fitted = trial
      }
    }
    if (!known && !fitted.stops) {
      const counts = new Map()
      for (const index of free) tally(counts, colours[index])
      const common = Array.from(counts).filter(([, count]) => count >= free.length * PEEL_SHARE).reduce((best, [colour]) => (totals.get(colour) ?? 0) > (totals.get(best) ?? 0) ? colour : best, fitted.colour)
      fitted = { colour: common, matched: free.filter(index => near(colours[index], common)) }
    }
    const [largest, ...others] = known ? known.parts ?? [known] : segmentsOf(fitted, width).sort((a, b) => a.stops || b.stops ? b.matched.length - a.matched.length : (totals.get(b.colour) ?? 0) - (totals.get(a.colour) ?? 0))
    take(fitted.matched)
    for (const segment of others) layers.push({ ...placedOn(segment), pixels: segment.matched, smooth: false })
    const continuous = anySoft || isGentle(region)
    for (let round = 0; continuous && round < MAX_MODELS && free.length; round++) {
      const model = modelOf(free, colours, width, height, LAYER_SHARE, exact)
      if (!model) break
      for (const segment of segmentsOf(model, width)) layers.push({ ...placedOn(segment), pixels: segment.matched, smooth: true })
      take(model.matched)
    }
    let gentle = []
    for (const part of nearColourParts(free)) {
      if (part.every(index => colours[index] === colours[part[0]])) continue
      const model = modelOf(part, colours, width, height, LAYER_SHARE, exact)
      if (!model?.stops || model.matched.length < part.length * BASE_SHARE || !rampsOneWay(model.stops)) continue
      model.matched = part
      for (const segment of segmentsOf(model, width)) layers.push({ ...placedOn(segment), pixels: segment.matched, smooth: false })
      gentle = gentle.concat(part)
    }
    take(gentle)
    const rest = new Map()
    for (const index of free) {
      if (!rest.has(colours[index])) rest.set(colours[index], [])
      rest.get(colours[index]).push(index)
    }
    for (const [colour, list] of rest) layers.push({ colour, pixels: list, smooth: false })
    return { base: placedOn(largest), layers }
  }

  const source = gradient?.faces.find(face => contains(face, rect))
  const fade = fades?.find(area => contains(area, rect))
  function knownModel(region, overlaid) {
    if (source) return paintedModel(source, rect, region, colours, width, overlaid)
    return fade ? fadedModel(fade, rect, region, colours, width) : null
  }
  const { base, layers: painted } = decompose(main[1], false, main[0], knownModel(main[1], false))
  function exactCut(label, region) {
    const bits = image.crackShapes ? Array.from(image.crackShapes.keys()).filter(bit => label & 1 << bit) : []
    if (!bits.length) return null
    const box = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]]
    let cut = intersectD(asPaths([box]), asPaths(shapeOf(solid, false)), FillRule.EvenOdd, CUT_PRECISION)
    for (const bit of bits) cut = intersectD(cut, asPaths(image.crackShapes.get(bit)), FillRule.NonZero, CUT_PRECISION)
    if (bits.reduce((rest, bit) => rest & ~(1 << bit), label)) cut = intersectD(cut, asPaths(shapeOf(region, true)), FillRule.NonZero, CUT_PRECISION)
    return cut.length ? cut.map(path => path.map(({ x, y }) => [x, y])) : null
  }

  for (const [label, region] of overlaid) {
    const part = decompose(region, true, label, knownModel(region, true))
    const cut = exactCut(label, region)
    if (cut) painted.push({ ...part.base, pixels: region, smooth: false, cut })
    else painted.push({ ...part.base, pixels: part.base.matched, smooth: anySoft }, ...part.layers)
  }
  const layers = joinedBands(painted)
  layers.sort((a, b) => a.stops || b.stops ? !!b.stops - !!a.stops : (totals.get(b.colour) ?? 0) - (totals.get(a.colour) ?? 0) || a.colour - b.colour)
  const owner = new Int32Array(width * height).fill(HOLE)
  for (const pixel of solid) owner[pixel] = BASE
  for (const [index, layer] of layers.entries()) {
    for (const pixel of layer.pixels) owner[pixel] = index
  }
  for (const pixel of solid) {
    if (layers[owner[pixel]]?.stops) continue
    const sides = sidesOf(pixel)
    if (sides.some(side => owner[side] === owner[pixel])) continue
    const home = sides.find(side => owner[side] !== HOLE && (owner[side] === BASE ? base.stops : layers[owner[side]].stops) && within(colours[pixel], colours[side], STEP_EDGE))
    if (home !== undefined) owner[pixel] = owner[home]
  }
  for (const layer of layers) layer.pixels = []
  for (const pixel of solid) {
    if (owner[pixel] >= 0) layers[owner[pixel]].pixels.push(pixel)
  }
  function canSlide(from, x, y, index) {
    const target = y * width + x
    if (owner[target] <= index) return false
    const close = other => within(colours[from], colours[other], SLIDE_CONTRAST)
    return close(target) || sidesOf(target).every(other => owner[other] >= index || owner[other] !== HOLE && close(other))
  }
  function edgeUnder(pixels, index) {
    const reached = new Set()
    for (const pixel of pixels) {
      const x = pixel % width
      const y = Math.floor(pixel / width)
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const edge = nx === 0 || ny === 0 || nx === width - 1 || ny === height - 1
          if (edge && canSlide(pixel, nx, ny, index)) reached.add(ny * width + nx)
        }
      }
    }
    return Array.from(reached)
  }
  function grownUnder(pixels, index) {
    const grown = new Set(pixels)
    const inner = (x, y) => x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2
    for (const pixel of pixels) {
      const x = pixel % width
      const y = Math.floor(pixel / width)
      for (const [dx, dy] of SIDES) {
        if (inner(x + dx, y + dy) && canSlide(pixel, x + dx, y + dy, index)) grown.add((y + dy) * width + x + dx)
      }
    }
    for (const pixel of pixels) {
      const x = pixel % width
      const y = Math.floor(pixel / width)
      for (const dy of [-1, 1]) {
        for (const dx of [-1, 1]) {
          if (inner(x + dx, y + dy) && grown.has(y * width + x + dx) && grown.has((y + dy) * width + x) && canSlide(pixel, x + dx, y + dy, index)) grown.add((y + dy) * width + x + dx)
        }
      }
    }
    return Array.from(grown)
  }
  const stacked = layers.map((layer, index) => ({ ...layer, pixels: grownUnder(layer.pixels, index), edges: edgeUnder(layer.pixels, index), exact: layer.cut ?? shapeOf(layer.pixels, layer.smooth) }))
  function insetBase() {
    const depth = new Int32Array(width * height)
    let front = []
    for (const pixel of solid) {
      const x = pixel % width
      const y = Math.floor(pixel / width)
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || owner[pixel - 1] === HOLE || owner[pixel + 1] === HOLE || owner[pixel - width] === HOLE || owner[pixel + width] === HOLE) {
        depth[pixel] = 1
        front.push(pixel)
      }
    }
    for (let level = 2; front.length; level++) {
      const next = []
      for (const pixel of front) {
        for (const other of sidesOf(pixel)) {
          if (owner[other] === HOLE || depth[other]) continue
          depth[other] = level
          next.push(other)
        }
      }
      front = next
    }
    const shallowest = solid.reduce((least, pixel) => owner[pixel] === BASE ? Math.min(least, depth[pixel]) : least, Infinity)
    return solid.filter(pixel => depth[pixel] >= shallowest - 1)
  }
  const inset = holes ? insetBase() : null
  const finalBase = holes ? { ...base, masked: true, pixels: inset, exact: shapeOf(inset, false) } : base
  return { base: finalBase, layers: stacked, owner, shapeOf }
}

export function contains(area, rect) {
  return rect.left >= area.left && rect.right <= area.right && rect.top >= area.top && rect.bottom <= area.bottom
}

function coversTexel([a, b, c], x, y) {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
  const sides = [side(a, b), side(b, c), side(c, a)]
  return sides.every(value => value >= 0) || sides.every(value => value <= 0)
}

export function maskOf(rect, parts) {
  const width = rect.right - rect.left
  const mask = new Uint8Array(width * (rect.bottom - rect.top))
  for (const { left, top, right, bottom, triangle } of parts) {
    for (let y = top; y < bottom; y++) {
      if (!triangle) {
        mask.fill(1, (y - rect.top) * width + left - rect.left, (y - rect.top) * width + right - rect.left)
        continue
      }
      for (let x = left; x < right; x++) if (coversTexel(triangle, x + 0.5, y + 0.5)) mask[(y - rect.top) * width + x - rect.left] = 1
    }
  }
  return mask
}
