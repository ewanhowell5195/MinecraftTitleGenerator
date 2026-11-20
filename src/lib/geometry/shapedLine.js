import { lineLayout } from "./layout.js"
import { joinNeighbours } from "./joins.js"
import { glyphArcs } from "./arc.js"
import { stretched, usesMarks } from "./stretch.js"
import { wordSheet } from "./wordSheet.js"
import { edgeReach, faceDepth } from "./sizes.js"
import { glyphKey } from "../font/order.js"
import { faceLimits } from "./meshFaces.js"

function inkPadding(mesh, width) {
  const xs = mesh.shapes.flatMap(shape => [shape.outer].concat(shape.holes)).flat().map(point => point[0])
  return [Math.max(0, Math.ceil(-Math.min(...xs))), Math.max(0, Math.ceil(Math.max(...xs) - width))]
}

function padded(glyph, left, right) {
  if (!left && !right) return glyph
  const width = glyph.width + left + right
  const widen = source => {
    const out = new source.constructor(width * glyph.height)
    for (let row = 0; row < glyph.height; row++) out.set(source.subarray(row * glyph.width, (row + 1) * glyph.width), row * width + left)
    return out
  }
  return { ...glyph, width, mask: widen(glyph.mask), ...(glyph.depths ? { depths: widen(glyph.depths) } : {}), placedX: glyph.placedX - left, lineX: glyph.lineX - left, inkShift: left }
}

export function shapeLine(font, sheet, words, word, options) {
  const placed = lineLayout(font, words, options)
  if (!placed.some(item => item.word === word)) return null
  const bends = glyphArcs(placed, words, options, font.capHeight)
  const marked = usesMarks(font)
  const items = []
  const owned = []
  const chain = []
  const spans = []
  const line = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const ends = { first: Infinity, last: -Infinity }
  const tallest = { top: -Infinity, bottom: -Infinity }
  const reach = { top: -Infinity, bottom: -Infinity }
  const lineSpan = [Math.min(...placed.map(item => item.x)), Math.max(...placed.map(item => item.x + item.glyph.width))]
  function extend(item, glyph, lift = 0) {
    line.minX = Math.min(line.minX, item.x)
    line.maxX = Math.max(line.maxX, item.x + glyph.width)
    line.minY = Math.min(line.minY, glyph.bottom + lift)
    line.maxY = Math.max(line.maxY, glyph.bottom + glyph.height + lift)
    ends.first = Math.min(ends.first, item.x + glyph.width / 2)
    ends.last = Math.max(ends.last, item.x + glyph.width / 2)
  }
  for (const [index, item] of placed.entries()) {
    const own = item.word === word
    const source = sheet.glyphs[item.glyph.char]
    if (!source) {
      extend(item, item.glyph)
      if (own) items.push(item)
      continue
    }
    const { arcs, lift, lineLift } = bends[index]
    const grow = Math.round(((options.stretch ?? 1) * (words[item.word]?.stretch ?? 1) - 1) * font.capHeight)
    const key = glyphKey(item.glyph.char, index)
    const laid = { ...stretched(item.glyph, key, arcs, grow, marked), placedX: item.x, lineSpan, lineX: item.x - placed[0].x, lineFirst: placed[0].glyph, lift, lineLift }
    const mesh = font.mesh?.glyphs[item.glyph.char]
    const [left, right] = mesh ? inkPadding(mesh, laid.width) : [0, 0]
    const glyph = padded(laid, left, right)
    chain.push(glyph)
    if (mesh) glyph.fine = font.mesh.tools.fineMasks(mesh, glyph, item.glyph, edgeReach(font.capHeight, options.curveHeight), faceLimits({ faded: options.fadeCurves, angle: options.curveAngle }))
    tallest.top = Math.max(tallest.top, glyph.arc.top)
    tallest.bottom = Math.max(tallest.bottom, glyph.arc.bottom)
    reach.top = Math.max(reach.top, glyph.arc.top + Math.max(0, lift))
    reach.bottom = Math.max(reach.bottom, glyph.arc.bottom + Math.max(0, -lift))
    extend(item, laid, lift)
    spans.push({ minX: item.x, maxX: item.x + laid.width, own })
    if (!own) continue
    owned.push({ key, glyph, source })
    items.push({ ...item, x: item.x - left, glyph })
  }
  joinNeighbours(chain)
  for (const extent of [tallest, reach]) {
    for (const side of ["top", "bottom"]) if (extent[side] === -Infinity) extent[side] = 0
  }
  return { placed: items, line, ends, spans, reach, sheet: wordSheet(owned, faceDepth(options.depth), tallest) }
}
