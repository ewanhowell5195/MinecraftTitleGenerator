import { REQUIRED_CHARACTERS, fontFromShapes } from "./fontEditor.js"
import { OPENING_QUOTE } from "./order.js"

const CELLS = 16
const POUND_CELL = 156

function cellOf(char, lowercase) {
  if (char === "£") return POUND_CELL
  const source = char === OPENING_QUOTE ? "'" : lowercase ? char : char.toUpperCase()
  const code = source.codePointAt(0)
  return code > 32 && code < 127 ? code : null
}

function cellShape(image, index, { cellWidth, cellHeight, ascent, grid }) {
  if (index === null) return null
  const x0 = index % CELLS * cellWidth
  const y0 = Math.floor(index / CELLS) * cellHeight
  const filled = (x, y) => image.data[((y0 + y) * image.width + x0 + x) * 4 + 3] > 0
  let right = -1
  let first = Infinity
  let last = -1
  for (let y = 0; y < cellHeight; y++) {
    for (let x = 0; x < cellWidth; x++) {
      if (!filled(x, y)) continue
      right = Math.max(right, x)
      first = Math.min(first, y)
      last = Math.max(last, y)
    }
  }
  if (right < 0) return null
  const width = (right + 1) * grid
  const height = (last - first + 1) * grid
  const mask = new Uint8Array(width * height)
  for (let y = first; y <= last; y++) {
    for (let x = 0; x <= right; x++) {
      if (!filled(x, y)) continue
      for (let dy = 0; dy < grid; dy++) mask.fill(1, ((y - first) * grid + dy) * width + x * grid, ((y - first) * grid + dy) * width + (x + 1) * grid)
    }
  }
  return { width, height, top: (ascent - first) * grid, bottom: (ascent - last - 1) * grid, mask }
}

export function fontFromAscii(image, { height = 40, lowercase = false } = {}) {
  if (image.width % CELLS || image.height % CELLS) throw new Error(`an ascii.png is a 16 by 16 grid of characters, and ${image.width} by ${image.height} doesn't divide into one`)
  const cellWidth = image.width / CELLS
  const cellHeight = image.height / CELLS
  if (cellHeight % 8) throw new Error(`each character in this ascii.png is ${cellHeight} pixels tall, and Minecraft needs a multiple of 8`)
  const ascent = cellHeight / 8 * 7
  const grid = Math.max(1, Math.round(height / ascent))
  const shapes = new Map(REQUIRED_CHARACTERS.map(char => [char, cellShape(image, cellOf(char, lowercase), { cellWidth, cellHeight, ascent, grid })]))
  return fontFromShapes(shapes, { name: "Minecraft Font", capHeight: ascent * grid, grid, spaceWidth: cellHeight / 2 * grid })
}
