import * as THREE from "three"
import { gradientLine, gradientStops } from "./material.js"
import { clamp } from "./maths.js"
import { SAMPLES, outputSize, screenBounds } from "./render.js"

const EPSILON = 1e-4
const SLIVER = 1e-3
const BLEED = 1 / 512
const GROW = 0.05
const MIN_SHARED = 0.05
const SHARED_ANGLE = 0.01
const SHARED_OFFSET = 0.1
const FLIP = 1e-4
const TOLERANCE = 2
const STOP_TOLERANCE = 1.5
const HARD_EDGE = 24
const STEP_EDGE = 6
const PIXEL_STEP = 2
const PIXEL_FLAT = 1
const PIXEL_REACH = 2
const SLIDE_CONTRAST = 48
const BAND_STEP = 16
const BAND_WOBBLE = 2
const MIN_BANDS = 4
const MIN_BAND_ROWS = 2
const SOFT_LABEL = 1 << 16
const STEP_SLOPE = 3
const MAX_STOPS = 128
const MAX_MODELS = 6
const BASE_SHARE = 0.8
const LAYER_SHARE = 0.5
const DIAGONAL_SHARE = 0.95
const PEEL_SHARE = 0.1
const MIN_BIN_SHARE = 0.2
const SEAM = 0.5
const JOIN_REACH = 2
const JOIN_TRIM = 0.25
const PLANE_ERROR = 1e-2
const CROP_MARGIN = 1 / (SAMPLES * 2)
const STAIR = 0.8
const STAIR_POINTS = 6
const FIT_ERROR = 1 / 4096
const SPACING_ERROR = 1 / 8192
const MAX_SPLITS = 5

function split(points, normal, constant) {
  const distances = points.map(point => normal.dot(point) - constant)
  if (distances.every(distance => distance >= -EPSILON)) return [points, null]
  if (distances.every(distance => distance <= EPSILON)) return [null, points]
  const above = []
  const below = []
  for (const [index, point] of points.entries()) {
    const next = (index + 1) % points.length
    const from = distances[index]
    const to = distances[next]
    if (from >= -EPSILON) above.push(point)
    if (from <= EPSILON) below.push(point)
    if (from > EPSILON && to < -EPSILON || from < -EPSILON && to > EPSILON) {
      const crossing = point.clone().lerp(points[next], from / (from - to))
      above.push(crossing)
      below.push(crossing)
    }
  }
  return [above.length > 2 ? above : null, below.length > 2 ? below : null]
}

function toViewer(view, point) {
  return view.perspective ? view.eye.clone().sub(point) : view.direction.clone().negate()
}

function hexOf(colour) {
  return `#${[colour & 255, colour >> 8 & 255, colour >> 16 & 255].map(value => value.toString(16).padStart(2, "0")).join("")}`
}

function near(a, b) {
  return Math.abs((a & 255) - (b & 255)) <= TOLERANCE && Math.abs((a >> 8 & 255) - (b >> 8 & 255)) <= TOLERANCE && Math.abs((a >> 16 & 255) - (b >> 16 & 255)) <= TOLERANCE
}

function jump(a, b) {
  return Math.abs((a & 255) - (b & 255)) > HARD_EDGE || Math.abs((a >> 8 & 255) - (b >> 8 & 255)) > HARD_EDGE || Math.abs((a >> 16 & 255) - (b >> 16 & 255)) > HARD_EDGE
}

function change(a, b) {
  return [0, 8, 16].map(shift => (b >> shift & 255) - (a >> shift & 255))
}

function edgesOf(chosen) {
  const edges = new Set()
  for (const [bin, colour] of chosen) {
    const next = chosen.get(bin + 1)
    if (next === undefined) continue
    const step = change(colour, next)
    const size = Math.hypot(...step)
    function slope(from, to) {
      if (from === undefined || to === undefined) return 0
      return change(from, to).reduce((sum, value, channel) => sum + value * step[channel], 0) / size
    }
    function flatFrom(start, from, direction) {
      for (let reach = 1; reach <= PIXEL_REACH; reach++) {
        const other = chosen.get(start + direction * reach)
        if (other === undefined) return true
        if (change(from, other).some(value => Math.abs(value) > PIXEL_FLAT)) return false
      }
      return true
    }
    const largest = Math.max(...step.map(Math.abs))
    const lone = largest > STEP_EDGE && slope(chosen.get(bin - 1), colour) < size / STEP_SLOPE && slope(next, chosen.get(bin + 2)) < size / STEP_SLOPE
    const pixel = largest > PIXEL_STEP && flatFrom(bin, colour, -1) && flatFrom(bin + 1, next, 1)
    if (jump(colour, next) || lone || pixel) edges.add(bin)
  }
  return edges
}

function mixed(a, b, amount) {
  return [0, 8, 16].reduce((colour, shift) => colour | Math.round((a >> shift & 255) + ((b >> shift & 255) - (a >> shift & 255)) * amount) << shift, 0)
}

function majority(counts) {
  let best = 0
  let most = -1
  for (const [colour, count] of counts) {
    if (count <= most) continue
    best = colour
    most = count
  }
  return best
}

function simplifyStops(points) {
  const keep = new Set([0, points.length - 1])
  const pending = [[0, points.length - 1]]
  while (pending.length) {
    const [from, to] = pending.pop()
    let worst = -1
    let error = STOP_TOLERANCE
    for (let index = from + 1; index < to; index++) {
      const span = points[to].t - points[from].t
      const amount = span ? (points[index].t - points[from].t) / span : 0
      for (const shift of [0, 8, 16]) {
        const a = points[from].colour >> shift & 255
        const b = points[to].colour >> shift & 255
        const miss = Math.abs(a + (b - a) * amount - (points[index].colour >> shift & 255))
        if (miss > error) {
          error = miss
          worst = index
        }
      }
    }
    if (worst < 0) continue
    keep.add(worst)
    pending.push([from, worst], [worst, to])
  }
  return Array.from(keep).sort((a, b) => a - b).map(index => points[index])
}

function stepSize(a, b) {
  return Math.max(...change(a, b).map(Math.abs))
}

function averaged(values, from, to, row) {
  const reach = Math.min(row - from, to - row, values.reach)
  const sum = [0, 0, 0]
  for (let other = row - reach; other <= row + reach; other++) {
    for (let channel = 0; channel < 3; channel++) sum[channel] += values[other][channel]
  }
  return sum.map(value => value / (reach * 2 + 1))
}

