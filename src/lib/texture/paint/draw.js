import { linearGradient, surface } from "../canvas.js"

export const R = 4

export const CACHED_OVERLAYS = 32

export function into(ctx, entry, part) {
  const region = entry.regions[part]
  ctx.setTransform(region.sx / R, 0, 0, region.sy / R, region.x - region.u0 * region.sx, region.y - region.v0 * region.sy)
}

export function plain(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

export function pixelAt(entry, part, u, v) {
  const region = entry.regions[part]
  return [region.x + (u - region.u0) * region.sx, region.y + (v - region.v0) * region.sy]
}

export function stripParts(entry) {
  return [["up", [entry.x, entry.up, entry.width, entry.upHeight]], ["down", [entry.x, entry.down, entry.width, entry.downHeight]]].filter(([, rect]) => rect[3] > 0)
}

export function fillRect(ctx, [x, y, w, h]) {
  ctx.fillRect(x * R, y * R, w * R, h * R)
}

export function gradientFill(ctx, [x0, y0], [x1, y1], stops) {
  return linearGradient(ctx, x0 * R, y0 * R, x1 * R, y1 * R, stops)
}

export function pageSurface(sheet, options) {
  return surface(sheet.width, sheet.height, options)
}
