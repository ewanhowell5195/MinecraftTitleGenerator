import { packed } from "./colour.js"
import { clamp } from "./maths.js"

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
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const HOLE = -2
export const BASE = -1
const COVERED = -1
const PAINTED_EDGE_REACH = 1.5
const FADE_USABLE = 0.8
const FADE_MATCH = 3
const PEEL_SHARE = 0.1
const MIN_BIN_SHARE = 0.2
const STAIR = 0.8
const STAIR_POINTS = 6
const RAMP_WOBBLE = 3

export function within(a, b, limit) {
  return Math.abs((a & 255) - (b & 255)) <= limit && Math.abs((a >> 8 & 255) - (b >> 8 & 255)) <= limit && Math.abs((a >> 16 & 255) - (b >> 16 & 255)) <= limit
}

export function near(a, b) {
  return within(a, b, TOLERANCE)
}

export function jump(a, b) {
  return !within(a, b, HARD_EDGE)
}

export function brightness(colour) {
  return (colour & 255) + (colour >> 8 & 255) + (colour >> 16 & 255)
}

function tally(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function alongAxis(index, width, [ax, ay]) {
  return (index % width + 0.5) * ax + (Math.floor(index / width) + 0.5) * ay
}

function binAt(index, width, axis) {
  return Math.floor(alongAxis(index, width, axis) + 1e-6)
}

function furthestKept(points, tolerance, missOf) {
  const keep = new Set([0, points.length - 1])
  const pending = [[0, points.length - 1]]
  while (pending.length) {
    const [from, to] = pending.pop()
    let worst = -1
    let error = tolerance
    for (let index = from + 1; index < to; index++) {
      const miss = missOf(points[index], points[from], points[to])
      if (miss <= error) continue
      error = miss
      worst = index
    }
    if (worst < 0) continue
    keep.add(worst)
    pending.push([from, worst], [worst, to])
  }
  return Array.from(keep).sort((a, b) => a - b).map(index => points[index])
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

export function mixed(a, b, amount) {
  return [0, 8, 16].reduce((colour, shift) => colour | Math.round((a >> shift & 255) + ((b >> shift & 255) - (a >> shift & 255)) * amount) << shift, 0)
}

export function colourAlong(stops, after, t) {
  if (after <= 0) return stops[after < 0 ? stops.length - 1 : 0].colour
  const from = stops[after - 1]
  const to = stops[after]
  return mixed(from.colour, to.colour, to.t > from.t ? (t - from.t) / (to.t - from.t) : 1)
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

export function simplifyStops(points, tolerance = STOP_TOLERANCE) {
  return furthestKept(points, tolerance, (point, from, to) => {
    const span = to.t - from.t
    const amount = span ? (point.t - from.t) / span : 0
    return Math.max(...[0, 8, 16].map(shift => {
      const a = from.colour >> shift & 255
      const b = to.colour >> shift & 255
      return Math.abs(a + (b - a) * amount - (point.colour >> shift & 255))
    }))
  })
}

function stepSize(a, b) {
  return Math.max(...change(a, b).map(Math.abs))
}

function averaged(values, from, to, row, widest) {
  const reach = Math.min(row - from, to - row, widest)
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
  const reach = Math.floor(spacing / 2)
  for (let pass = 0; pass < 2; pass++) {
    const next = values.slice()
    for (let row = from; row <= to; row++) next[row] = averaged(values, from, to, row, reach)
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
  const binOf = index => binAt(index, width, axis)
  for (const index of list) {
    const bin = binOf(index)
    if (!bins.has(bin)) bins.set(bin, new Map())
    tally(bins.get(bin), colours[index])
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
  const present = new Set(list)
  for (const index of list) {
    if (index % width < width - 1 && present.has(index + 1)) dx += brightness(colours[index + 1]) - brightness(colours[index])
    if (index < width * (height - 1) && present.has(index + width)) dy += brightness(colours[index + width]) - brightness(colours[index])
  }
  const length = Math.hypot(dx, dy)
  if (!length || Math.abs(dx) / length < 0.02 || Math.abs(dy) / length < 0.02) return null
  return [dx / length, dy / length]
}

function rampsOneWay(stops) {
  const levels = stops.map(stop => brightness(stop.colour))
  const steps = levels.slice(1).map((value, index) => value - levels[index])
  return steps.every(step => step >= -RAMP_WOBBLE) || steps.every(step => step <= RAMP_WOBBLE)
}

function rising(stops) {
  return stops.every((stop, index) => !index || stop.t > stops[index - 1].t)
}

function without(list, removed) {
  const gone = new Set(removed)
  return list.filter(index => !gone.has(index))
}

function flatIfOneColour(model) {
  return model.stops.every(stop => stop.colour === model.stops[0].colour) ? { colour: model.stops[0].colour, matched: model.matched } : model
}

function segmentsOf(model, width) {
  if (!model.stops) return [model]
  const parts = [[]]
  for (const [index, stop] of model.stops.entries()) {
    if (index && stop.t === model.stops[index - 1].t) parts.push([])
    parts.at(-1).push(stop)
  }
  if (parts.length === 1) return [flatIfOneColour(model)]
  const owners = parts.map(stops => ({ axis: model.axis, stops, matched: [] }))
  for (const index of model.matched) {
    const bin = binAt(index, width, model.axis)
    const owner = owners.find(({ stops }) => bin < stops.at(-1).t) ?? owners.at(-1)
    owner.matched.push(index)
  }
  return owners.filter(owner => owner.matched.length).map(flatIfOneColour)
}

function flatOf(list, colours) {
  const counts = new Map()
  for (const index of list) tally(counts, colours[index])
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
    if (fit && fit.stops.length <= MAX_STOPS && fit.matched.length >= list.length * DIAGONAL_SHARE && rising(fit.stops)) best = fit
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
  return furthestKept(run, STAIR, ([x, y], [ax, ay], [bx, by]) => Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / (Math.hypot(bx - ax, by - ay) || 1))
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

function smoothStairs(loop) {
  const size = loop.length
  const unit = loop.map((point, index) => {
    const next = loop[(index + 1) % size]
    return Math.abs(next[0] - point[0]) + Math.abs(next[1] - point[1]) === 1
  })
  const inRun = index => unit[index] || unit[(index + size - 1) % size]
  const start = loop.findIndex((point, index) => !inRun(index))
  if (start < 0 || !unit.includes(true)) return loop
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

export function colourTotals(image) {
  if (image.totals) return image.totals
  const totals = new Map()
  for (let at = 0; at < image.data.length; at += 4) {
    if (image.data[at + 3] < 128) continue
    tally(totals, packed(image.data, at))
  }
  image.totals = totals
  return totals
}

function axisBetween(from, to, rect) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (!length) return null
  const axis = [dx / length, dy / length]
  return { axis, length, start: axis[0] * (from[0] - rect.left) + axis[1] * (from[1] - rect.top) }
}

function fadedModel(fade, rect, list, colours, width) {
  const line = axisBetween(fade.near, fade.far, rect)
  if (!line) return null
  const { axis, length, start } = line
  const border = fade.colour
  const reach = length * (1 - fade.amount)
  const distance = index => alongAxis(index, width, axis) - start
  const lineOf = index => axis[0] ? Math.floor(index / width) : index % width
  const closest = new Map()
  for (const index of list) {
    const across = lineOf(index)
    if (!closest.has(across) || distance(index) < distance(closest.get(across))) closest.set(across, index)
  }
  const groups = []
  for (const [across, index] of closest) {
    const amount = reach > 0 ? clamp(distance(index) / reach, 0, 1) : 1
    if (amount > FADE_USABLE) continue
    const colour = [0, 8, 16].reduce((sum, shift) => sum | clamp(Math.round(((colours[index] >> shift & 255) - (border >> shift & 255) * amount) / (1 - amount)), 0, 255) << shift, 0)
    const group = groups.find(other => within(other.colour, colour, STEP_EDGE))
    if (group) group.lines.add(across)
    else groups.push({ colour, lines: new Set([across]) })
  }
  const parts = groups.map(({ colour, lines }) => {
    const matched = list.filter(index => lines.has(lineOf(index)) && within(colours[index], mixed(colour, border, clamp(distance(index) / reach, 0, 1)), FADE_MATCH))
    const stops = [{ t: start, colour }, { t: start + reach, colour: border }].concat(reach < length ? [{ t: start + length, colour: border }] : [])
    return flatIfOneColour({ axis, matched, stops })
  }).filter(part => part.matched.length).sort((a, b) => b.matched.length - a.matched.length)
  const matched = parts.flatMap(part => part.matched)
  return matched.length >= list.length * BASE_SHARE ? { axis, matched, parts } : null
}

function filledBands(bands) {
  return bands.map((colour, index) => colour ?? bands.slice(index).find(other => other !== null) ?? bands.slice(0, index).findLast(other => other !== null))
}

function joinedBands(layers) {
  const joined = []
  for (const layer of layers) {
    const other = layer.bandColours && joined.find(item => item.bandColours?.every((colour, index) => colour === null || layer.bandColours[index] === null || colour === layer.bandColours[index]))
    if (!other) {
      joined.push(layer)
      continue
    }
    other.pixels = other.pixels.concat(layer.pixels)
    other.bandColours = other.bandColours.map((colour, index) => colour ?? layer.bandColours[index])
    const filled = filledBands(other.bandColours)
    other.stops = other.stops.map((stop, index) => ({ t: stop.t, colour: filled[index >> 1] }))
  }
  return joined
}

function paintedModel(source, rect, list, colours, width, overlaid) {
  const line = axisBetween(source.from, source.to, rect)
  if (!line) return null
  const { axis, length, start } = line
  const placed = source.stops.map(stop => ({ t: start + stop.position * length, colour: stop.colour }))
  const edges = placed.flatMap((stop, index) => index && stop.t === placed[index - 1].t && stop.colour !== placed[index - 1].colour ? [stop.t] : [])
  const paintedAt = t => colourAlong(placed, placed.findIndex(stop => stop.t > t), t)
  const tOf = index => alongAxis(index, width, axis)
  const onEdge = t => edges.some(edge => Math.abs(t - edge) <= PAINTED_EDGE_REACH)
  function modelOfColours(colourFor, modelStops) {
    const matched = list.filter(index => onEdge(tOf(index)) || near(colours[index], colourFor(tOf(index))))
    return matched.length >= list.length * BASE_SHARE ? { axis, matched, stops: modelStops } : null
  }
  const flat = placed.every((stop, index) => !index || stop.t === placed[index - 1].t || stop.colour === placed[index - 1].colour)
  if (!overlaid) {
    const low = list.reduce((least, index) => Math.min(least, tOf(index)), Infinity) - 1
    const high = list.reduce((most, index) => Math.max(most, tOf(index)), -Infinity) + 1
    const inRange = [{ t: low, colour: paintedAt(low) }].concat(placed.filter(stop => stop.t > low && stop.t < high), { t: high, colour: paintedAt(high) })
    const model = modelOfColours(paintedAt, simplifyStops(flat ? placed : inRange))
    return model && { ...model, bands: flat }
  }
  if (!edges.length) return null
  const bandOf = t => edges.filter(edge => edge <= t).length
  const counts = edges.concat(0).map(() => new Map())
  for (const index of list) {
    const t = tOf(index)
    if (onEdge(t)) continue
    tally(counts[bandOf(t)], colours[index])
  }
  const bands = counts.map(band => band.size ? majority(band) : null)
  const filled = filledBands(bands)
  if (filled[0] === undefined) return null
  const bounds = [placed[0].t].concat(edges, placed.at(-1).t)
  const model = modelOfColours(t => filled[bandOf(t)], filled.flatMap((colour, index) => [{ t: bounds[index], colour }, { t: bounds[index + 1], colour }]))
  return model && { ...model, bands: true, bandColours: bands }
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

  function decompose(region, exact, known = null) {
    let free = region
    function take(matched) {
      free = without(free, matched)
    }
    const layers = []
    let fitted = known ?? modelOf(free, colours, width, height, BASE_SHARE, exact, exact ? null : bandsOf(main[0])) ?? flatOf(free, colours)
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
  const { base, layers: painted } = decompose(main[1], false, knownModel(main[1], false))
  for (const [, region] of overlaid) {
    const part = decompose(region, true, knownModel(region, true))
    painted.push({ ...part.base, pixels: part.base.matched, smooth: anySoft }, ...part.layers)
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
  const stacked = layers.map((layer, index) => ({ ...layer, pixels: grownUnder(layer.pixels, index), edges: edgeUnder(layer.pixels, index), exact: shapeOf(layer.pixels, layer.smooth) }))
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
