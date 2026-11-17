import { SPACE_CHAR, characterLabel } from "../lib/font/editor/characters.js"
import { depthOf } from "../lib/font/editor/depths.js"
import { rowOfY, yOfRow } from "../lib/font/editor/glyph.js"
import { depthShade } from "../lib/font/font.js"
import { CREEPER } from "../lib/font/order.js"
import { GUTTER, GUTTER_GAP } from "./glyphView.js"
import { font, glyph, selected } from "./store.js"

export const TOPLINE_COLOUR = "#2f7cf6"
export const BASELINE_COLOUR = "#2dbb4f"
export const STRETCH_COLOUR = "#f59e0b"
const GUIDE_FONT = "Arial, sans-serif"
const UNGUIDED = [SPACE_CHAR]

function inkColour(code) {
  const shade = depthShade(depthOf(font.value, code))
  return `rgb(${shade}, ${shade}, ${shade})`
}

function line(ctx, fromX, fromY, toX, toY) {
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
}

function drawGuide(ctx, centre, baseline, capHeight, width, room) {
  if (UNGUIDED.includes(selected.value)) return
  const text = characterLabel(selected.value === CREEPER ? font.value.letterCase === "both" ? "A" : "a" : selected.value, font.value.letterCase)
  if (!text.trim()) return
  ctx.save()
  ctx.font = `bold 100px ${GUIDE_FONT}`
  const capRatio = ctx.measureText("H").actualBoundingBoxAscent / 100
  ctx.font = `bold ${capHeight / capRatio}px ${GUIDE_FONT}`
  const measured = ctx.measureText(text)
  const textWidth = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight
  const below = Math.max(0, measured.actualBoundingBoxDescent)
  const tall = Math.min(1, capHeight / (measured.actualBoundingBoxAscent + below))
  const even = Math.min(tall, width * 0.9 / textWidth)
  const letter = /^[\p{L}\p{N}]+$/u.test(text)
  const seated = Math.min(1, room.above / measured.actualBoundingBoxAscent, below ? room.below / below : 1)
  const lower = letter && text !== text.toUpperCase() && seated >= tall
  const upright = lower ? seated : letter ? tall : even
  ctx.translate(centre, baseline - (lower ? 0 : below * upright))
  ctx.scale(letter ? width / textWidth : even, upright)
  ctx.fillStyle = `${TOPLINE_COLOUR}59`
  ctx.fillText(text, (measured.actualBoundingBoxLeft - measured.actualBoundingBoxRight) / 2, 0)
  ctx.restore()
}

export function useGlyphDrawing(canvas, hover, mirror, { available, view, board, columns, rows, xAt, yAt }) {
  let backdrop = "#000"
  let gutterColour = "#000"
  let hoverColour = "#fff"

  function readTheme(element) {
    const theme = getComputedStyle(element)
    backdrop = theme.getPropertyValue("--bg").trim() || backdrop
    gutterColour = theme.getPropertyValue("--line").trim() || gutterColour
    hoverColour = theme.getPropertyValue("--accent").trim() || hoverColour
  }

  function draw() {
    const element = canvas.value
    if (!element) return
    const { width, height } = available.value
    const ratio = devicePixelRatio || 1
    const ctx = element.getContext("2d")
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const current = glyph.value
    const currentFont = font.value
    const { left, top, right, bottom, gutter } = board.value
    const topline = yAt(current.above)
    const baseline = yAt(current.above + currentFont.height)
    ctx.fillStyle = "#fff"
    ctx.fillRect(left, top, right - left, bottom - top)
    ctx.fillStyle = "#dfe8f2"
    if (current.above) ctx.fillRect(left, top, right - left, topline - top)
    if (current.below) ctx.fillRect(left, baseline, right - left, bottom - baseline)
    drawGuide(ctx, (left + right) / 2, baseline, baseline - topline, right - left, { above: baseline - top, below: bottom - baseline })
    current.rows.forEach((text, row) => {
      for (let x = 0; x < text.length; x++) {
        if (text[x] === "0") continue
        ctx.fillStyle = inkColour(text[x])
        ctx.fillRect(xAt(x), yAt(row), xAt(x + 1) - xAt(x), yAt(row + 1) - yAt(row))
      }
    })
    ctx.lineWidth = 1
    if (view.value.cell >= 8) {
      ctx.strokeStyle = "#8888882e"
      ctx.beginPath()
      for (let x = 1; x < columns.value; x++) line(ctx, xAt(x) + 0.5, top, xAt(x) + 0.5, bottom)
      for (let row = 1; row < rows.value; row++) line(ctx, left, yAt(row) + 0.5, right, yAt(row) + 0.5)
      ctx.stroke()
    }
    if (currentFont.grid > 1) {
      ctx.strokeStyle = "#7a7f8a80"
      ctx.beginPath()
      for (let x = currentFont.grid; x < columns.value; x += currentFont.grid) line(ctx, xAt(x) + 0.5, top, xAt(x) + 0.5, bottom)
      for (let row = 1; row <= rows.value; row++) {
        const y = yOfRow(currentFont, current, row)
        if (((y % currentFont.grid) + currentFont.grid) % currentFont.grid === currentFont.grid - 1) line(ctx, left, yAt(row) + 0.5, right, yAt(row) + 0.5)
      }
      ctx.stroke()
    }
    ctx.lineWidth = 2
    ctx.strokeStyle = TOPLINE_COLOUR
    ctx.beginPath()
    line(ctx, left, topline, right, topline)
    ctx.stroke()
    ctx.strokeStyle = BASELINE_COLOUR
    ctx.beginPath()
    line(ctx, left, baseline, right, baseline)
    ctx.stroke()
    if (mirror.value) {
      const axis = xAt(columns.value / 2)
      ctx.strokeStyle = hoverColour
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      line(ctx, axis, top, axis, bottom)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (gutter < right + GUTTER_GAP) {
      ctx.fillStyle = backdrop
      ctx.fillRect(gutter - GUTTER_GAP, top, GUTTER_GAP, bottom - top)
    }
    ctx.fillStyle = gutterColour
    ctx.fillRect(gutter, top, GUTTER, bottom - top)
    ctx.fillStyle = STRETCH_COLOUR
    for (const y of current.stretch) {
      const row = rowOfY(currentFont, current, y)
      ctx.fillRect(gutter, yAt(row), GUTTER, yAt(row + 1) - yAt(row))
    }
    if (hover.value) {
      const { column, row, across, down } = hover.value
      const x = hover.value.gutter ? gutter : xAt(column)
      ctx.strokeStyle = hoverColour
      ctx.lineWidth = 2
      ctx.strokeRect(x, yAt(row), hover.value.gutter ? GUTTER : xAt(column + across) - x, yAt(row + down) - yAt(row))
      if (hover.value.mirror !== null && hover.value.mirror !== column) ctx.strokeRect(xAt(hover.value.mirror), yAt(row), xAt(hover.value.mirror + across) - xAt(hover.value.mirror), yAt(row + down) - yAt(row))
    }
  }

  return { draw, readTheme }
}
