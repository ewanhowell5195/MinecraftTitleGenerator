import { gradientLine, gradientStops } from "../colourStops.js"
import { fillRect, gradientFill, into, plain, stripParts } from "./draw.js"

function edgeFill(ctx, [x0, y0], [x1, y1], y, stops) {
  const dx = x1 - x0
  const dy = y1 - y0
  const length = dx * dx + dy * dy
  const offset = ((y - y0) * dy - x0 * dx) / length
  if (Math.abs(dx) < 1e-9) return offset < 0.5 ? stops[0].colour : stops[stops.length - 1].colour
  const slope = dx / length
  return gradientFill(ctx, [-offset / slope, 0], [(1 - offset) / slope, 0], stops)
}

export function gradientEnds(entry, look, capHeight, sheet) {
  const baseline = entry.top + entry.glyph.top
  const arc = look.arcGradient ? entry.glyph.arc : sheet.tallest
  const top = baseline - capHeight - arc.top
  const bottom = baseline + arc.bottom
  const [from, to] = gradientLine(entry.x - entry.glyph.wordX, top, sheet.wordWidth, bottom - top, look.gradientAngle)
  return { from, to, top, bottom }
}

export function paintGradient(ctx, entries, look, capHeight, sheet) {
  const stops = gradientStops(look.stops, look.smooth, look.mix)
  for (const entry of entries) {
    const { from, to, top, bottom } = gradientEnds(entry, look, capHeight, sheet)
    into(ctx, entry, "front")
    ctx.fillStyle = gradientFill(ctx, from, to, stops)
    fillRect(ctx, [entry.x, entry.top, entry.width, entry.height])
    for (const [part, rect] of stripParts(entry)) {
      into(ctx, entry, part)
      ctx.fillStyle = edgeFill(ctx, from, to, part === "up" ? top : bottom, stops)
      fillRect(ctx, rect)
    }
  }
  plain(ctx)
}