function smoothRun(rows, from, to, smooth) {
  const sizes = []
  for (let row = from; row < to; row++) sizes.push(stepSize(rows[row], rows[row + 1]))
  const largest = Math.max(...sizes)
  if (largest < 2) return
  const jumps = []
  for (const [offset, size] of sizes.entries()) {
    if (size * 2 >= largest) jumps.push(offset)
  }
  if (jumps.length < MIN_BANDS - 1) return
  const gaps = jumps.slice(1).map((jump, index) => jump - jumps[index]).sort((a, b) => a - b)
  const spacing = gaps[Math.floor(gaps.length * 0.75)]
  if (spacing < MIN_BAND_ROWS) return
  let values = rows.map(colour => [colour & 255, colour >> 8 & 255, colour >> 16 & 255])
  values.reach = Math.floor(spacing / 2)
  for (let pass = 0; pass < 2; pass++) {
    const next = values.slice()
    for (let row = from; row <= to; row++) next[row] = averaged(values, from, to, row)
    next.reach = values.reach
    values = next
  }
  for (let row = from; row <= to; row++) smooth.set(row, values[row].reduce((colour, value, channel) => colour | Math.round(value) << channel * 8, 0))
}

function smoothBands(rows) {
  const smooth = new Map()
  let from = 0
  while (from < rows.length - 1) {
    let to = from
    while (to < rows.length - 1 && stepSize(rows[to], rows[to + 1]) <= BAND_STEP) {
      const net = change(rows[from], rows[to])
      if (change(rows[to], rows[to + 1]).some((value, channel) => value * net[channel] < 0 && Math.abs(value) > BAND_WOBBLE)) break
      to++
    }
    if (to > from) smoothRun(rows, from, to, smooth)
    from = Math.max(to, from + 1)
  }
  return smooth
}

function fitAxis(list, colours, width, axis, exact, bands) {
  const bins = new Map()
  const binOf = index => Math.floor((index % width + 0.5) * axis[0] + (Math.floor(index / width) + 0.5) * axis[1] + 1e-6)
  for (const index of list) {
    const bin = binOf(index)
    if (!bins.has(bin)) bins.set(bin, new Map())
    const counts = bins.get(bin)
    counts.set(colours[index], (counts.get(colours[index]) ?? 0) + 1)
  }
  const totals = new Map(Array.from(bins, ([bin, counts]) => [bin, Array.from(counts.values()).reduce((sum, count) => sum + count, 0)]))
  const fullest = Math.max(...totals.values())
  const chosen = new Map(Array.from(bins).filter(([bin]) => exact || totals.get(bin) >= fullest * MIN_BIN_SHARE).map(([bin, counts]) => [bin, majority(counts)]))
  const reliable = Array.from(chosen.keys()).sort((a, b) => a - b)
  for (const [bin, counts] of bins) {
    if (chosen.has(bin)) continue
    const colour = majority(counts)
    const after = reliable.findIndex(other => other > bin)
    const low = after < 0 ? reliable.at(-1) : after > 0 ? reliable[after - 1] : reliable[0]
    const high = after < 0 ? reliable.at(-1) : reliable[after]
    const expected = high === low ? chosen.get(low) : mixed(chosen.get(low), chosen.get(high), (bin - low) / (high - low))
    if (!jump(colour, expected)) chosen.set(bin, colour)
  }
  const edges = edgesOf(chosen)
  const shown = axis[1] === 1 && bands?.size ? new Map(Array.from(chosen, ([bin, colour]) => [bin, bands.get(bin) ?? colour])) : chosen
  const shownEdges = shown === chosen ? edges : edgesOf(shown)
  function fits(index) {
    const bin = binOf(index)
    const own = chosen.get(bin)
    if (own === undefined) return false
    if (near(colours[index], own)) return true
    return [bin - 1, bin + 1].some(other => chosen.has(other) && !edges.has(Math.min(bin, other)) && near(colours[index], chosen.get(other)))
  }
  const matched = list.filter(fits)
  const ordered = Array.from(shown).sort((a, b) => a[0] - b[0])
  const points = [{ t: ordered[0][0], colour: ordered[0][1] }]
  for (const [position, [bin, colour]] of ordered.entries()) {
    const next = ordered[position + 1]
    if (next && (next[0] !== bin + 1 || shownEdges.has(bin))) points.push({ t: bin, colour }, { t: bin + 1, colour }, { t: bin + 1, colour: next[1] })
    else points.push({ t: bin + 0.5, colour })
  }
  points.push({ t: ordered.at(-1)[0] + 1, colour: ordered.at(-1)[1] })
  return { axis, matched, stops: simplifyStops(points) }
}

function diagonalOf(list, colours, width, height) {
  let dx = 0
  let dy = 0
  const brightness = colour => (colour & 255) + (colour >> 8 & 255) + (colour >> 16 & 255)
  const present = new Set(list)
  for (const index of list) {
    if (index % width < width - 1 && present.has(index + 1)) dx += brightness(colours[index + 1]) - brightness(colours[index])
    if (index < width * (height - 1) && present.has(index + width)) dy += brightness(colours[index + width]) - brightness(colours[index])
  }
  const length = Math.hypot(dx, dy)
  if (!length || Math.abs(dx) / length < 0.02 || Math.abs(dy) / length < 0.02) return null
  return [dx / length, dy / length]
}

function segmentsOf(model, width) {
  if (!model.stops) return [model]
  const parts = [[]]
  for (const [index, stop] of model.stops.entries()) {
    if (index && stop.t === model.stops[index - 1].t) parts.push([])
    parts.at(-1).push(stop)
  }
  if (parts.length === 1) return [model]
  const [ax, ay] = model.axis
  const owners = parts.map(stops => ({ axis: model.axis, stops, matched: [] }))
  for (const index of model.matched) {
    const bin = Math.floor((index % width + 0.5) * ax + (Math.floor(index / width) + 0.5) * ay + 1e-6)
    const owner = owners.find(({ stops }) => bin < stops.at(-1).t) ?? owners.at(-1)
    owner.matched.push(index)
  }
  return owners.filter(owner => owner.matched.length).map(owner => owner.stops.every(stop => stop.colour === owner.stops[0].colour) ? { colour: owner.stops[0].colour, matched: owner.matched } : owner)
}

function flatOf(list, colours) {
  const counts = new Map()
  for (const index of list) counts.set(colours[index], (counts.get(colours[index]) ?? 0) + 1)
  const colour = majority(counts)
  return { colour, matched: list.filter(index => near(colours[index], colour)) }
}

