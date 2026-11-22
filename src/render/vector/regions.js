import { EndType, FillRule, JoinType, differenceD, inflatePathsD, intersectD, unionD } from "@countertype/clipper2-ts"
import { packed } from "../../lib/core/colour.js"
import { colourTotals, jump, majority, near, tally, within } from "./colours.js"
import { BASE_SHARE, STEP_EDGE, bandedOf, denoised, drawnNear, fadedModel, flatOf, joinedBands, modelOf, paintedModel, rampsOneWay, rising, segmentsOf, smoothBands, without } from "./models.js"
import { smoothStairs, trace } from "./trace.js"

const CUT_PRECISION = 3
const BLEND_REACH = 3
const SLIDE_CONTRAST = 48
const SOFT_LABEL = 1 << 16
const MAX_MODELS = 6
const LAYER_SHARE = 0.5
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const HOLE = -2
export const BASE = -1
const COVERED = -1
const PEEL_SHARE = 0.1
const MERGE_STEP = 2
const TEXEL_INSET = 0.02
const LEFTOVER_SHARE = 0.05
const CROSS_REACH = 1
const CUT_UNDER = 0.25

function asPaths(polygons) {
  return polygons.map(polygon => polygon.map(([x, y]) => ({ x, y })))
}

function asPolygons(paths) {
  return paths.map(path => path.map(({ x, y }) => [x, y]))
}

function islandsOf(loops) {
  const within = (loop, other) => loop !== other && insidePolygons([other], loop[0][0], loop[0][1])
  const outers = loops.filter(loop => loops.filter(other => within(loop, other)).length % 2 === 0)
  return outers.map(outer => [outer].concat(loops.filter(loop => !outers.includes(loop) && within(loop, outer) && !outers.some(other => other !== outer && within(other, outer) && within(loop, other)))))
}

function insidePolygons(polygons, x, y) {
  let crossings = 0
  for (const polygon of polygons) {
    for (const [index, [ax, ay]] of polygon.entries()) {
      const [bx, by] = polygon[(index + 1) % polygon.length]
      if (ay > y !== by > y && x < ax + (y - ay) * (bx - ax) / (by - ay)) crossings++
    }
  }
  return crossings % 2 === 1
}

