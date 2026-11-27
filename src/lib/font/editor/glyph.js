const INK = /[^0]/

export function hasInk(text) {
  return INK.test(text)
}

export function rowsOf(width, count, cells) {
  const rows = Array.from({ length: count }, () => Array.from("0".repeat(width)))
  for (const [x, row, code] of cells) rows[row][x] = code ?? "1"
  return rows.map(row => row.join(""))
}

export function mapGlyphs(glyphs, change) {
  return Object.fromEntries(Object.entries(glyphs).map(([char, glyph]) => [char, change(glyph)]))
}

export function inRows({ height, above, below }) {
  return y => y >= -below && y < height + above
}

export function fontRows(ys, density) {
  return Array.from(new Set(ys.map(y => Math.floor(y / density)))).sort((a, b) => a - b)
}

export function blankGlyph(font) {
  return { width: null, above: 0, below: 0, stretch: [], rows: rowsOf(font.width, font.height, []) }
}

export function glyphOf(font, char) {
  return font.glyphs[char] ?? blankGlyph(font)
}

export function widthOf(font, glyph) {
  return glyph.width ?? font.width
}

export function yOfRow(font, glyph, row) {
  return glyph.above + font.height - 1 - row
}

export const rowOfY = yOfRow

export function isBlank(glyph) {
  return !glyph.rows.some(hasInk)
}

export function shapeOf(font, glyph) {
  return { height: font.height, width: widthOf(font, glyph), above: glyph.above, below: glyph.below }
}

export function inkExtent(font, glyph) {
  let top = null
  let bottom = null
  for (const [row, text] of glyph.rows.entries()) {
    if (!hasInk(text)) continue
    const y = yOfRow(font, glyph, row)
    top ??= y + 1
    bottom = y
  }
  return { top, bottom }
}

export function inkLeft(glyph) {
  return Math.min(...glyph.rows.filter(hasInk).map(row => row.search(INK)))
}

function inkRight(row) {
  return row.length - 1 - Array.from(row).reverse().findIndex(code => code !== "0")
}

export function trimmed(font, glyph) {
  if (isBlank(glyph)) return glyph
  const left = inkLeft(glyph)
  const right = Math.max(...glyph.rows.filter(hasInk).map(inkRight)) + 1
  const { top, bottom } = inkExtent(font, glyph)
  const above = Math.min(glyph.above, Math.max(0, top - font.height))
  const below = Math.min(glyph.below, Math.max(0, -bottom))
  const width = right - left
  const rows = glyph.rows.slice(glyph.above - above, glyph.rows.length - glyph.below + below).map(row => row.slice(left, right))
  const stretch = glyph.stretch.filter(inRows({ height: font.height, above, below }))
  return { ...glyph, width: width === font.width ? null : width, above, below, rows, stretch }
}

export function inkCount(glyph) {
  return glyph.rows.join("").replaceAll("0", "").length
}

export function sameGlyph(a, b) {
  return a.width === b.width && a.above === b.above && a.below === b.below && a.rows.join() === b.rows.join() && a.stretch.join() === b.stretch.join()
}

export function setGlyph(font, char, glyph) {
  return { ...font, glyphs: { ...font.glyphs, [char]: glyph } }
}
