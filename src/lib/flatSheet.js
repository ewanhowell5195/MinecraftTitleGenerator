import { sheetLayout } from "./font.js"

const FACE = [255, 255, 255]
const UP = [176, 176, 176]
const DOWN = [84, 84, 84]

export function flatPixels(cells, capHeight, depth, density = 1, wideStrips = false) {
  const layout = sheetLayout(cells, capHeight, depth)
  let width = 0
  let height = 0
  for (const [glyph, at] of layout) {
    width = Math.max(width, at.x + glyph.width)
    height = Math.max(height, at.down + depth)
  }
  const data = new Uint8ClampedArray(width * density * height * density * 4)

  function paint(x, y, colour) {
    for (let j = 0; j < density; j++) {
      for (let i = 0; i < density; i++) {
        const at = ((y * density + j) * width * density + x * density + i) * 4
        data.set(colour, at)
        data[at + 3] = 255
      }
    }
  }

  for (const [glyph, at] of layout) {
    const solid = (row, column) => glyph.mask[row * glyph.width + column] === 1
    for (let r = 0; r < glyph.height; r++) {
      for (let c = 0; c < glyph.width; c++) if (solid(glyph.height - 1 - r, c)) paint(at.x + c, at.top + r, FACE)
    }
    for (let c = 0; c < glyph.width; c++) {
      for (let r = 0; r < depth; r++) {
        if (wideStrips || solid(glyph.height - 1, c)) paint(at.x + c, at.up + r, UP)
        if (wideStrips || solid(0, c)) paint(at.x + c, at.down + r, DOWN)
      }
    }
  }

  return { data, layout, width, height }
}
