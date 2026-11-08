import opentype from "opentype.js"
import { DEFAULT_ORDER } from "./font.js"
import { CREEPER, DEFAULT_SPACE_WIDTH, fontFromShapes } from "./fontEditor.js"
import { capUnits, glyphFor, gridShift, pixelGrid, rasterise } from "./fontOutline.js"

export function parseFontFile(buffer) {
  const start = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (start === "ttcf") throw new Error("font collections (.ttc) can't be imported, use a single .ttf or .otf")
  return opentype.parse(buffer)
}

export function fontFromOutlines(source, { height = 40, lowercase = false } = {}) {
  const characters = Array.from(DEFAULT_ORDER).filter(char => char !== CREEPER)
  const glyphs = characters.map(char => glyphFor(source, char, lowercase))
  const units = capUnits(source)
  const unit = pixelGrid(glyphs.filter(Boolean), units)
  const block = unit ? Math.max(1, Math.round(height / (units / unit))) : null
  const scale = unit ? block / unit : height / units
  const capHeight = Math.round(units * scale)
  if (!Number.isFinite(scale) || capHeight < 1) throw new Error("this font has no usable cap height")
  const shapes = new Map(characters.map((char, index) => {
    const glyph = glyphs[index]
    return [char, glyph ? rasterise(glyph, scale, gridShift(glyph, unit)) : null]
  }))
  const space = source.charToGlyph(" ")
  const spaceWidth = space && space.index !== 0 ? Math.round(space.advanceWidth * scale) : Math.round(capHeight / 4) || DEFAULT_SPACE_WIDTH
  return fontFromShapes(shapes, { name: (source.getEnglishName("fullName") ?? "Imported Font").trim(), author: (source.getEnglishName("designer") ?? "").trim(), capHeight, grid: block, spaceWidth, missing: characters.filter((char, index) => !glyphs[index]) })
}
