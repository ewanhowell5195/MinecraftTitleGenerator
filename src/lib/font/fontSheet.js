import { pixelsOf } from "../texture/canvas.js"
import { image, textureList } from "../texture/assets.js"
import { sheetLayout } from "./sheet.js"
import { solidMask } from "./sheetParse.js"
import { defaultDepth } from "../settings/defaults.js"

const shapes = new WeakMap()

export function shapeFont(font, sheet, image) {
  const last = shapes.get(sheet)
  if (last?.font === font && last.image === image) return last.shaped
  const density = image.width / sheet.width
  const data = pixelsOf(image)
  const glyphs = { ...font.glyphs }
  for (const { char, glyph, x, top } of Object.values(sheet.glyphs)) glyphs[char] = { ...glyph, mask: solidMask(data, image.width, density, x, top, glyph.width, glyph.height) }
  const shaped = { ...font, glyphs }
  shapes.set(sheet, { font, image, shaped })
  return shaped
}

export async function sheetFor(font) {
  const [list, flat] = await Promise.all([textureList(font.sheetFolder), image(`${font.sheetFolder}/textures/flat.png`)])
  const depth = defaultDepth(font)
  const glyphs = {}
  let wide = 0
  for (const [glyph, at] of sheetLayout(font.cells, font.capHeight, depth)) {
    wide = Math.max(wide, at.x + glyph.width)
    if (font.glyphs[glyph.char] === glyph) glyphs[glyph.char] = { char: glyph.char, glyph, x: at.x, top: at.top, up: at.up, upHeight: depth, down: at.down, downHeight: depth, width: glyph.width, height: glyph.height }
  }
  return { width: font.layers?.length > 1 ? wide : flat.width / (list.textures.flat?.density ?? 1), glyphs }
}