function modelOf(list, colours, width, height, share, exact, bands) {
  const flat = flatOf(list, colours)
  if (!bands?.size && flat.matched.length >= list.length * 0.98) return flat
  let best = null
  for (const axis of [[0, 1], [1, 0]]) {
    const fit = fitAxis(list, colours, width, axis, exact, bands)
    if (fit.stops.length > MAX_STOPS) continue
    if (!best || fit.matched.length > best.matched.length) best = fit
  }
  if (!best || best.matched.length < list.length * BASE_SHARE) {
    const diagonal = diagonalOf(list, colours, width, height)
    const fit = diagonal && fitAxis(list, colours, width, diagonal, exact)
    if (fit && fit.stops.length <= MAX_STOPS && fit.matched.length >= list.length * DIAGONAL_SHARE && fit.stops.every((stop, index) => !index || stop.t > fit.stops[index - 1].t)) best = fit
  }
  if (best && best.matched.length >= list.length * share) return best
  return flat.matched.length >= list.length * share ? flat : null
}

function trace(mask, width, height) {
  const outgoing = new Map()
  function add(fromX, fromY, toX, toY) {
    const key = fromY * (width + 1) + fromX
    if (!outgoing.has(key)) outgoing.set(key, [])
    outgoing.get(key).push([toX, toY])
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      if (y === 0 || !mask[(y - 1) * width + x]) add(x, y, x + 1, y)
      if (x === width - 1 || !mask[y * width + x + 1]) add(x + 1, y, x + 1, y + 1)
      if (y === height - 1 || !mask[(y + 1) * width + x]) add(x + 1, y + 1, x, y + 1)
      if (x === 0 || !mask[y * width + x - 1]) add(x, y + 1, x, y)
    }
  }
  const loops = []
  for (const [start, list] of outgoing) {
    while (list.length) {
      const loop = []
      let x = start % (width + 1)
      let y = Math.floor(start / (width + 1))
      let key = start
      do {
        loop.push([x, y])
        const [nextX, nextY] = outgoing.get(key).pop()
        x = nextX
        y = nextY
        key = y * (width + 1) + x
      } while (key !== start)
      loops.push(loop.filter((point, index) => {
        const before = loop[(index + loop.length - 1) % loop.length]
        const after = loop[(index + 1) % loop.length]
        return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0])
      }))
    }
  }
  return loops
}

function simplifyRun(run) {
  const keep = new Set([0, run.length - 1])
  const pending = [[0, run.length - 1]]
  while (pending.length) {
    const [from, to] = pending.pop()
    const [ax, ay] = run[from]
    const [bx, by] = run[to]
    const length = Math.hypot(bx - ax, by - ay) || 1
    let worst = -1
    let error = STAIR
    for (let index = from + 1; index < to; index++) {
      const miss = Math.abs((bx - ax) * (ay - run[index][1]) - (ax - run[index][0]) * (by - ay)) / length
      if (miss <= error) continue
      error = miss
      worst = index
    }
    if (worst < 0) continue
    keep.add(worst)
    pending.push([from, worst], [worst, to])
  }
  return Array.from(keep).sort((a, b) => a - b).map(index => run[index])
}

function monotone(run) {
  let stepX = 0
  let stepY = 0
  for (let index = 1; index < run.length; index++) {
    const dx = Math.sign(run[index][0] - run[index - 1][0])
    const dy = Math.sign(run[index][1] - run[index - 1][1])
    if (dx && stepX && dx !== stepX || dy && stepY && dy !== stepY) return false
    stepX ||= dx
    stepY ||= dy
  }
  return true
}

function straighten(loop) {
  const size = loop.length
  const short = loop.map((point, index) => {
    const next = loop[(index + 1) % size]
    return Math.abs(next[0] - point[0]) + Math.abs(next[1] - point[1]) === 1
  })
  const inRun = index => short[index] || short[(index + size - 1) % size]
  const start = loop.findIndex((point, index) => !inRun(index))
  if (start < 0 || !short.includes(true)) return loop
  const result = []
  let run = []
  function finish() {
    if (run.length >= STAIR_POINTS && monotone(run)) result.push(run[0], ...simplifyRun(run.slice(1).map((point, index) => [(point[0] + run[index][0]) / 2, (point[1] + run[index][1]) / 2])), run.at(-1))
    else result.push(...run)
    run = []
  }
  for (let offset = 0; offset < size; offset++) {
    const index = (start + offset) % size
    if (inRun(index)) {
      run.push(loop[index])
      continue
    }
    finish()
    result.push(loop[index])
  }
  finish()
  return result
}

