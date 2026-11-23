import { depthShade } from "../sheet.js"
import { NOISE } from "../sheetParse.js"

const DEPTH_CODES = "23456789abcdefghijklmnopqrstuvwxyz"
export const MIN_DEPTH = 0.04

export function depthOf(font, code) {
  return code === "1" ? 1 : Math.max(MIN_DEPTH, font.depths?.[DEPTH_CODES.indexOf(code)] ?? 1)
}

function usedCodes(glyphs) {
  return new Set(glyphs.flatMap(glyph => Array.from(glyph.rows.join(""))).filter(code => code !== "0"))
}

function sharedCode(font, depths, depth) {
  const used = usedCodes(Object.values(font.glyphs ?? {}))
  const apart = code => Math.abs(depthShade(depthOf(font, code)) - depthShade(depth))
  const near = depths.map((value, index) => DEPTH_CODES[index]).filter(code => used.has(code) && apart(code) <= NOISE)
  return near.sort((a, b) => apart(a) - apart(b))[0] ?? null
}

export function depthCode(font, wanted) {
  const depth = Math.max(MIN_DEPTH, wanted)
  if (depthShade(depth) <= NOISE) return { font, code: "1" }
  const depths = font.depths ?? []
  const shared = sharedCode(font, depths, depth)
  if (shared) return { font, code: shared }
  const known = depths.findIndex(value => Math.abs(value - depth) < 1e-6)
  if (known >= 0) return { font, code: DEPTH_CODES[known] }
  if (depths.length >= DEPTH_CODES.length) throw new Error(`a font can only have ${DEPTH_CODES.length + 1} different depths`)
  return { font: { ...font, depths: depths.concat(depth) }, code: DEPTH_CODES[depths.length] }
}

export function fontLayers(font, glyphs = Object.values(font.glyphs)) {
  const layers = Array.from(new Set(Array.from(usedCodes(glyphs), code => depthOf(font, code)))).sort((a, b) => b - a)
  return layers.length > 1 ? layers : null
}
