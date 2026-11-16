const DEPTH_CODES = "23456789abcdefghijklmnopqrstuvwxyz"

export function depthOf(font, code) {
  return code === "1" ? 1 : font.depths?.[DEPTH_CODES.indexOf(code)] ?? 1
}

export function depthCode(font, depth) {
  if (depth >= 1) return { font, code: "1" }
  const depths = font.depths ?? []
  const known = depths.findIndex(value => Math.abs(value - depth) < 1e-6)
  if (known >= 0) return { font, code: DEPTH_CODES[known] }
  if (depths.length >= DEPTH_CODES.length) throw new Error(`a font can only have ${DEPTH_CODES.length + 1} different depths`)
  return { font: { ...font, depths: depths.concat(depth) }, code: DEPTH_CODES[depths.length] }
}

export function fontLayers(font, glyphs = Object.values(font.glyphs)) {
  const codes = new Set(glyphs.flatMap(glyph => Array.from(glyph.rows.join("")).filter(code => code !== "0")))
  const layers = Array.from(new Set(Array.from(codes, code => depthOf(font, code)))).sort((a, b) => b - a)
  return layers.length > 1 ? layers : null
}