function analyse(image, rect) {
  const { data, width: atlasWidth, labels } = image
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const colours = new Int32Array(width * height)
  const regions = new Map()
  const solid = []
  let holes = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = ((y + rect.top) * atlasWidth + x + rect.left) * 4
      if (data[at + 3] < 128) {
        holes = true
        continue
      }
      const index = y * width + x
      colours[index] = data[at] | data[at + 1] << 8 | data[at + 2] << 16
      solid.push(index)
      const label = labels ? labels[at] | labels[at + 1] << 8 | labels[at + 2] << 16 : 0
      if (!regions.has(label)) regions.set(label, [])
      regions.get(label).push(index)
    }
  }
  if (!solid.length) return null

  function shapeOf(list, smooth) {
    const mask = new Uint8Array(width * height)
    for (const index of list) mask[index] = 1
    return trace(mask, width, height).map(loop => (smooth ? straighten(loop) : loop).map(([x, y]) => [x + rect.left, y + rect.top]))
  }

  function placedOn(model) {
    if (!model.stops) return model
    const shift = model.axis[0] * rect.left + model.axis[1] * rect.top
    return { ...model, stops: model.stops.map(stop => ({ t: stop.t + shift, colour: stop.colour })) }
  }

  const [main, ...overlaid] = Array.from(regions.entries()).sort((a, b) => b[1].length - a[1].length)
  const anySoft = main[0] >= SOFT_LABEL || overlaid.some(([label]) => label >= SOFT_LABEL)

  function bandsOf(label) {
    const COVERED = -1
    function rowColour(y) {
      const counts = new Map()
      let solid = false
      function tally(x) {
        const at = (y * atlasWidth + x) * 4
        if (data[at + 3] < 128) return
        solid = true
        if (labels && (labels[at] | labels[at + 1] << 8 | labels[at + 2] << 16) !== label) return
        const colour = data[at] | data[at + 1] << 8 | data[at + 2] << 16
        counts.set(colour, (counts.get(colour) ?? 0) + 1)
      }
      for (let x = rect.left; x < rect.right; x++) tally(x)
      for (let reach = 1; !counts.size && (rect.left - reach >= 0 || rect.right - 1 + reach < atlasWidth); reach++) {
        if (rect.left - reach >= 0) tally(rect.left - reach)
        if (rect.right - 1 + reach < atlasWidth) tally(rect.right - 1 + reach)
      }
      return counts.size ? majority(counts) : solid ? COVERED : null
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
    const gentle = (a, b) => change(colours[a], colours[b]).every(value => Math.abs(value) <= STEP_EDGE)
    return region.every(index => (index % width === width - 1 || !present.has(index + 1) || gentle(index, index + 1)) && (!present.has(index + width) || gentle(index, index + width)))
  }

  function decompose(region, exact) {
    let free = region
    function take(matched) {
      const gone = new Set(matched)
      free = free.filter(index => !gone.has(index))
    }
    const layers = []
    let fitted = modelOf(free, colours, width, height, BASE_SHARE, exact, exact ? null : bandsOf(main[0])) ?? flatOf(free, colours)
    if (fitted.stops?.some((stop, index) => index && stop.t === fitted.stops[index - 1].t)) {
      const peeled = flatOf(free, colours)
      const gone = new Set(peeled.matched)
      const remainder = free.filter(index => !gone.has(index))
      const trial = peeled.matched.length >= free.length * PEEL_SHARE && remainder.length ? modelOf(remainder, colours, width, height, BASE_SHARE, exact) : null
      if (trial?.stops && trial.stops.every((stop, index) => !index || stop.t > trial.stops[index - 1].t)) {
        layers.push({ ...peeled, pixels: peeled.matched, smooth: anySoft })
        take(peeled.matched)
        fitted = trial
      }
    }
    const [largest, ...others] = segmentsOf(fitted, width).sort((a, b) => b.matched.length - a.matched.length)
    take(fitted.matched)
    for (const segment of others) layers.push({ ...placedOn(segment), pixels: segment.matched, smooth: false })
    const continuous = anySoft || isGentle(region)
    for (let round = 0; continuous && round < MAX_MODELS && free.length; round++) {
      const model = modelOf(free, colours, width, height, LAYER_SHARE, exact)
      if (!model) break
      for (const segment of segmentsOf(model, width)) layers.push({ ...placedOn(segment), pixels: segment.matched, smooth: true })
      take(model.matched)
    }
    const rest = new Map()
    for (const index of free) {
      if (!rest.has(colours[index])) rest.set(colours[index], [])
      rest.get(colours[index]).push(index)
    }
    for (const [colour, list] of rest) layers.push({ colour, pixels: list, smooth: false })
    return { base: placedOn(largest), layers }
  }

  const { base, layers } = decompose(main[1], false)
  for (const [, region] of overlaid) {
    const part = decompose(region, true)
    layers.push({ ...part.base, pixels: part.base.matched, smooth: anySoft }, ...part.layers)
  }
  const HOLE = -2
  const BASE = -1
  const owner = new Int32Array(width * height).fill(HOLE)
  for (const pixel of solid) owner[pixel] = BASE
  for (const [index, layer] of layers.entries()) {
    for (const pixel of layer.pixels) owner[pixel] = index
  }
  function touchesEarlier(x, y, index) {
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (owner[ny * width + nx] < index) return true
      }
    }
    return false
  }
  function canSlide(from, x, y, index) {
    const target = y * width + x
    if (owner[target] <= index) return false
    return !touchesEarlier(x, y, index) || change(colours[from], colours[target]).every(value => Math.abs(value) <= SLIDE_CONTRAST)
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
    for (const pixel of pixels) {
      const x = pixel % width
      const y = Math.floor(pixel / width)
      for (let ny = Math.max(1, y - 1); ny <= Math.min(height - 2, y + 1); ny++) {
        for (let nx = Math.max(1, x - 1); nx <= Math.min(width - 2, x + 1); nx++) {
          if (canSlide(pixel, nx, ny, index)) grown.add(ny * width + nx)
        }
      }
    }
    return Array.from(grown)
  }
  const stacked = layers.map((layer, index) => ({ ...layer, pixels: grownUnder(layer.pixels, index), edges: edgeUnder(layer.pixels, index), exact: shapeOf(layer.pixels, layer.smooth) }))
  const finalBase = holes ? { ...base, masked: true, pixels: solid, exact: shapeOf(solid, false) } : base
  return { base: finalBase, layers: stacked, owner, shapeOf }
}

function imageOf(texture, cache) {
  if (!cache.has(texture)) {
    const { width, height } = texture.image
    cache.set(texture, { data: texture.image.getContext("2d").getImageData(0, 0, width, height).data, width, height, labels: texture.userData.labels?.() ?? null, analyses: new Map() })
  }
  return cache.get(texture)
}

function materialColour(material) {
  return parseInt(material.color.getHexString().replace(/(..)(..)(..)/, "$3$2$1"), 16)
}

function facesOf(mesh, view, project, cache) {
  const { position, uv } = mesh.geometry.attributes
  const mirrored = mesh.matrixWorld.determinant() < 0
  const showsBack = mesh.material.side === THREE.BackSide
  const image = mesh.material.map ? imageOf(mesh.material.map, cache) : null
  const faces = []
  for (let start = 0; start < position.count; start += 6) {
    const corners = [0, 1, 2, 5].map(offset => new THREE.Vector3().fromBufferAttribute(position, start + offset).applyMatrix4(mesh.matrixWorld))
    const normal = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]))
    if (normal.lengthSq() < EPSILON * EPSILON) continue
    if (mirrored) normal.negate()
    if (normal.dot(toViewer(view, corners[0])) > 0 === showsBack) continue
    let analysis = { base: { colour: materialColour(mesh.material), shape: null }, layers: [] }
    let texels = null
    let rect = null
    if (image) {
      texels = [0, 1, 2, 5].map(offset => [Math.round(uv.getX(start + offset) * image.width), Math.round((1 - uv.getY(start + offset)) * image.height)])
      const xs = texels.map(texel => texel[0])
      const ys = texels.map(texel => texel[1])
      rect = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
      if (rect.right <= rect.left || rect.bottom <= rect.top) {
        rect.left = Math.floor(uv.getX(start) * image.width)
        rect.top = Math.floor((1 - uv.getY(start)) * image.height)
        rect.right = rect.left + 1
        rect.bottom = rect.top + 1
      }
      const key = `${rect.left},${rect.top},${rect.right},${rect.bottom}`
      if (!image.analyses.has(key)) image.analyses.set(key, analyse(image, rect))
      analysis = image.analyses.get(key)
      if (!analysis) continue
    }
    const points = view.perspective ? split(corners, view.direction, view.direction.dot(view.eye) + view.near)[0] : corners
    if (!points) continue
    const screen = points.map(project)
    const facing = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).normalize()
    faces.push({ index: faces.length, corners, texels, rect, image, analysis, points, facing, normal: normal.dot(toViewer(view, corners[0])) < 0 ? normal.negate().normalize() : normal.normalize(), box: { minX: Math.min(...screen.map(point => point[0])), maxX: Math.max(...screen.map(point => point[0])), minY: Math.min(...screen.map(point => point[1])), maxY: Math.max(...screen.map(point => point[1])) } })
  }
  return faces
}

