import { hasInk, inRows, inkCount, mapGlyphs, rowOfY, shapeOf, widthOf } from "./glyph.js"

function dropOf(glyph, from, to) {
  const inked = glyph.rows.flatMap((row, index) => hasInk(row) ? [from.above + from.height - 1 - index] : [])
  if (!inked.length) return 0
  return Math.max(0, Math.min(Math.max(...inked) - (to.height + to.above - 1), Math.min(...inked) + to.below))
}

function reshape(glyph, from, to, shift) {
  const cut = from.width - to.width
  const inked = (start, end) => glyph.rows.some(row => hasInk(row.slice(start, end)))
  const start = cut > 0 && inked(to.width, from.width) && !inked(0, cut) ? cut : 0
  const drop = shift ? dropOf(glyph, from, to) : 0
  const rows = []
  for (let y = to.height + to.above - 1; y >= -to.below; y--) {
    const old = glyph.rows[from.above + from.height - 1 - y - drop] ?? ""
    rows.push(old.slice(start, start + to.width).padEnd(to.width, "0"))
  }
  return { ...glyph, rows, stretch: glyph.stretch.map(y => y - drop).filter(inRows(to)) }
}

export function shiftedCharacters(font, { height = font.height, width = font.width }) {
  const next = { ...font, height, width }
  return Object.keys(font.glyphs).filter(char => dropOf(font.glyphs[char], shapeOf(font, font.glyphs[char]), shapeOf(next, font.glyphs[char])) > 0).length
}

export function resizeFont(font, { height = font.height, width = font.width }, { shift = false } = {}) {
  const next = { ...font, height, width }
  const reshaped = glyphs => glyphs && mapGlyphs(glyphs, glyph => reshape(glyph, shapeOf(font, glyph), shapeOf(next, glyph), shift))
  return { ...next, glyphs: reshaped(font.glyphs), imported: reshaped(font.imported), ...(font.hidden && { hidden: { ...font.hidden, glyphs: reshaped(font.hidden.glyphs), imported: reshaped(font.hidden.imported) } }) }
}

export function squaresOf(font, pixels) {
  return Math.round(pixels / font.grid * 100) / 100
}

function rescaleGlyph(font, glyph, next) {
  const scale = value => Math.round(value * next.grid / font.grid)
  const source = y => Math.floor(y * font.grid / next.grid)
  const width = scale(widthOf(font, glyph))
  const above = scale(glyph.above)
  const below = scale(glyph.below)
  const rows = []
  const stretch = []
  for (let y = next.height + above - 1; y >= -below; y--) {
    const from = glyph.rows[rowOfY(font, glyph, source(y))] ?? ""
    rows.push(Array.from({ length: width }, (_, x) => from[source(x)] ?? "0").join(""))
    if (glyph.stretch.includes(source(y))) stretch.unshift(y)
  }
  return { ...glyph, width: glyph.width === null || width === next.width ? null : width, above, below, stretch, rows }
}

export function setSquareSize(font, grid) {
  const scaled = value => Math.round(value * grid / font.grid)
  const pairs = kerning => kerning && Object.fromEntries(Object.entries(kerning).map(([pair, amount]) => [pair, scaled(amount)]))
  const metrics = { spaceWidth: scaled(font.spaceWidth), characterSpacing: scaled(font.characterSpacing), terminatorSpaceWidth: font.terminatorSpaceWidth === null || font.terminatorSpaceWidth === undefined ? font.terminatorSpaceWidth : scaled(font.terminatorSpaceWidth), kerning: pairs(font.kerning) }
  const next = { ...font, ...metrics, grid, height: scaled(font.height), width: scaled(font.width) }
  const rescale = glyphs => glyphs && mapGlyphs(glyphs, glyph => rescaleGlyph(font, glyph, next))
  return { ...next, glyphs: rescale(font.glyphs), imported: rescale(font.imported), ...(font.hidden && { hidden: { glyphs: rescale(font.hidden.glyphs), imported: rescale(font.hidden.imported), kerning: pairs(font.hidden.kerning) } }) }
}

export function fitGlyph(from, glyph, to) {
  let source = { ...from, imported: null, glyphs: { glyph } }
  if (source.grid !== to.grid) source = setSquareSize(source, to.grid)
  return resizeFont(source, { height: to.height, width: to.width }).glyphs.glyph
}

export function squareSizeLoss(font, grid) {
  const back = setSquareSize(setSquareSize(font, grid), font.grid)
  return Object.keys(font.glyphs).reduce((total, char) => {
    const before = font.glyphs[char].rows
    const after = back.glyphs[char].rows
    let changed = 0
    for (let row = 0; row < Math.max(before.length, after.length); row++) {
      const a = before[row] ?? ""
      const b = after[row] ?? ""
      for (let x = 0; x < Math.max(a.length, b.length); x++) if ((a[x] ?? "0") !== (b[x] ?? "0")) changed++
    }
    return total + changed
  }, 0)
}

export function lostPixels(font, change) {
  const next = resizeFont(font, change, { shift: true })
  return Object.keys(font.glyphs).reduce((total, char) => total + inkCount(font.glyphs[char]) - inkCount(next.glyphs[char]), 0)
}
