import { surface } from "./canvas.js"
import { lineLayout } from "./layout.js"
import { R, idOf } from "./paint.js"

const GAP = 2
const remaps = new WeakMap()

function strengths(placed, centre = 0.5) {
  const minX = Math.min(...placed.map(item => item.x))
  const maxX = Math.max(...placed.map(item => item.x + item.glyph.width))
  const pivot = minX * (1 - centre) + maxX * centre
  const centres = placed.map(item => item.x + item.glyph.width / 2 - pivot)
  const reach = Math.max(...centres.map(Math.abs))
  return centres.map(centre => reach ? (centre / reach) ** 2 : 0)
}

function spread(rows, extra, length) {
  const added = new Array(length).fill(0)
  for (const [index, row] of rows.entries()) added[row] = Math.floor((index + 1) * extra / rows.length) - Math.floor(index * extra / rows.length)
  return added
}

function stretched(glyph, key, arcs, grow) {
  const marks = glyph.stretch && (grow || arcs.some(arc => arc.marked)) ? new Set(glyph.stretch) : null
  const low = Math.min(glyph.bottom, ...(marks ? glyph.stretch : []))
  const high = Math.max(glyph.top, ...(marks ? glyph.stretch.map(y => y + 1) : []))
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
  const raise = arcs.reduce((sum, arc) => sum + arc.raise, 0)
  const drop = arcs.reduce((sum, arc) => sum + arc.drop, 0)
  const grown = growAdded.reduce((sum, count) => sum + count, 0)
  const below = growAdded.reduce((sum, count, index) => span[index] < 0 ? sum + count : sum, 0)
  const sequence = counts.flatMap((count, index) => new Array(count).fill(span[index]))
  const first = sequence.findIndex(inside)
  const last = sequence.findLastIndex(inside)
  const map = sequence.slice(first, last + 1).map(y => y - glyph.bottom)
  const mask = new Uint8Array(glyph.width * map.length)
  for (const [row, source] of map.entries()) mask.set(glyph.mask.subarray(source * glyph.width, (source + 1) * glyph.width), row * glyph.width)
  const own = span.flatMap((y, index) => inside(y) ? [index] : [])
  const bottom = low - drop - below + first
  return { ...glyph, char: key, mask, height: map.length, bottom, top: bottom + map.length, stretch: null, arc: { top: raise + grown - below, bottom: drop + below, map, counts: own.map(index => counts[index]), stretchable: own.map(index => stretchable[index]) } }
}

export function arcLayout(font, sheet, words, word, options) {
  const placed = lineLayout(font, words, options)
  if (!placed.some(item => item.word === word)) return null
  const amounts = strengths(placed, options.arcCentre)
  const wordAmounts = new Array(placed.length).fill(0)
  for (const index of words.keys()) {
    const members = placed.flatMap((item, at) => item.word === index ? [at] : [])
    if (members.length) strengths(members.map(at => placed[at]), words[index].arc?.centre).forEach((amount, at) => (wordAmounts[members[at]] = amount))
  }
  const depth = Math.max(1, Math.round(options.depth))
  const glyphs = {}
  const items = []
  const line = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const ends = { first: Infinity, last: -Infinity }
  const tallest = { top: -Infinity, bottom: -Infinity }
  const reach = { top: -Infinity, bottom: -Infinity }
  const moving = options.arcMode === "move"
  const bend = (amount, strength) => Math.round(Math.abs(amount) * (amount < 0 ? 1 - strength : strength) * font.capHeight)
  const curve = (mode, top, bottom, marked, strength) => mode === "move" ? { raise: 0, drop: 0, marked } : { raise: bend(top, strength), drop: bend(bottom, strength), marked }
  let x = 0
  let height = 0
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
    const shape = words[item.word] ?? {}
    const arc = shape.arc ?? { mode: "stretch", top: 0, bottom: 0, move: 0, marked: true }
    const arcs = [curve(options.arcMode, options.arcTop, options.arcBottom, options.arcMarked !== false, amounts[index]), curve(arc.mode, arc.top, arc.bottom, arc.marked !== false, wordAmounts[index])]
    const lift = (moving ? Math.round(options.arcMove * amounts[index] * font.capHeight) : 0) + (arc.mode === "move" ? Math.round(arc.move * wordAmounts[index] * font.capHeight) : 0)
    const grow = Math.round(((options.stretch ?? 1) * (shape.stretch ?? 1) - 1) * font.capHeight)
    const key = `${item.glyph.char}\u0000${index}`
    const glyph = { ...stretched(item.glyph, key, arcs, grow), placedX: item.x, lineX: item.x - placed[0].x, lift }
    const mesh = font.mesh?.glyphs[item.glyph.char]
    if (mesh) glyph.fine = font.mesh.tools.fineMasks(mesh, glyph, item.glyph)
    tallest.top = Math.max(tallest.top, glyph.arc.top)
    tallest.bottom = Math.max(tallest.bottom, glyph.arc.bottom)
    reach.top = Math.max(reach.top, glyph.arc.top + Math.max(0, lift))
    reach.bottom = Math.max(reach.bottom, glyph.arc.bottom + Math.max(0, -lift))
    extend(item, glyph, lift)
    if (!own) continue
    const top = depth + GAP
    const down = top + glyph.height + GAP
    glyphs[key] = { char: key, glyph, source, x, top, up: 0, upHeight: depth, down, downHeight: depth, width: glyph.width, height: glyph.height }
    items.push({ ...item, glyph })
    x += glyph.width + GAP
    height = Math.max(height, down + depth + GAP)
  }
  for (const extent of [tallest, reach]) {
    for (const side of ["top", "bottom"]) if (extent[side] === -Infinity) extent[side] = 0
  }
  const width = Math.max(1, x)
  const entries = Object.values(glyphs)
  const wordStart = Math.min(...entries.map(entry => entry.glyph.placedX))
  const wordWidth = Math.max(...entries.map(entry => entry.glyph.placedX + entry.width)) - wordStart
  for (const entry of entries) entry.glyph.wordX = entry.glyph.placedX - wordStart
  return {
    placed: items,
    line,
    ends,
    reach,
    sheet: { width, height: height + 1, glyphs, swatch: { x: 0, y: height }, tallest, wordWidth }
  }
}