function worldMap(face) {
  const [c0, c1, , c3] = face.corners
  const [t0, t1, , t3] = face.texels
  const ax = t1[0] - t0[0]
  const ay = t1[1] - t0[1]
  const bx = t3[0] - t0[0]
  const by = t3[1] - t0[1]
  const determinant = ax * by - ay * bx
  const toOne = c1.clone().sub(c0)
  const toTwo = c3.clone().sub(c0)
  return (x, y) => {
    const dx = x - t0[0]
    const dy = y - t0[1]
    return c0.clone().addScaledVector(toOne, (dx * by - dy * bx) / determinant).addScaledVector(toTwo, (ax * dy - ay * dx) / determinant)
  }
}

function occluderOf(face, view) {
  const middle = face.points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(face.points.length)
  const edges = face.points.map((from, index) => {
    const to = face.points[(index + 1) % face.points.length]
    const normal = view.perspective ? from.clone().sub(view.eye).cross(to.clone().sub(view.eye)) : to.clone().sub(from).cross(view.direction)
    if (normal.dot(middle.clone().sub(from)) > 0) normal.negate()
    normal.normalize()
    return { normal, constant: normal.dot(from) }
  })
  return { face, normal: face.normal, constant: face.normal.dot(face.points[0]), edges }
}

function overlaps(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

function hide(pieces, occluder) {
  const left = []
  for (const piece of pieces) {
    const [ahead, behind] = split(piece, occluder.normal, occluder.constant)
    const kept = ahead ? [ahead] : []
    let rest = behind
    for (const edge of occluder.edges) {
      if (!rest) break
      const [outside, inside] = split(rest, edge.normal, edge.constant)
      if (outside) kept.push(outside)
      rest = inside
    }
    if (rest) left.push(...kept)
    else left.push(piece)
  }
  return left
}

function hideAll(pieces, face, occluders) {
  let left = pieces
  for (const occluder of occluders) {
    if (!left.length) break
    if (occluder.face !== face && overlaps(face.box, occluder.face.box)) left = hide(left, occluder)
  }
  return left
}

function grown(polygon) {
  const middleX = polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length
  const middleY = polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length
  return polygon.map(([x, y]) => {
    const length = Math.hypot(x - middleX, y - middleY) || 1
    return [x + (x - middleX) / length * GROW, y + (y - middleY) / length * GROW]
  })
}

function area(polygon) {
  return Math.abs(polygon.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length]
    return sum + x * nextY - nextX * y
  }, 0)) / 2
}

function sameWinding(polygon) {
  const signed = polygon.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length]
    return sum + x * nextY - nextX * y
  }, 0)
  return signed < 0 ? polygon.toReversed() : polygon
}

function insideFace(point, face) {
  return face.corners.every((corner, index) => {
    const next = face.corners[(index + 1) % face.corners.length]
    return next.clone().sub(corner).cross(point.clone().sub(corner)).dot(face.facing) >= -EPSILON
  })
}

function neighbourOf(face, others, point) {
  return others.find(other => other !== face && other.image && Math.abs(other.normal.dot(face.normal) - 1) < EPSILON && Math.abs(other.normal.dot(point) - other.normal.dot(other.corners[0])) < PLANE_ERROR && insideFace(point, other))
}

function colourAt(face, x, y) {
  const { data, width } = face.image
  const at = (clamp(Math.floor(y), face.rect.top, face.rect.bottom - 1) * width + clamp(Math.floor(x), face.rect.left, face.rect.right - 1)) * 4
  return data[at + 3] < 128 ? null : data[at] | data[at + 1] << 8 | data[at + 2] << 16
}

function texelOf(face, point) {
  const [c0, c1, , c3] = face.corners
  const [t0, t1, , t3] = face.texels
  const across = c1.clone().sub(c0)
  const down = c3.clone().sub(c0)
  const offset = point.clone().sub(c0)
  const u = offset.dot(across) / across.lengthSq()
  const v = offset.dot(down) / down.lengthSq()
  return [t0[0] + u * (t1[0] - t0[0]) + v * (t3[0] - t0[0]), t0[1] + u * (t1[1] - t0[1]) + v * (t3[1] - t0[1])]
}

function layerOwns(face, x, y) {
  const { left, top, right, bottom } = face.rect
  const column = clamp(Math.floor(x), left, right - 1) - left
  const row = clamp(Math.floor(y), top, bottom - 1) - top
  return face.analysis.owner?.[row * (right - left) + column] >= 0
}

function joinKind(face, others, toWorld, x, y, dx, dy) {
  const point = toWorld(x + dx, y + dy)
  const other = neighbourOf(face, others, point)
  if (!other) return null
  const [texelX, texelY] = texelOf(other, point)
  const own = colourAt(face, x - dx, y - dy)
  const beyond = colourAt(other, texelX, texelY)
  if (own === null || beyond === null) return null
  if (near(own, beyond)) return "over"
  if (!layerOwns(other, texelX, texelY)) return other
  return other.index > face.index ? "under" : null
}

function joinsOf(face, loop, others, toWorld) {
  const { left, top, right, bottom } = face.rect
  const joins = { over: [], under: [], covers: [] }
  for (const [index, point] of loop.entries()) {
    const next = loop[(index + 1) % loop.length]
    const dx = point[0] !== next[0] ? 0 : point[0] === left ? -SEAM : point[0] === right ? SEAM : 0
    const dy = point[1] !== next[1] ? 0 : point[1] === top ? -SEAM : point[1] === bottom ? SEAM : 0
    if (!dx && !dy) continue
    const stepX = Math.sign(next[0] - point[0])
    const stepY = Math.sign(next[1] - point[1])
    const length = Math.abs(next[0] - point[0]) + Math.abs(next[1] - point[1])
    function endsHard(inside, outside) {
      const x = point[0] + stepX * outside - dx
      const y = point[1] + stepY * outside - dy
      if (x < left || x >= right || y < top || y >= bottom) return true
      const own = colourAt(face, point[0] + stepX * inside - dx, point[1] + stepY * inside - dy)
      const other = colourAt(face, x, y)
      return own === null || other === null || jump(own, other)
    }
    let start = 0
    let kind = null
    for (let unit = 0; unit <= length; unit++) {
      const current = unit < length ? joinKind(face, others, toWorld, point[0] + stepX * (unit + 0.5), point[1] + stepY * (unit + 0.5), dx, dy) : null
      if (current === kind && unit < length) continue
      if (kind !== null) {
        const head = start + (start === 0 && endsHard(0.5, -0.5) ? JOIN_TRIM : 0)
        const tail = unit - (unit === length && endsHard(length - 0.5, length + 0.5) ? JOIN_TRIM : 0)
        const from = [point[0] + stepX * head, point[1] + stepY * head]
        const to = [point[0] + stepX * tail, point[1] + stepY * tail]
        function quad(inset, reach, shrink) {
          const [fromX, fromY] = [from[0] + stepX * shrink, from[1] + stepY * shrink]
          const [toX, toY] = [to[0] - stepX * shrink, to[1] - stepY * shrink]
          return [[fromX - dx * inset, fromY - dy * inset], [toX - dx * inset, toY - dy * inset], [toX + dx * reach, toY + dy * reach], [fromX + dx * reach, fromY + dy * reach]]
        }
        if (typeof kind === "object") {
          joins.covers.push({ neighbour: kind, quad: quad(0, JOIN_REACH, 0) })
          joins.over.push(quad(1, JOIN_REACH / 2, JOIN_TRIM / 2))
        } else joins[kind].push(quad(kind === "under" ? 0 : 1, JOIN_REACH, 0))
      }
      start = unit
      kind = current
    }
  }
  return joins
}

