import { hasMarks } from "../font/font.js"

function spread(rows, extra, length) {
  const added = new Array(length).fill(0)
  for (const [index, row] of rows.entries()) added[row] = Math.floor((index + 1) * extra / rows.length) - Math.floor(index * extra / rows.length)
  return added
}

export function usesMarks(font) {
  return !font.mesh && hasMarks(font)
}

export function stretched(glyph, key, arcs, grow, marked = true) {
  const marks = marked && (grow || arcs.some(arc => arc.marked)) ? new Set(glyph.stretch ?? []) : null
  const low = Math.min(glyph.bottom, ...(marks ? marks : []))
  const high = Math.max(glyph.top, ...(marks ? Array.from(marks, y => y + 1) : []))
  const shift = marks && !marks.size ? Math.round(arcs.reduce((sum, arc) => arc.marked ? sum + arc.raise - arc.drop : sum, grow) / 2) : 0
  const span = Array.from({ length: high - low }, (_, index) => low + index)
  const inside = y => y >= glyph.bottom && y < glyph.top
  const rowsFor = marked => span.flatMap((y, index) => (marked && marks ? marks.has(y) : inside(y)) ? [index] : [])
  const arcRows = arcs.map(arc => rowsFor(arc.marked))
  const growRows = rowsFor(true)
  const kept = span.filter((y, index) => inside(y) && !growRows.includes(index)).length
  const arcAdded = arcs.map((arc, index) => spread(arcRows[index], arc.raise + arc.drop, span.length))
  const growAdded = spread(growRows, Math.max(grow, kept ? -growRows.length : 1 - growRows.length), span.length)
  const counts = span.map((y, index) => arcAdded.reduce((sum, added) => sum + added[index], 1 + growAdded[index]))
  const stretchable = span.map((y, index) => arcRows.some(rows => rows.includes(index)) || growRows.includes(index))
  const raise = arcs.reduce((sum, arc, index) => arcRows[index].length ? sum + arc.raise : sum, 0)
  const drop = arcs.reduce((sum, arc, index) => arcRows[index].length ? sum + arc.drop : sum, 0)
  const grown = growAdded.reduce((sum, count) => sum + count, 0)
  const below = growAdded.reduce((sum, count, index) => span[index] < 0 ? sum + count : sum, 0)
  const sequence = counts.flatMap((count, index) => new Array(count).fill(span[index]))
  const first = sequence.findIndex(inside)
  const last = sequence.findLastIndex(inside)
  const map = sequence.slice(first, last + 1).map(y => y - glyph.bottom)
  const mask = new Uint8Array(glyph.width * map.length)
  const depths = glyph.depths && new Uint8Array(mask.length)
  for (const [row, source] of map.entries()) {
    mask.set(glyph.mask.subarray(source * glyph.width, (source + 1) * glyph.width), row * glyph.width)
    depths?.set(glyph.depths.subarray(source * glyph.width, (source + 1) * glyph.width), row * glyph.width)
  }
  const own = span.flatMap((y, index) => inside(y) ? [index] : [])
  const bottom = low - drop - below + first + shift
  return { ...glyph, char: key, mask, ...(depths ? { depths } : {}), height: map.length, bottom, top: bottom + map.length, stretch: null, arc: { top: raise + grown - below + shift, bottom: drop + below - shift, map, counts: own.map(index => counts[index]), stretchable: own.map(index => stretchable[index]) } }
}
