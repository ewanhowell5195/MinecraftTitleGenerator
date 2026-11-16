import { hexOf, rgbOf } from "../core/colour.js"

export const MAX_ANCHORS = 5
export const WHITE = [255, 255, 255]

const FIT = 12 ** 2
const SAME = 3 * 3 ** 2
const FAINT = 16

function distance2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

function luminance(rgb) {
  return 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]
}

function represent(rgb, anchors) {
  let i = 0
  let j = -1
  for (let k = 1; k < anchors.length; k++) {
    if (distance2(rgb, anchors[k]) < distance2(rgb, anchors[i])) {
      j = i
      i = k
    } else if (j < 0 || distance2(rgb, anchors[k]) < distance2(rgb, anchors[j])) j = k
  }
  if (j < 0) return { i, j: i, t: 0, error: distance2(rgb, anchors[i]) }
  const a = anchors[i]
  const b = anchors[j]
  const along = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const length = along[0] ** 2 + along[1] ** 2 + along[2] ** 2
  const t = length ? Math.min(1, Math.max(0, ((rgb[0] - a[0]) * along[0] + (rgb[1] - a[1]) * along[1] + (rgb[2] - a[2]) * along[2]) / length)) : 0
  return { i, j, t, error: distance2(rgb, [a[0] + along[0] * t, a[1] + along[1] * t, a[2] + along[2] * t]) }
}

function worst(colours, anchors) {
  let found = null
  let error = -1
  for (const colour of colours) {
    const own = represent(colour.rgb, anchors.map(anchor => anchor.rgb)).error
    if (own > error) {
      found = colour
      error = own
    }
  }
  return { colour: found, error }
}

function farthest(colours, from) {
  let found = colours[0]
  for (const colour of colours) if (distance2(colour.rgb, from) > distance2(found.rgb, from)) found = colour
  return found
}

function byUse(a, b) {
  return b.count - a.count || luminance(b.rgb) - luminance(a.rgb)
}

function pruned(colours, anchors) {
  let kept = anchors
  for (;;) {
    const order = kept.map(anchor => ({ anchor, error: represent(anchor.rgb, kept.filter(item => item !== anchor).map(item => item.rgb)).error })).sort((a, b) => a.error - b.error || a.anchor.count - b.anchor.count)
    const removable = kept.length > 1 && order.find(({ anchor }) => worst(colours, kept.filter(item => item !== anchor)).error <= FIT)
    if (!removable) return kept
    kept = kept.filter(item => item !== removable.anchor)
  }
}

export function paletteOf(data) {
  const counts = new Map()
  for (let at = 0; at < data.length; at += 4) {
    const alpha = data[at + 3]
    if (!alpha) continue
    const key = data[at] << 16 | data[at + 1] << 8 | data[at + 2]
    const seen = counts.get(key)
    if (seen) {
      seen.count++
      seen.alpha = Math.max(seen.alpha, alpha)
    } else counts.set(key, { rgb: [key >> 16 & 255, key >> 8 & 255, key & 255], count: 1, alpha })
  }
  if (!counts.size) return { anchors: [WHITE], complex: false }
  const all = Array.from(counts.values()).sort(byUse)
  const merged = []
  for (const colour of all) {
    const near = merged.find(item => distance2(item.rgb, colour.rgb) <= SAME)
    if (near) near.count += colour.count
    else if (merged.push({ ...colour }) > MAX_ANCHORS) break
  }
  if (merged.length <= MAX_ANCHORS) return { anchors: merged.sort(byUse).map(colour => colour.rgb), complex: false }
  const strong = all.filter(colour => colour.alpha >= FAINT)
  const colours = strong.length ? strong : all
  const start = farthest(colours, colours[0].rgb)
  const end = farthest(colours, start.rgb)
  let anchors = start === end ? [start] : [start, end]
  while (anchors.length < MAX_ANCHORS) {
    const { colour, error } = worst(colours, anchors)
    if (error <= FIT) break
    anchors.push(colour)
  }
  const complex = worst(colours, anchors).error > FIT
  if (!complex) anchors = pruned(colours, anchors)
  return { anchors: anchors.sort(byUse).map(anchor => anchor.rgb), complex }
}

export function paletteHexes(anchors) {
  return anchors.map(hexOf)
}

export function definitionPalette(definition) {
  return definition?.palette ? definition.palette.map(rgbOf) : [WHITE]
}

export function chosenColours(layer, anchors) {
  if (!layer.colours) return null
  return anchors.map((anchor, index) => layer.colours[index] ? rgbOf(layer.colours[index]) : anchor)
}

export function mapColour(rgb, anchors, colours) {
  const { i, j, t } = represent(rgb, anchors)
  const a = colours[i]
  const b = colours[j]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function recolour(data, anchors, colours) {
  const cache = new Map()
  for (let at = 0; at < data.length; at += 4) {
    if (!data[at + 3]) continue
    const key = data[at] << 16 | data[at + 1] << 8 | data[at + 2]
    let mapped = cache.get(key)
    if (!mapped) {
      mapped = mapColour([data[at], data[at + 1], data[at + 2]], anchors, colours)
      cache.set(key, mapped)
    }
    data[at] = mapped[0]
    data[at + 1] = mapped[1]
    data[at + 2] = mapped[2]
  }
  return data
}
