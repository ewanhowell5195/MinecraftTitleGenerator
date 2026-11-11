import { lineLayout } from "./layout.js"
import { gradientDirection, gradientReach, ordered, stopColour, stopEdges } from "./material.js"

const ALONG = { dx: 1, dy: 0 }

function gradientsOf(word) {
  const list = []
  if (word.textureSource === "gradient") list.push({ stops: "stops", smooth: "smooth", direction: gradientDirection(word.gradientAngle) })
  if (word.customInternal && word.internalFill === "gradient" && word.internalDirection === "along") list.push({ stops: "internalStops", smooth: "internalSmooth", direction: ALONG })
  if (word.customSide && word.sideFill === "gradient" && word.sideDirection === "along") list.push({ stops: "sideStops", smooth: "sideSmooth", direction: ALONG })
  if (word.customEdge && word.edgeFill === "gradient") list.push({ stops: "edgeStops", smooth: "edgeSmooth", direction: ALONG })
  return list
}

function rounded(position) {
  return Math.round(position * 10000) / 100
}

export function refitStops(stops, smooth, from, to) {
  const list = ordered(stops)
  const local = t => (t - from) / (to - from)
  if (!smooth) {
    const edges = stopEdges(list)
    return list.flatMap((stop, index) => edges[index + 1] > from && edges[index] < to || list.length === 1 ? [{ colour: stop.colour, position: rounded(Math.max(0, local(edges[index]))) }] : [])
  }
  const inside = list.map(stop => ({ colour: stop.colour, position: rounded(local(stop.position)) })).filter(stop => stop.position > 0 && stop.position < 100)
  return [{ colour: stopColour(list, from), position: 0 }].concat(inside, [{ colour: stopColour(list, to), position: 100 }])
}

function spans(font, line, word, parts, options) {
  const index = line.indexOf(word)
  const shapes = line.flatMap((other, at) => at === index ? parts.map(part => ({ text: part.text, space: part.spaceBefore })) : [{ text: other.text, space: other.spaceBefore }])
  const placed = lineLayout(font, shapes, options)
  return parts.map((part, at) => {
    const own = placed.filter(item => item.word === index + at)
    return own.length ? { left: Math.min(...own.map(item => item.x)), right: Math.max(...own.map(item => item.x + item.glyph.width)) } : null
  })
}

export function splitGradients(font, line, word, parts) {
  const gradients = gradientsOf(word)
  if (!font || !gradients.length) return parts.map(() => ({}))
  const ranges = spans(font, line, word, parts, { spacing: word.spacing, kerning: word.kerning, terminators: word.terminators })
  const known = ranges.filter(Boolean)
  if (!known.length) return parts.map(() => ({}))
  const left = Math.min(...known.map(range => range.left))
  const width = Math.max(...known.map(range => range.right)) - left
  const height = font.capHeight ?? 0
  return ranges.map(range => {
    if (!range || !width) return {}
    return Object.fromEntries(gradients.map(({ stops, smooth, direction }) => {
      const reach = gradientReach(direction, width, height)
      const ownReach = gradientReach(direction, range.right - range.left, height)
      if (!reach) return [stops, word[stops]]
      const shift = ((range.left + range.right) / 2 - (left + width / 2)) * direction.dx
      const from = (shift + reach - ownReach) / (2 * reach)
      const to = from + ownReach / reach
      return [stops, refitStops(word[stops], word[smooth], from, to)]
    }))
  })
}
