import opentype from "opentype.js"
import { DEFAULT_SPACE_WIDTH, REQUIRED_CHARACTERS, fontFromShapes } from "./fontEditor.js"
import { capUnits, flatten, glyphFor, gridShift, pixelGrid, rasterise } from "./fontOutline.js"

export function englishName(source, key) {
  const names = source.names.unicode ?? source.names.macintosh ?? source.names.windows
  return names?.[key]?.en?.trim() ?? ""
}

export async function parseFontFile(buffer) {
  if (buffer.byteLength < 4) throw new Error("that file is empty or too short to be a font")
  const start = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (start === "ttcf") throw new Error("font collections (.ttc) can't be imported, use a single .ttf or .otf")
  if (start !== "wOF2") return opentype.parse(buffer)
  const { default: decompress } = await import("woff2-encoder/decompress")
  const font = await decompress(buffer)
  return opentype.parse(font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength))
}

function scaled(source, { height = 40, lowercase = false, density = 1 }) {
  const glyphs = REQUIRED_CHARACTERS.map(char => glyphFor(source, char, lowercase))
  const units = capUnits(source)
  const unit = pixelGrid(glyphs.filter(Boolean), units)
  const block = unit ? Math.max(1, Math.round(height / (units / unit))) : density > 1 ? density : null
  const square = unit ? 1 : density
  const scale = unit ? block / unit : Math.max(1, Math.round(height / square)) / units
  const capHeight = Math.round(units * scale) * square
  if (!Number.isFinite(scale) || capHeight < 1) throw new Error("this font has no usable cap height")
  return { glyphs, unit, block, scale, square, capHeight }
}

function enlarged(shape, square) {
  if (!shape || square === 1) return shape
  const width = shape.width * square
  const mask = new Uint8Array(width * shape.height * square)
  for (let y = 0; y < mask.length / width; y++) {
    for (let x = 0; x < width; x++) mask[y * width + x] = shape.mask[Math.floor(y / square) * shape.width + Math.floor(x / square)]
  }
  return { left: shape.left * square, bottom: shape.bottom * square, top: shape.top * square, width, height: shape.height * square, mask }
}

export function meshOutlines(source, options = {}) {
  const { glyphs, unit, scale, square } = scaled(source, options)
  return Object.fromEntries(REQUIRED_CHARACTERS.flatMap((char, index) => {
    const glyph = glyphs[index]
    const shift = glyph ? gridShift(glyph, unit, scale) : 0
    const shape = glyph && rasterise(glyph, scale, shift)
    if (!shape) return []
    return [[char, flatten(glyph).map(points => points.map(([x, y]) => [((x + shift) * scale - shape.left) * square, y * scale * square]))]]
  }))
}

export function fontFromOutlines(source, options = {}) {
  const { glyphs, unit, block, scale, square, capHeight } = scaled(source, options)
  const shapes = new Map(REQUIRED_CHARACTERS.map((char, index) => {
    const glyph = glyphs[index]
    return [char, glyph ? enlarged(rasterise(glyph, scale, gridShift(glyph, unit, scale)), square) : null]
  }))
  const space = source.charToGlyph(" ")
  const spaceWidth = space && space.index !== 0 ? Math.round(space.advanceWidth * scale) * square : Math.round(capHeight / 4) || DEFAULT_SPACE_WIDTH
  return fontFromShapes(shapes, { name: englishName(source, "fullName") || "Imported Font", authors: englishName(source, "designer"), capHeight, grid: block, spaceWidth })
}
