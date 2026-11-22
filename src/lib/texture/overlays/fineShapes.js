import { generatedAlpha } from "./faces.js"
import { isolines } from "./isolines.js"
import { fadeShown } from "./outlines.js"
import { clippedTo } from "./patterns.js"
import { FADE_KINDS, settingsOf } from "./settings.js"

const SCALE = 8
export const FINE_SHAPED = ["outline", "outline_fade", "outline_fade_inverted", "two_tone_outline", "top", "bottom", "left", "right", "corners"]

export function fineShapes(glyph, kind, layer, capHeight) {
  if (!glyph.fine?.rings || !glyph.width || !glyph.height) return null
  const faded = FADE_KINDS.has(kind)
  const alpha = generatedAlpha(glyph, faded ? "outline" : kind, faded ? { ...layer, inset: 0 } : layer, capHeight, SCALE)
  const loops = isolines(alpha, glyph.width * SCALE, glyph.height * SCALE, 0.5).map(loop => loop.map(([x, y]) => [x / SCALE, y / SCALE]))
  if (!faded) return loops
  const level = ([, y]) => glyph.bottom + glyph.height - y
  return fadeShown(glyph, kind, { ...settingsOf(kind, layer), capHeight }).flatMap(([low, high]) => loops.map(loop => clippedTo(clippedTo(loop, point => level(point) - low), point => high - level(point)))).filter(loop => loop.length > 2)
}
