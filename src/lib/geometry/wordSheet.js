const GAP = 2

export function wordSheet(owned, depth, tallest) {
  const glyphs = {}
  let x = 0
  let height = 0
  for (const { key, glyph, source } of owned) {
    const top = depth + GAP
    const down = top + glyph.height + GAP
    glyphs[key] = { char: key, glyph, source, x, top, up: 0, upHeight: depth, down, downHeight: depth, width: glyph.width, height: glyph.height }
    x += glyph.width + GAP
    height = Math.max(height, down + depth + GAP)
  }
  const entries = Object.values(glyphs)
  const wordStart = Math.min(...entries.map(entry => entry.glyph.placedX))
  const wordWidth = entries.length ? Math.max(...entries.map(entry => entry.glyph.placedX + entry.width)) - wordStart : 0
  for (const entry of entries) entry.glyph.wordX = entry.glyph.placedX - wordStart
  return { width: Math.max(1, x), height: height + 1, glyphs, swatch: { x: 0, y: height }, tallest, wordWidth }
}
