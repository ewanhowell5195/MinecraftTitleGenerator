import { FADE_KINDS, settingsOf } from "./settings.js"
import { blockPixels, extrusionOutline, finePixels, joinedPixels, upscale } from "./outlines.js"
import { shine, waveFill } from "./patterns.js"
import { crackFaces } from "./cracks.js"
import { shadow } from "./shadows.js"

export function generatedAlpha(glyph, kind, layer, capHeight, scale, soft = false) {
  const settings = { ...settingsOf(kind, layer), capHeight }
  if (kind === "shadow") return shadow(glyph, settings, scale)
  if (kind === "extrusion_outline") return extrusionOutline(glyph, settings, scale)
  const fine = glyph.fine?.(scale) ?? null
  if (kind === "shine" || kind === "shine_random") return shine(glyph, kind, settings, scale, fine)
  if (kind === "wave") return waveFill(glyph, settings, scale, fine)
  if (kind === "cracks") return crackFaces(glyph, layer, scale, fine, soft)
  if (fine && kind !== "corners") return finePixels(glyph, fine, kind, settings, scale)
  if (!Number.isInteger(settings.thickness ?? 1) || FADE_KINDS.has(kind) && scale > 1) return blockPixels(glyph, kind, settings, scale)
  const alpha = upscale(joinedPixels(glyph, kind, settings), glyph.width, glyph.height, scale, true)
  if (fine) {
    const columns = glyph.width * scale
    const rows = glyph.height * scale
    for (let index = 0; index < alpha.length; index++) alpha[index] *= fine[(rows - 1 - Math.floor(index / columns)) * columns + index % columns]
  }
  return alpha
}
