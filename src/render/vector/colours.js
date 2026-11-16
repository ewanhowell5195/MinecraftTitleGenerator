import { packed } from "../../lib/core/colour.js"

const TOLERANCE = 2
const STOP_TOLERANCE = 1.5
const HARD_EDGE = 24

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

export function tally(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

export function furthestKept(points, tolerance, missOf) {
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

export function mixed(a, b, amount) {
  return [0, 8, 16].reduce((colour, shift) => colour | Math.round((a >> shift & 255) + ((b >> shift & 255) - (a >> shift & 255)) * amount) << shift, 0)
}

export function colourAlong(stops, after, t) {
  if (after <= 0) return stops[after < 0 ? stops.length - 1 : 0].colour
  const from = stops[after - 1]
  const to = stops[after]
  return mixed(from.colour, to.colour, to.t > from.t ? (t - from.t) / (to.t - from.t) : 1)
}

export function majority(counts) {
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