function outerPixels(face, others, list) {
  const toWorld = worldMap(face)
  const { left, top, right, bottom } = face.rect
  const width = right - left
  const height = bottom - top
  return list.filter(index => {
    const x = index % width
    const y = Math.floor(index / width)
    const sides = [x === 0 && [-1, 0], x === width - 1 && [1, 0], y === 0 && [0, -1], y === height - 1 && [0, 1]].filter(Boolean)
    return sides.every(([dx, dy]) => !neighbourOf(face, others, toWorld(left + x + 0.5 + dx, top + y + 0.5 + dy)))
  })
}

function trimmedBase(face, others) {
  const toWorld = worldMap(face)
  const { left, top, right, bottom } = face.rect
  const width = right - left
  const height = bottom - top
  const { owner } = face.analysis
  const dropped = new Set()
  function touchesBase(x, y) {
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (owner[ny * width + nx] === -1) return true
      }
    }
    return false
  }
  function check(x, y, dx, dy) {
    const index = y * width + x
    if (owner[index] >= 0 && !touchesBase(x, y) && !neighbourOf(face, others, toWorld(left + x + 0.5 + dx, top + y + 0.5 + dy))) dropped.add(index)
  }
  for (let x = 0; x < width; x++) {
    check(x, 0, 0, -1)
    check(x, height - 1, 0, 1)
  }
  for (let y = 0; y < height; y++) {
    check(0, y, -1, 0)
    check(width - 1, y, 1, 0)
  }
  if (!dropped.size) return null
  const kept = []
  for (let index = 0; index < width * height; index++) {
    if (!dropped.has(index)) kept.push(index)
  }
  return kept
}