export function analyse(image, rect, mask = null, outline = null) {
  const { data, width: atlasWidth, labels, gradient, fades } = image
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const colours = new Int32Array(width * height)
  const labelled = new Int32Array(width * height).fill(-1)
  const regions = new Map()
  const solid = []
  let holes = false
  let transparent = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = ((y + rect.top) * atlasWidth + x + rect.left) * 4
      const outside = mask && !mask[y * width + x]
      if (outside || data[at + 3] < 128) {
        holes = true
        if (!outside) transparent = true
        continue
      }
      const index = y * width + x
      colours[index] = packed(data, at)
      solid.push(index)
      const label = labels ? packed(labels, at) : 0
      labelled[index] = label
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

  const exactBits = image.crackShapes ? Array.from(image.crackShapes.keys()) : []
  const isExact = label => exactBits.some(bit => label & 1 << bit)
  const exactPart = label => exactBits.reduce((part, bit) => part | label & 1 << bit, 0)
  const overlaysOf = label => (label & ~exactPart(label)).toString(2).replaceAll("0", "").length
  const absorbed = new Map()
  function stepAcross(label, partner) {
    let sum = 0
    let count = 0
    for (const pixel of regions.get(label)) {
      for (const side of sidesOf(pixel)) {
        if (labelled[side] !== partner) continue
        sum += [0, 8, 16].reduce((most, shift) => Math.max(most, Math.abs((colours[pixel] >> shift & 255) - (colours[side] >> shift & 255))), 0)
        count++
      }
    }
    return count ? sum / count : Infinity
  }
  for (let merged = true; merged;) {
    merged = false
    for (const label of Array.from(regions.keys()).sort((a, b) => exactPart(b).toString(2).length - exactPart(a).toString(2).length)) {
      const partner = exactBits.map(bit => label & ~(1 << bit)).find(other => other !== label && regions.has(other) && stepAcross(label, other) <= MERGE_STEP)
      if (partner === undefined) continue
      for (const pixel of regions.get(label)) labelled[pixel] = partner
      regions.set(partner, regions.get(partner).concat(regions.get(label)))
      regions.delete(label)
      absorbed.set(partner, (absorbed.get(partner) ?? 0) | (absorbed.get(label) ?? 0) | label & ~partner)
      merged = true
      break
    }
  }
  const [main, ...overlaid] = Array.from(regions.entries()).sort((a, b) => isExact(a[0]) - isExact(b[0]) || b[1].length - a[1].length)
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
    const leftover = layers.reduce((sum, layer) => sum + layer.pixels.length, 0)
    const banded = leftover > region.length * LEFTOVER_SHARE && isGentle(region) && bandedOf(region, denoised(region, colours, width), width)
    if (banded) {
      const [first, ...others] = banded.sort((a, b) => b.matched.length - a.matched.length)
      return { base: { ...placedOn(first), banded: true, bandLabel: label }, layers: others.map(band => ({ ...placedOn(band), pixels: band.matched, smooth: false, banded: true, bandLabel: label })), banded: true }
    }
    if (!isGentle(region)) return { base: placedOn(largest), layers }
    const strays = layers.filter(layer => layer.pixels.every(index => drawnNear(largest, index, colours, width, STEP_EDGE)))
    const absorbed = strays.flatMap(layer => layer.pixels)
    return { base: placedOn({ ...largest, matched: (largest.matched ?? []).concat(absorbed) }), layers: layers.filter(layer => !strays.includes(layer)) }
  }

  const source = gradient?.faces.find(face => contains(face, rect))
  const fade = fades?.find(area => contains(area, rect))
  function knownModel(region, overlaid) {
    if (source) return paintedModel(source, rect, region, colours, width, overlaid)
    return fade ? fadedModel(fade, rect, region, colours, width) : null
  }
  const exactLabels = new Set(overlaid.map(([label]) => label).filter(isExact))
  const blended = []
  if (exactLabels.size) {
    const inMain = new Set(main[1])
    let edge = main[1].filter(pixel => sidesOf(pixel).some(side => exactLabels.has(labelled[side])))
    const seen = new Set(edge)
    for (let step = 0; step < BLEND_REACH && edge.length; step++) {
      blended.push(...edge)
      edge = Array.from(new Set(edge.flatMap(pixel => sidesOf(pixel)))).filter(side => inMain.has(side) && !seen.has(side))
      for (const pixel of edge) seen.add(pixel)
    }
  }
  const unblended = without(main[1], blended)
  const decomposed = decompose(unblended.length ? unblended : main[1], false, main[0], knownModel(main[1], false))
  const base = { ...decomposed.base, group: exactPart(main[0]) }
  const painted = decomposed.layers.map(layer => ({ ...layer, group: exactPart(main[0]), depth: overlaysOf(main[0]) }))
  const faceBits = exactBits.filter(bit => Array.from(regions.keys()).some(label => label & 1 << bit))
  const overlayOutlines = new Map()
  function overlayOutline(label) {
    const part = label & ~exactPart(label)
    if (!overlayOutlines.has(part)) overlayOutlines.set(part, asPaths(shapeOf(Array.from(regions).filter(([other]) => (other & ~exactPart(other)) === part).flatMap(([, list]) => list), true)))
    return overlayOutlines.get(part)
  }
  function faceShape() {
    const box = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]]
    const edge = transparent ? null : outline
    return intersectD(asPaths([box]), asPaths(edge ?? shapeOf(solid, false)), edge ? FillRule.NonZero : FillRule.EvenOdd, CUT_PRECISION)
  }
  function labelShape(label, skip = -1) {
    let cut = faceShape()
    for (const bit of exactBits.filter(bit => label & 1 << bit && bit !== skip)) cut = intersectD(cut, asPaths(image.crackShapes.get(bit).shape), FillRule.NonZero, CUT_PRECISION)
    for (const bit of faceBits) {
      if (!((label | (absorbed.get(label) ?? 0)) & 1 << bit)) cut = differenceD(cut, asPaths(image.crackShapes.get(bit).shape), FillRule.NonZero, CUT_PRECISION)
    }
    if (label & ~exactPart(label)) cut = intersectD(cut, overlayOutline(label), FillRule.NonZero, CUT_PRECISION)
    return cut
  }
  function nearPixels(list) {
    return inflatePathsD(asPaths(shapeOf(list, false)), CROSS_REACH, JoinType.Miter, EndType.Polygon, 2, CUT_PRECISION)
  }
  function exactCut(label, region) {
    if (!isExact(label)) return null
    let cut = labelShape(label)
    const near = nearPixels(region)
    for (const bit of exactBits.filter(bit => label & 1 << bit)) {
      let across = differenceD(intersectD(labelShape(label, bit), near, FillRule.NonZero, CUT_PRECISION), asPaths(image.crackShapes.get(bit).shape), FillRule.NonZero, CUT_PRECISION)
      const part = label & ~exactPart(label)
      const claimed = Array.from(regions).filter(([other]) => !(other & 1 << bit) && (other & ~exactPart(other)) === part).flatMap(([, list]) => list)
      if (claimed.length) across = differenceD(across, nearPixels(claimed), FillRule.NonZero, CUT_PRECISION)
      if (across.length) cut = unionD(cut, across, FillRule.NonZero, CUT_PRECISION)
    }
    return cut.length ? asPolygons(cut) : null
  }

  function centreIn(polygons, pixel) {
    return insidePolygons(polygons, pixel % width + rect.left + 0.5, Math.floor(pixel / width) + rect.top + 0.5)
  }

  function wholeIn(polygons, pixel) {
    return [[TEXEL_INSET, TEXEL_INSET], [1 - TEXEL_INSET, TEXEL_INSET], [TEXEL_INSET, 1 - TEXEL_INSET], [1 - TEXEL_INSET, 1 - TEXEL_INSET]].every(([dx, dy]) => insidePolygons(polygons, pixel % width + rect.left + dx, Math.floor(pixel / width) + rect.top + dy))
  }

  function cutFill(region, island) {
    const interior = region.filter(pixel => wholeIn(island, pixel))
    const clean = interior.length ? interior : region
    const columns = new Set(clean.map(pixel => pixel % width))
    const rows = new Set(clean.map(pixel => Math.floor(pixel / width)))
    const extended = clean.concat(region.filter(pixel => !columns.has(pixel % width) || !rows.has(Math.floor(pixel / width))))
    const known = knownModel(extended, true)
    if (known && (known.parts?.length ?? 1) === 1) return { ...placedOn(known.parts?.[0] ?? known), fitShare: 1 }
    const steps = model => model?.stops ? model.stops.filter((stop, index) => index && stop.t === model.stops[index - 1].t).length : 0
    const inside = modelOf(clean, colours, width, height, 0, true)
    const reaching = extended.length > clean.length ? modelOf(extended, colours, width, height, 0, true) : inside
    const chosen = steps(reaching) > steps(inside) ? inside : reaching
    if (!chosen) return { ...flatOf(region, colours), fitShare: 0 }
    return { ...placedOn(chosen), fitShare: chosen.matched.length / (chosen === inside ? clean : extended).length }
  }


  for (const [label, region] of overlaid) {
    const cut = exactCut(label, region)
    const group = exactPart(label)
    if (cut) {
      const tones = exactBits.filter(bit => label & 1 << bit).map(bit => image.crackShapes.get(bit).tones).find(list => list.length)
      const pieces = tones ? tones.map(tone => asPolygons(intersectD(asPaths(cut), asPaths(tone), FillRule.NonZero, CUT_PRECISION))) : [cut]
      let rest = region
      for (const [index, piece] of pieces.entries()) {
        const own = index === pieces.length - 1 ? rest : rest.filter(pixel => centreIn(piece, pixel))
        rest = without(rest, own)
        if (!piece.length || !own.length) continue
        const islands = islandsOf(piece).map(island => ({ island, shown: own.filter(pixel => centreIn(island, pixel)) })).filter(({ shown }) => shown.length)
        if (!islands.length) islands.push({ island: piece, shown: own })
        const placed = new Set(islands.flatMap(({ shown }) => shown))
        islands[0].shown = islands[0].shown.concat(own.filter(pixel => !placed.has(pixel)))
        const joint = islands.length > 1 ? cutFill(own, piece) : null
        for (const { island, shown } of islands) painted.push({ ...(joint?.fitShare >= BASE_SHARE ? joint : cutFill(shown, island)), pixels: shown, smooth: false, cut: island, group, depth: overlaysOf(label) })
      }
      continue
    }
    const part = decompose(region, true, label, knownModel(region, true))
    const shape = !part.banded && faceBits.length ? asPolygons(labelShape(label)) : []
    const straddling = shape.length ? part.layers.filter(layer => layer.pixels.every(pixel => !wholeIn(shape, pixel))) : []
    const matched = (part.base.matched ?? []).concat(straddling.flatMap(layer => layer.pixels))
    painted.push({ ...part.base, pixels: matched, smooth: anySoft && !part.banded, group, depth: overlaysOf(label), ...(shape.length && { cut: shape }) }, ...part.layers.filter(layer => !straddling.includes(layer)).map(layer => ({ ...layer, group, depth: overlaysOf(label) })))
  }
  const layers = joinedBands(painted)
  layers.sort((a, b) => a.depth - b.depth || (a.stops || b.stops ? !!b.stops - !!a.stops : (totals.get(b.colour) ?? 0) - (totals.get(a.colour) ?? 0) || a.colour - b.colour))
  const outlines = new Map()
  for (const [index, layer] of layers.entries()) {
    if (!layer.strip) continue
    const { axis, from, to } = layer.strip
    const same = layers.map((other, at) => ({ other, at })).filter(({ other }) => other !== layer && other.strip && other.bandLabel === layer.bandLabel).concat(base.strip && base.bandLabel === layer.bandLabel ? [{ other: base, at: -1 }] : [])
    const after = same.filter(({ other }) => other.strip.from >= to).sort((a, b) => a.other.strip.from - b.other.strip.from)[0]
    const before = same.filter(({ other }) => other.strip.to <= from).sort((a, b) => b.other.strip.to - a.other.strip.to)[0]
    const low = before ? before.other.strip.to - (before.at > index ? 1 : 0) : 0
    const high = after ? after.other.strip.from + (after.at > index ? 1 : 0) : axis[0] ? height : width
    const strip = axis[0] ? [[rect.left, rect.top + low], [rect.right, rect.top + low], [rect.right, rect.top + high], [rect.left, rect.top + high]] : [[rect.left + low, rect.top], [rect.left + high, rect.top], [rect.left + high, rect.bottom], [rect.left + low, rect.bottom]]
    if (!outlines.has(layer.bandLabel)) outlines.set(layer.bandLabel, labelShape(layer.bandLabel))
    const cut = intersectD(asPaths([strip]), outlines.get(layer.bandLabel), FillRule.NonZero, CUT_PRECISION)
    if (cut.length) layer.cut = asPolygons(cut)
  }
  let above = []
  for (const layer of layers.toReversed()) {
    if (!layer.cut) continue
    const shape = asPaths(layer.cut)
    const hidden = above.length ? intersectD(inflatePathsD(shape, CUT_UNDER, JoinType.Miter, EndType.Polygon, 2, CUT_PRECISION), above, FillRule.NonZero, CUT_PRECISION) : []
    if (hidden.length) layer.cut = asPolygons(unionD(shape, hidden, FillRule.NonZero, CUT_PRECISION))
    above = above.length ? unionD(above, shape, FillRule.NonZero, CUT_PRECISION) : shape
  }
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
  const finalBase = holes ? { ...base, masked: true, transparent, pixels: inset, exact: shapeOf(inset, false) } : base
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
