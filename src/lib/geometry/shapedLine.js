import { lineLayout } from "./layout.js"
import { joinNeighbours } from "./joins.js"
import { glyphArcs } from "./arc.js"
import { stretched, usesMarks } from "./stretch.js"
import { wordSheet } from "./wordSheet.js"
import { edgeReach, faceDepth } from "../texture/material.js"
import { glyphKey } from "../font/order.js"

export function shapeLine(font, sheet, words, word, options) {
  const placed = lineLayout(font, words, options)
  if (!placed.some(item => item.word === word)) return null
  const bends = glyphArcs(placed, words, options, font.capHeight)
  const marked = usesMarks(font)
  const items = []
  const owned = []
  const chain = []
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
    const { arcs, lift } = bends[index]
    const grow = Math.round(((options.stretch ?? 1) * (words[item.word]?.stretch ?? 1) - 1) * font.capHeight)
    const key = glyphKey(item.glyph.char, index)
    const glyph = { ...stretched(item.glyph, key, arcs, grow, marked), placedX: item.x, lineSpan, lineX: item.x - placed[0].x, lineFirst: placed[0].glyph, lift }
    chain.push(glyph)
    const mesh = font.mesh?.glyphs[item.glyph.char]
    if (mesh) glyph.fine = font.mesh.tools.fineMasks(mesh, glyph, item.glyph, edgeReach(font.capHeight))
    tallest.top = Math.max(tallest.top, glyph.arc.top)
    tallest.bottom = Math.max(tallest.bottom, glyph.arc.bottom)
    reach.top = Math.max(reach.top, glyph.arc.top + Math.max(0, lift))
    reach.bottom = Math.max(reach.bottom, glyph.arc.bottom + Math.max(0, -lift))
    extend(item, glyph, lift)
    if (!own) continue
    owned.push({ key, glyph, source })
    items.push({ ...item, glyph })
  }
  joinNeighbours(chain)
  for (const extent of [tallest, reach]) {
    for (const side of ["top", "bottom"]) if (extent[side] === -Infinity) extent[side] = 0
  }
  return { placed: items, line, ends, reach, sheet: wordSheet(owned, faceDepth(options.depth), tallest) }
}
