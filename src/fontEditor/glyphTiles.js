import { depthShade } from "../lib/font/font.js"
import { depthOf } from "../lib/font/editor/depths.js"
import { glyphOf, widthOf } from "../lib/font/editor/glyph.js"

const SQUARE_LINE = "#6b7280"
const CELL_LINE = "rgba(140, 147, 160, 0.6)"
const CELL_ON_INK = "rgba(140, 147, 160, 0.18)"

export function tileLine(font, chars) {
  const glyphs = chars.map(char => glyphOf(font, char))
  const above = Math.max(0, ...glyphs.map(glyph => glyph.above))
  const below = Math.max(0, ...glyphs.map(glyph => glyph.below))
  return { glyphs, above, below, rows: above + font.height + below, columns: glyphs.reduce((total, glyph) => total + widthOf(font, glyph), 0) }
}

export function fitCell(lines, { width, gap, most = 16 }) {
  const across = Math.min(...lines.map(line => (width - gap * (line.glyphs.length - 1)) / line.columns))
  return Math.max(0.05, Math.min(most, across))
}

function gridLines(ctx, x, y, columns, rows, step, skip = null) {
  ctx.beginPath()
  for (let column = step; column < columns; column += step) {
    ctx.moveTo(x(column) + 0.5, y(0))
    ctx.lineTo(x(column) + 0.5, y(rows))
  }
  for (let row = 1; row < rows; row++) {
    if (skip?.(row)) continue
    ctx.moveTo(x(0), y(row) + 0.5)
    ctx.lineTo(x(columns), y(row) + 0.5)
  }
  ctx.stroke()
}

function glyphImage(font, glyph, columns) {
  const image = new ImageData(Math.max(1, columns), Math.max(1, glyph.rows.length))
  glyph.rows.forEach((text, row) => {
    for (let column = 0; column < Math.min(text.length, columns); column++) {
      if (text[column] === "0") continue
      const at = (row * image.width + column) * 4
      image.data.fill(depthShade(depthOf(font, text[column])), at, at + 3)
      image.data[at + 3] = 255
    }
  })
  const canvas = new OffscreenCanvas(image.width, image.height)
  canvas.getContext("2d").putImageData(image, 0, 0)
  return canvas
}

export function drawTiles(canvas, font, line, cell, gap) {
  const ratio = devicePixelRatio || 1
  const starts = []
  let edge = -gap
  for (const glyph of line.glyphs) {
    starts.push(edge + gap)
    edge = Math.round(edge + gap + widthOf(font, glyph) * cell)
  }
  const width = edge + 1
  const height = Math.round(line.rows * cell) + 1
  canvas.width = Math.ceil(width * ratio)
  canvas.height = Math.ceil(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext("2d")
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 1
  const subgrid = cell >= 4 && font.grid > 1
  const squares = font.grid * cell >= 6
  const snap = cell >= 1 ? Math.round : value => value
  line.glyphs.forEach((glyph, index) => {
    const columns = widthOf(font, glyph)
    const x = column => snap(starts[index] + column * cell)
    const y = row => snap(row * cell)
    const offset = line.above - glyph.above
    if (subgrid) {
      ctx.strokeStyle = CELL_LINE
      gridLines(ctx, x, y, columns, line.rows, 1)
    }
    if (cell >= 1) {
      glyph.rows.forEach((text, row) => {
        for (let column = 0; column < text.length; column++) {
          if (text[column] === "0") continue
          const shade = depthShade(depthOf(font, text[column]))
          ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`
          ctx.fillRect(x(column), y(row + offset), x(column + 1) - x(column), y(row + offset + 1) - y(row + offset))
        }
      })
    } else {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(glyphImage(font, glyph, columns), x(0), y(offset), columns * cell, glyph.rows.length * cell)
    }
    if (subgrid) {
      ctx.strokeStyle = CELL_ON_INK
      gridLines(ctx, x, y, columns, line.rows, 1)
    }
    ctx.strokeStyle = SQUARE_LINE
    if (squares) gridLines(ctx, x, y, columns, line.rows, font.grid, row => (line.above + font.height - row) % font.grid)
    ctx.strokeRect(x(0) + 0.5, y(0) + 0.5, x(columns) - x(0), y(line.rows) - y(0))
  })
}
