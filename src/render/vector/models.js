import { clamp } from "../../lib/core/maths.js"
import { brightness, colourAlong, jump, majority, mixed, near, simplifyStops, tally, within } from "./colours.js"

export const STEP_EDGE = 6
const PIXEL_STEP = 2
const PIXEL_FLAT = 1
const PIXEL_REACH = 2
const BAND_STEP = 16
const BAND_WOBBLE = 2
const MIN_BANDS = 4
const MIN_BAND_ROWS = 2
const STEP_SLOPE = 3
const MAX_STOPS = 128
export const BASE_SHARE = 0.8
const DIAGONAL_SHARE = 0.95
const PAINTED_EDGE_REACH = 1.5
const FADE_USABLE = 0.8
const FADE_MATCH = 3
const MIN_BIN_SHARE = 0.2
const RAMP_WOBBLE = 3
const BAND_TOLERANCE = 0
const BAND_STOP_TOLERANCE = 0.5
const DENOISE_REACH = 2

function alongAxis(index, width, [ax, ay]) {
  return (index % width + 0.5) * ax + (Math.floor(index / width) + 0.5) * ay
}

function binAt(index, width, axis) {
  return Math.floor(alongAxis(index, width, axis) + 1e-6)
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

export function smoothBands(rows) {
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
    const step = !next ? null : next[0] !== bin + 1 ? jump(colour, next[1]) ? (bin + 1 + next[0]) / 2 : null : shownEdges.has(bin) ? bin + 1 : null
    if (step !== null) points.push({ t: bin, colour }, { t: step, colour }, { t: step, colour: next[1] })
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

export function rampsOneWay(stops) {
  const levels = stops.map(stop => brightness(stop.colour))
  const steps = levels.slice(1).map((value, index) => value - levels[index])
  return steps.every(step => step >= -RAMP_WOBBLE) || steps.every(step => step <= RAMP_WOBBLE)
}

export function rising(stops) {
  return stops.every((stop, index) => !index || stop.t > stops[index - 1].t)
}

export function without(list, removed) {
  const gone = new Set(removed)
  return list.filter(index => !gone.has(index))
}

function flatIfOneColour(model) {
  return model.stops.every(stop => stop.colour === model.stops[0].colour) ? { colour: model.stops[0].colour, matched: model.matched } : model
}

export function segmentsOf(model, width) {
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

export function flatOf(list, colours) {
  const counts = new Map()
  for (const index of list) tally(counts, colours[index])
  const colour = majority(counts)
  return { colour, matched: list.filter(index => near(colours[index], colour)) }
}

export function drawnNear(model, index, colours, width, limit) {
  if (!model.stops) return within(colours[index], model.colour, limit)
  const t = alongAxis(index, width, model.axis)
  return within(colours[index], colourAlong(model.stops, model.stops.findIndex(stop => stop.t > t), t), limit)
}

function averagedAxis(list, colours, width, axis) {
  const sums = new Map()
  for (const index of list) {
    const bin = binAt(index, width, axis)
    if (!sums.has(bin)) sums.set(bin, [0, 0, 0, 0])
    const sum = sums.get(bin)
    for (let channel = 0; channel < 3; channel++) sum[channel] += colours[index] >> channel * 8 & 255
    sum[3]++
  }
  const ordered = Array.from(sums, ([bin, sum]) => [bin, sum.slice(0, 3).reduce((colour, value, channel) => colour | Math.round(value / sum[3]) << channel * 8, 0)]).sort((a, b) => a[0] - b[0])
  const points = [{ t: ordered[0][0], colour: ordered[0][1] }]
  for (const [position, [bin, colour]] of ordered.entries()) {
    const next = ordered[position + 1]
    if (next && next[0] !== bin + 1) {
      const step = (bin + 1 + next[0]) / 2
      points.push({ t: bin, colour }, { t: step, colour }, { t: step, colour: next[1] })
    } else points.push({ t: bin + 0.5, colour })
  }
  points.push({ t: ordered.at(-1)[0] + 1, colour: ordered.at(-1)[1] })
  return { axis, stops: simplifyStops(points, BAND_STOP_TOLERANCE) }
}

function planeAt(index, present, colours, width) {
  const x = index % width
  let count = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let dy = -DENOISE_REACH; dy <= DENOISE_REACH; dy++) {
    for (let dx = -DENOISE_REACH; dx <= DENOISE_REACH; dx++) {
      const other = index + dy * width + dx
      if (x + dx < 0 || x + dx >= width || !present.has(other)) continue
      count++
      sx += dx
      sy += dy
      sxx += dx * dx
      syy += dy * dy
      sxy += dx * dy
      for (let channel = 0; channel < 3; channel++) {
        const value = colours[other] >> channel * 8 & 255
        sums[channel][0] += value
        sums[channel][1] += value * dx
        sums[channel][2] += value * dy
      }
    }
  }
  const det = count * (sxx * syy - sxy * sxy) - sx * (sx * syy - sxy * sy) + sy * (sx * sxy - sxx * sy)
  return sums.reduce((colour, [sum, sumX, sumY], channel) => {
    const value = Math.abs(det) < 1e-9 ? sum / count : (sum * (sxx * syy - sxy * sxy) - sx * (sumX * syy - sxy * sumY) + sy * (sumX * sxy - sxx * sumY)) / det
    return colour | clamp(Math.round(value), 0, 255) << channel * 8
  }, 0)
}

export function denoised(list, colours, width) {
  const present = new Set(list)
  const field = Int32Array.from(colours)
  for (const index of list) field[index] = planeAt(index, present, colours, width)
  return field
}

export function bandedOf(list, colours, width) {
  let best = null
  for (const axis of [[1, 0], [0, 1]]) {
    const lineOf = index => axis[0] ? Math.floor(index / width) : index % width
    const lines = new Map()
    for (const index of list) {
      const line = lineOf(index)
      if (!lines.has(line)) lines.set(line, [])
      lines.get(line).push(index)
    }
    const order = Array.from(lines.keys()).sort((a, b) => a - b)
    const most = best?.length ?? Infinity
    const bands = []
    for (let start = 0; start < order.length && bands.length < most;) {
      let pixels = lines.get(order[start])
      let fit = averagedAxis(pixels, colours, width, axis)
      let end = start + 1
      for (; end < order.length && order[end] === order[end - 1] + 1; end++) {
        const grown = pixels.concat(lines.get(order[end]))
        const trial = averagedAxis(grown, colours, width, axis)
        if (trial.stops.length > MAX_STOPS || !grown.every(index => drawnNear(trial, index, colours, width, BAND_TOLERANCE))) break
        pixels = grown
        fit = trial
      }
      bands.push({ ...flatIfOneColour({ ...fit, matched: pixels }), strip: { axis, from: order[start], to: order[end - 1] + 1 } })
      start = end
    }
    if (bands.length < most) best = bands
  }
  return best
}

export function modelOf(list, colours, width, height, share, exact, bands) {
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

function axisBetween(from, to, rect) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (!length) return null
  const axis = [dx / length, dy / length]
  return { axis, length, start: axis[0] * (from[0] - rect.left) + axis[1] * (from[1] - rect.top) }
}

export function fadedModel(fade, rect, list, colours, width) {
  const line = axisBetween(fade.near, fade.far, rect)
  if (!line) return null
  const { axis, length, start } = line
  const border = fade.colour
  const opacity = fade.opacity ?? 1
  const lead = length * Math.max(0, -fade.amount)
  const reach = length * (1 - Math.max(0, fade.amount)) - lead
  const distance = index => alongAxis(index, width, axis) - start
  const faded = index => reach > 0 ? clamp((distance(index) - lead) / reach, 0, 1) : distance(index) >= lead ? 1 : 0
  const lineOf = index => axis[0] ? Math.floor(index / width) : index % width
  const closest = new Map()
  for (const index of list) {
    const across = lineOf(index)
    if (!closest.has(across) || distance(index) < distance(closest.get(across))) closest.set(across, index)
  }
  const groups = []
  for (const [across, index] of closest) {
    const amount = faded(index) * opacity
    if (amount > FADE_USABLE) continue
    const colour = [0, 8, 16].reduce((sum, shift) => sum | clamp(Math.round(((colours[index] >> shift & 255) - (border >> shift & 255) * amount) / (1 - amount)), 0, 255) << shift, 0)
    const group = groups.find(other => within(other.colour, colour, STEP_EDGE))
    if (group) group.lines.add(across)
    else groups.push({ colour, lines: new Set([across]) })
  }
  const parts = groups.map(({ colour, lines }) => {
    const matched = list.filter(index => lines.has(lineOf(index)) && within(colours[index], mixed(colour, border, faded(index) * opacity), FADE_MATCH))
    const end = mixed(colour, border, opacity)
    const stops = [{ t: start, colour }].concat(lead > 0 ? [{ t: start + lead, colour }] : [], { t: start + lead + reach, colour: end }, lead + reach < length ? [{ t: start + length, colour: end }] : [])
    return flatIfOneColour({ axis, matched, stops })
  }).filter(part => part.matched.length).sort((a, b) => b.matched.length - a.matched.length)
  const matched = parts.flatMap(part => part.matched)
  return matched.length >= list.length * BASE_SHARE ? { axis, matched, parts } : null
}

function filledBands(bands) {
  return bands.map((colour, index) => colour ?? bands.slice(index).find(other => other !== null) ?? bands.slice(0, index).findLast(other => other !== null))
}

export function joinedBands(layers) {
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

export function paintedModel(source, rect, list, colours, width, overlaid) {
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