function sharedEdges(list) {
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
        const edge = { fill, polygon, from, dx, dy, offset, start: dx * from[0] + dy * from[1], end: dx * to[0] + dy * to[1], id: edges.length }
        if (edge.start > edge.end) [edge.start, edge.end] = [edge.end, edge.start]
        edges.push(edge)
        const key = keyOf(Math.round(Math.atan2(dy, dx) / SHARED_ANGLE), Math.round(offset / SHARED_OFFSET))
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(edge)
      }
    }
  }
  const shared = new Map()
  for (const edge of edges) {
    const angle = Math.round(Math.atan2(edge.dy, edge.dx) / SHARED_ANGLE)
    const offset = Math.round(edge.offset / SHARED_OFFSET)
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

function fitGradient(face, rect, model, project, limits) {
  const toWorld = worldMap(face)
  const [ax, ay] = model.axis
  const centreX = (rect.left + rect.right) / 2
  const centreY = (rect.top + rect.bottom) / 2
  const middle = ax * centreX + ay * centreY
  const reach = (Math.abs(ay) * (rect.right - rect.left) + Math.abs(ax) * (rect.bottom - rect.top)) / 2
  const at = (t, across) => project(toWorld(centreX + ax * (t - middle) - ay * across, centreY + ay * (t - middle) + ax * across))
  const from = at(middle, -reach)
  const to = at(middle, reach)
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (length < EPSILON) return null
  let nx = -(to[1] - from[1]) / length
  let ny = (to[0] - from[0]) / length
  const first = model.stops[0].t
  const last = model.stops.at(-1).t
  const along = t => {
    const [x, y] = at(t, 0)
    return x * nx + y * ny
  }
  if (along(last) < along(first)) {
    nx = -nx
    ny = -ny
  }
  const start = along(first)
  const span = along(last) - start
  if (span < EPSILON) return null
  const depth = (Math.abs(ax) * (rect.right - rect.left) + Math.abs(ay) * (rect.bottom - rect.top)) / 2
  let error = 0
  for (const t of [middle - depth, middle, middle + depth]) {
    for (const across of [-reach, reach]) {
      const [x, y] = at(t, across)
      error = Math.max(error, Math.abs(x * nx + y * ny - along(t)))
    }
  }
  const knots = []
  function refine(a, b, depth) {
    const halfway = (a.t + b.t) / 2
    if (depth < 6 && b.t > a.t && Math.abs(along(halfway) - (along(a.t) + along(b.t)) / 2) > limits.spacing) {
      const centre = { t: halfway, colour: mixed(a.colour, b.colour, 0.5) }
      refine(a, centre, depth + 1)
      refine(centre, b, depth + 1)
      return
    }
    knots.push(b)
  }
  knots.push(model.stops[0])
  for (let index = 1; index < model.stops.length; index++) {
    if (model.stops[index - 1].colour === model.stops[index].colour) knots.push(model.stops[index])
    else refine(model.stops[index - 1], model.stops[index], 0)
  }
  const [x1, y1] = at(first, 0)
  return { x1, y1, x2: x1 + nx * span, y2: y1 + ny * span, stops: knots.map(stop => [clamp((along(stop.t) - start) / span, 0, 1), stop.colour]), error }
}

function number(value) {
  return String(Math.round(value * 100) / 100)
}

function pathOf(polygons, left, top) {
  return polygons.map(polygon => `M${polygon.map(([x, y]) => `${number(x - left)} ${number(y - top)}`).join("L")}Z`).join("")
}

class Output {
  constructor() {
    this.gradients = new Map()
    this.fills = new Map()
  }

  brightness(fill) {
    const stops = this.fills.get(fill)?.stops
    const colour = stops ? stops[Math.floor(stops.length / 2)][1] : parseInt(fill.slice(1), 16)
    return (colour & 255) + (colour >> 8 & 255) + (colour >> 16 & 255)
  }

  fill(model, gradient) {
    if (gradient === undefined) return hexOf(model.colour)
    const key = JSON.stringify([gradient.x1, gradient.y1, gradient.x2, gradient.y2].map(number).concat(gradient.stops.map(([offset, colour]) => [Math.round(offset * 1e4), colour])))
    if (!this.gradients.has(key)) this.gradients.set(key, { id: `g${this.gradients.size}`, gradient })
    const fill = `url(#${this.gradients.get(key).id})`
    this.fills.set(fill, gradient)
    return fill
  }

  defs(left, top) {
    return Array.from(this.gradients.values(), ({ id, gradient }) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${number(gradient.x1 - left)}" y1="${number(gradient.y1 - top)}" x2="${number(gradient.x2 - left)}" y2="${number(gradient.y2 - top)}">${gradient.stops.map(([offset, colour]) => `<stop offset="${Math.round(offset * 1e4) / 1e4}" stop-color="${hexOf(colour)}"/>`).join("")}</linearGradient>`).join("")
  }
}

function addInOrder(list, fill, polygons) {
  if (!polygons.length) return
  if (list.at(-1)?.[0] === fill) list.at(-1)[1].push(...polygons)
  else list.push([fill, polygons])
}

function addTo(groups, fill, polygons) {
  if (!groups.has(fill)) groups.set(fill, [])
  const list = groups.get(fill)
  for (const polygon of polygons) list.push(polygon)
}

function linesOf(segments, left, top) {
  let path = ""
  let last = null
  for (const [from, to] of segments) {
    const start = `${number(from[0] - left)} ${number(from[1] - top)}`
    const end = `${number(to[0] - left)} ${number(to[1] - top)}`
    path += start === last ? `L${end}` : `M${start}L${end}`
    last = end
  }
  return path
}

function markupOf({ base, silhouette, layers, joins, covers, clipped }, index, left, top, bleed, output) {
  const list = Array.from(base)
  const parts = []
  const filled = ([fill, segments]) => `<path fill="none" stroke="${fill}" d="${linesOf(segments, left, top)}"/>`
  const under = list.length > 1 ? Array.from(sharedEdges(list)).sort((a, b) => output.brightness(a[0]) - output.brightness(b[0])).map(filled) : []
  if (under.length) parts.push(`<defs><clipPath id="c${index}"><path d="${pathOf(silhouette, left, top)}"/></clipPath></defs>`, `<g clip-path="url(#c${index})" stroke-width="${number(bleed)}">${under.join("")}</g>`)
  const painted = ([fill, polygons]) => `<path fill="${fill}" d="${pathOf(polygons, left, top)}"/>`
  for (const entry of list) parts.push(painted(entry))
  for (const entry of layers) parts.push(painted(entry))
  for (const entry of joins) parts.push(painted(entry))
  for (const entry of covers) parts.push(painted(entry))
  for (const [shape, clip] of clipped.entries()) {
    parts.push(`<clipPath id="f${index}-${shape}"><path d="${pathOf(clip.pieces, left, top)}"/></clipPath><g clip-path="url(#f${index}-${shape})">${clip.groups.concat(clip.joins, Array.from(clip.covers)).map(painted).join("")}</g>`)
  }
  return parts.join("\n")
}

export function vectorTitle(scene, camera, size, resolution) {
  camera.updateMatrixWorld()
  const bounds = screenBounds(scene, camera)
  if (!bounds) return null
  const frame = camera.view?.enabled ? camera.view : { width: size.x, height: size.y }
  const width = (bounds.maxX - bounds.minX) * frame.width
  const height = (bounds.maxY - bounds.minY) * frame.height
  const scaleX = Math.max(1, Math.round(width * resolution * SAMPLES / Math.max(width, height))) / SAMPLES / (bounds.maxX - bounds.minX)
  const scaleY = Math.max(1, Math.round(height * resolution * SAMPLES / Math.max(width, height))) / SAMPLES / (bounds.maxY - bounds.minY)
  const view = { perspective: camera.isPerspectiveCamera, eye: camera.getWorldPosition(new THREE.Vector3()), direction: camera.getWorldDirection(new THREE.Vector3()), near: camera.near }
  const limits = { fit: resolution * FIT_ERROR, spacing: resolution * SPACING_ERROR }
  const output = new Output()

  function project(point) {
    const { x, y } = point.clone().project(camera)
    return [((x + 1) / 2 - bounds.minX) * scaleX, ((1 - y) / 2 - bounds.minY) * scaleY]
  }

  function fillBase(face, model, rect, pieces, groups, depth) {
    if (!model.stops) {
      addTo(groups, output.fill(model), pieces.map(piece => piece.map(project)).filter(polygon => area(polygon) >= SLIVER))
      return
    }
    const gradient = fitGradient(face, rect, model, project, limits)
    if (!gradient) {
      const middle = model.stops[Math.floor(model.stops.length / 2)].colour
      addTo(groups, hexOf(middle), pieces.map(piece => piece.map(project)).filter(polygon => area(polygon) >= SLIVER))
      return
    }
    const wide = rect.right - rect.left
    const tall = rect.bottom - rect.top
    const acrossX = Math.abs(model.axis[1]) >= Math.abs(model.axis[0])
    if (gradient.error > limits.fit && depth < MAX_SPLITS && (acrossX ? wide : tall) >= 2) {
      const toWorld = worldMap(face)
      const middle = acrossX ? Math.round((rect.left + rect.right) / 2) : Math.round((rect.top + rect.bottom) / 2)
      const to = acrossX ? toWorld(rect.right, rect.top) : toWorld(rect.left, rect.bottom)
      const normal = to.clone().sub(toWorld(rect.left, rect.top)).normalize()
      const constant = normal.dot(acrossX ? toWorld(middle, rect.top) : toWorld(rect.left, middle))
      const low = []
      const high = []
      for (const piece of pieces) {
        const [above, below] = split(piece, normal, constant)
        if (above) high.push(above)
        if (below) low.push(below)
      }
      if (low.length) fillBase(face, model, acrossX ? { ...rect, right: middle } : { ...rect, bottom: middle }, low, groups, depth + 1)
      if (high.length) fillBase(face, model, acrossX ? { ...rect, left: middle } : { ...rect, top: middle }, high, groups, depth + 1)
      return
    }
    addTo(groups, output.fill(model, gradient), pieces.map(piece => piece.map(project)).filter(polygon => area(polygon) >= SLIVER))
  }

  function paintPixels(face, layer, list, rect, groups, depth) {
    const gradient = layer.stops ? fitGradient(face, rect, layer, project, limits) : null
    if (gradient && gradient.error > limits.fit && depth < MAX_SPLITS) {
      const acrossX = Math.abs(layer.axis[1]) >= Math.abs(layer.axis[0])
      if ((acrossX ? rect.right - rect.left : rect.bottom - rect.top) >= 2) {
        const middle = acrossX ? Math.round((rect.left + rect.right) / 2) : Math.round((rect.top + rect.bottom) / 2)
        const faceWidth = face.rect.right - face.rect.left
        const coordinate = index => acrossX ? face.rect.left + index % faceWidth : face.rect.top + Math.floor(index / faceWidth)
        const low = list.filter(index => coordinate(index) <= middle)
        const high = list.filter(index => coordinate(index) >= middle)
        if (low.length && high.length && low.length < list.length && high.length < list.length) {
          paintPixels(face, layer, low, acrossX ? { ...rect, right: middle } : { ...rect, bottom: middle }, groups, depth + 1)
          paintPixels(face, layer, high, acrossX ? { ...rect, left: middle } : { ...rect, top: middle }, groups, depth + 1)
          return
        }
      }
    }
    const toWorld = worldMap(face)
    const fill = gradient ? output.fill(layer, gradient) : layer.stops ? hexOf(layer.stops[Math.floor(layer.stops.length / 2)].colour) : output.fill(layer)
    addInOrder(groups, fill, face.analysis.shapeOf(list, layer.smooth).map(loop => loop.map(([x, y]) => project(toWorld(x, y)))))
  }

  function wholeFill(face, model) {
    const gradient = model.stops ? fitGradient(face, face.rect, model, project, limits) : null
    return gradient ? output.fill(model, gradient) : model.stops ? hexOf(model.stops[Math.floor(model.stops.length / 2)].colour) : output.fill(model)
  }

  function fillLayer(face, layer, { groups, joins, covers }) {
    const toWorld = worldMap(face)
    const found = layer.exact.map(loop => joinsOf(face, loop, sameMesh, toWorld))
    const placed = list => list.map(join => join.map(([x, y]) => project(toWorld(x, y))))
    const under = placed(found.flatMap(item => item.under))
    const over = placed(found.flatMap(item => item.over)).map(sameWinding)
    if (under.length || over.length) {
      const fill = wholeFill(face, layer)
      addInOrder(groups, fill, under)
      addInOrder(joins, fill, over)
    }
    for (const { neighbour, quad } of found.flatMap(item => item.covers)) addTo(covers, wholeFill(neighbour, neighbour.analysis.base), placed([quad]).map(sameWinding))
    paintPixels(face, layer, layer.edges?.length ? layer.pixels.concat(outerPixels(face, sameMesh, layer.edges)) : layer.pixels, face.rect, groups, 0)
  }

  const meshes = []
  scene.traverseVisible(object => {
    if (object.isMesh && object.geometry.attributes.position.count) meshes.push(object)
  })
  meshes.sort((a, b) => a.renderOrder - b.renderOrder)

  const cache = new Map()
  const occluders = []
  const layers = []
  let sameMesh = []
  for (const mesh of meshes) {
    const faces = facesOf(mesh, view, project, cache)
    sameMesh = faces
    const own = mesh.material.depthWrite ? faces.map(face => occluderOf(face, view)) : []
    const layer = { base: new Map(), layers: [], joins: [], covers: new Map(), clipped: [], silhouette: [] }
    for (const face of faces) {
      const unhidden = hideAll([face.points], face, occluders)
      for (const piece of unhidden) layer.silhouette.push(grown(piece.map(project)))
      const visible = hideAll(unhidden, face, own)
      if (!visible.length) continue
      const { base, layers: shapes } = face.analysis
      const whole = visible.length === 1 && visible[0] === face.corners
      const target = whole ? { groups: layer.layers, joins: layer.joins, covers: layer.covers } : { groups: [], joins: [], covers: new Map() }
      if (base.masked) fillLayer(face, base, target)
      else {
        const trimmed = whole && shapes.length ? trimmedBase(face, sameMesh) : null
        if (trimmed) {
          const painted = []
          paintPixels(face, base, trimmed, face.rect, painted, 0)
          for (const [fill, polygons] of painted) addTo(layer.base, fill, polygons)
        } else fillBase(face, base, face.rect, visible, layer.base, 0)
      }
      for (const shape of shapes) fillLayer(face, shape, target)
      if (!whole && target.groups.length) layer.clipped.push({ pieces: visible.map(piece => piece.map(project)), ...target })
    }
    occluders.push(...own)
    if (layer.base.size || layer.layers.length || layer.clipped.length) layers.push(layer)
  }
  if (!layers.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const layer of layers) {
    for (const polygons of Array.from(layer.base.values()).concat(layer.layers.map(entry => entry[1]), layer.clipped.map(clip => clip.pieces))) {
      for (const polygon of polygons) {
        for (const [x, y] of polygon) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }
  }
  const left = Math.floor(minX + CROP_MARGIN)
  const top = Math.floor(minY + CROP_MARGIN)
  const right = Math.ceil(maxX - CROP_MARGIN)
  const bottom = Math.ceil(maxY - CROP_MARGIN)
  const markup = layers.map((layer, index) => markupOf(layer, index, left, top, resolution * BLEED, output))
  const defs = output.defs(left, top)
  return { width: right - left, height: bottom - top, markup: (defs ? `<defs>${defs}</defs>\n` : "") + markup.join("\n") }
}

function svgOf(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${content}\n</svg>\n`
}

function placed(title, x, y, scale) {
  return `<g transform="translate(${number(x)} ${number(y)}) scale(${Math.round(scale * 1e6) / 1e6})">\n${title.markup}\n</g>`
}

export function composeVector(title, settings) {
  const shortest = settings.tab === "custom" ? Math.min(settings.width, settings.height) : Math.max(title.width, title.height)
  const padding = clamp(settings.padding, 0, Math.floor((shortest - 1) / 2))
  const [width, height] = outputSize(title, settings, padding)
  const ratio = Math.min((width - padding * 2) / title.width, (height - padding * 2) / title.height)
  const x = Math.floor((width - Math.round(title.width * ratio)) / 2)
  const y = Math.floor((height - Math.round(title.height * ratio)) / 2)
  let background = ""
  if (settings.backgroundEnabled) {
    const [from, to] = gradientLine(0, 0, width, height, settings.backgroundAngle)
    const stops = gradientStops(settings.backgroundStops, settings.backgroundSmooth).map(stop => `<stop offset="${stop.position}" stop-color="${stop.colour}"/>`).join("")
    background = `<defs><linearGradient id="background" gradientUnits="userSpaceOnUse" x1="${number(from[0])}" y1="${number(from[1])}" x2="${number(to[0])}" y2="${number(to[1])}">${stops}</linearGradient></defs>\n<rect width="${width}" height="${height}" fill="url(#background)"/>\n`
  }
  return svgOf(width, height, background + placed(title, x, y, ratio))
}
