import opentype from "opentype.js"
import { DEFAULT_SPACE_WIDTH, REQUIRED_CHARACTERS, fontFromShapes } from "./fontEditor.js"
import { capUnits, flatten, glyphFor, gridShift, pixelGrid, rasterise } from "./fontOutline.js"

export async function parseFontFile(buffer) {
  const start = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (start === "ttcf") throw new Error("font collections (.ttc) can't be imported, use a single .ttf or .otf")
  if (start !== "wOF2") return opentype.parse(buffer)
  const { default: decompress } = await import("woff2-encoder/decompress")
  const font = await decompress(buffer)
  return opentype.parse(font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength))
}

function scaled(source, { height = 40, lowercase = false }) {
  const glyphs = REQUIRED_CHARACTERS.map(char => glyphFor(source, char, lowercase))
  const units = capUnits(source)
  const unit = pixelGrid(glyphs.filter(Boolean), units)
  const block = unit ? Math.max(1, Math.round(height / (units / unit))) : null
  const scale = unit ? block / unit : height / units
  const capHeight = Math.round(units * scale)
  if (!Number.isFinite(scale) || capHeight < 1) throw new Error("this font has no usable cap height")
  return { glyphs, unit, block, scale, capHeight }
}

export function meshOutlines(source, options = {}) {
  const { glyphs, unit, scale } = scaled(source, options)
  return Object.fromEntries(REQUIRED_CHARACTERS.flatMap((char, index) => {
    const glyph = glyphs[index]
    const shift = glyph ? gridShift(glyph, unit, scale) : 0
    const shape = glyph && rasterise(glyph, scale, shift)
    if (!shape) return []
    return [[char, flatten(glyph).map(points => points.map(([x, y]) => [(x + shift) * scale - shape.left, y * scale]))]]
  }))
}

export function fontFromOutlines(source, options = {}) {
  const { glyphs, unit, block, scale, capHeight } = scaled(source, options)
  const shapes = new Map(REQUIRED_CHARACTERS.map((char, index) => {
    const glyph = glyphs[index]
    return [char, glyph ? rasterise(glyph, scale, gridShift(glyph, unit, scale)) : null]
  }))
  const space = source.charToGlyph(" ")
  const spaceWidth = space && space.index !== 0 ? Math.round(space.advanceWidth * scale) : Math.round(capHeight / 4) || DEFAULT_SPACE_WIDTH
  return fontFromShapes(shapes, { name: (source.getEnglishName("fullName") ?? "Imported Font").trim(), author: (source.getEnglishName("designer") ?? "").trim(), capHeight, grid: block, spaceWidth, missing: REQUIRED_CHARACTERS.filter((_, index) => !glyphs[index]) })
}
