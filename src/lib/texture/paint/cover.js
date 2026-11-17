import { clamp } from "../../core/maths.js"
import { R, into, plain } from "./draw.js"

export function coverBox(entry, capHeight, sheet) {
  const baseline = entry.top + entry.glyph.top
  const top = baseline - capHeight - sheet.tallest.top
  return { x: entry.x - entry.glyph.wordX, y: top, width: sheet.wordWidth, height: baseline + sheet.tallest.bottom - top }
}

export function coverFit(box, image, x, y) {
  const scale = Math.max(box.width / image.width, box.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  return { x: box.x + (box.width - width) * x / 100, y: box.y + (box.height - height) * y / 100, width, height, scale }
}

function clipTo(ctx, [x, y, w, h]) {
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.beginPath()
  ctx.rect(x * R, y * R, w * R, h * R)
  ctx.clip()
}

function drawFront(ctx, image, fit, rect) {
  clipTo(ctx, rect)
  ctx.drawImage(image, fit.x * R, fit.y * R, fit.width * R, fit.height * R)
  ctx.restore()
}

function drawRow(ctx, image, fit, y, rect) {
  const row = clamp(Math.floor((y - fit.y) / fit.scale), 0, image.height - 1)
  clipTo(ctx, rect)
  ctx.drawImage(image, 0, row, image.width, 1, fit.x * R, rect[1] * R, fit.width * R, rect[3] * R)
  ctx.restore()
}

export function paintCover(ctx, entries, look, image, capHeight, sheet) {
  for (const entry of entries) {
    const fit = coverFit(coverBox(entry, capHeight, sheet), image, look.customCoverX, look.customCoverY)
    into(ctx, entry, "front")
    drawFront(ctx, image, fit, [entry.x, entry.top, entry.width, entry.height])
    if (entry.upHeight) {
      into(ctx, entry, "up")
      drawRow(ctx, image, fit, entry.top + 0.5, [entry.x, entry.up, entry.width, entry.upHeight])
    }
    if (entry.downHeight) {
      into(ctx, entry, "down")
      drawRow(ctx, image, fit, entry.top + entry.height - 0.5, [entry.x, entry.down, entry.width, entry.downHeight])
    }
  }
  plain(ctx)
}