function runs(arc) {
  const list = []
  let row = 0
  let at = 0
  while (row < arc.counts.length) {
    let end = row + 1
    if (arc.stretchable[row]) while (end < arc.counts.length && arc.stretchable[end]) end++
    const height = arc.counts.slice(row, end).reduce((sum, count) => sum + count, 0)
    list.push({ from: row, rows: end - row, at, height })
    row = end
    at += height
  }
  return list
}

function remap(arced, original, source, smooth) {
  const { canvas, ctx } = surface(arced.width * R, arced.swatch.y * R)
  const scale = source.width / original.width
  function copy(entry, sy, h, dy, dh = h) {
    const { source: from, glyph } = entry
    const [sx, sw] = glyph.fill ? [from.x + Math.floor(from.width / 2), 1] : [from.x, from.width]
    if (sw > 0 && h > 0) ctx.drawImage(source, sx * scale, sy * scale, sw * scale, h * scale, entry.x * R, dy * R, entry.width * R, dh * R)
  }
  for (const entry of Object.values(arced.glyphs)) {
    const { source: from, glyph } = entry
    copy(entry, from.up, from.upHeight, entry.up, entry.upHeight)
    copy(entry, from.down, from.downHeight, entry.down, entry.downHeight)
    const rows = glyph.arc.map
    if (!glyph.arc.top && !glyph.arc.bottom) {
      copy(entry, from.top, from.height, entry.top)
      continue
    }
    if (!smooth && scale <= 1) {
      for (const [row, sourceRow] of rows.entries()) copy(entry, from.top + from.height - 1 - sourceRow, 1, entry.top + rows.length - 1 - row)
      continue
    }
    for (const run of runs(glyph.arc)) copy(entry, from.top + from.height - run.from - run.rows, run.rows, entry.top + rows.length - run.at - run.height, run.height)
  }
  return canvas
}

function cached(arced, original, source, smooth) {
  if (!remaps.has(arced)) remaps.set(arced, new Map())
  const cache = remaps.get(arced)
  const key = `${smooth}:${idOf(source)}`
  if (!cache.has(key)) cache.set(key, remap(arced, original, source, smooth))
  return cache.get(key)
}

export function arcAssets(assets, arced, original) {
  const map = source => cached(arced, original, source, false)
  return {
    ...assets,
    shape: map(assets.shape),
    base: assets.base ? map(assets.base) : assets.base,
    fontOverlay: assets.fontOverlay ? map(assets.fontOverlay) : assets.fontOverlay,
    overlays: assets.overlays.map(overlay => overlay.source.generated ? overlay : { ...overlay, source: cached(arced, original, overlay.source, true) })
  }
}
