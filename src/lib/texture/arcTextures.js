import { surface } from "./canvas.js"
import { remember } from "../core/maths.js"
import { idOf } from "./paint/keys.js"

const CACHED_REMAPS = 32
const remaps = new WeakMap()

function runs(arc) {
  const list = []
  let row = 0
  let at = 0
  while (row < arc.counts.length) {
    let end = row + 1
    if (arc.stretchable[row]) while (end < arc.counts.length && arc.stretchable[end]) end++
    const height = arc.counts.slice(row, end).reduce((sum, count) => sum + count, 0)
    list.push({ from: row, rows: end - row, at, height })
    row = end
    at += height
  }
  return list
}

function remap(page, original, source, smooth) {
  const { canvas, ctx } = surface(page.width, page.height)
  const scale = source.width / original.width
  function copy(entry, part, sy, h, dy, dh = h) {
    const { source: from, glyph } = entry
    const [sx, sw] = glyph.fill ? [from.x + Math.floor(from.width / 2), 1] : [from.x, from.width]
    const region = entry.regions[part]
    if (sw > 0 && h > 0) ctx.drawImage(source, sx * scale, sy * scale, sw * scale, h * scale, region.x + (entry.x - region.u0) * region.sx, region.y + (dy - region.v0) * region.sy, entry.width * region.sx, dh * region.sy)
  }
  for (const entry of Object.values(page.glyphs)) {
    const { source: from, glyph } = entry
    copy(entry, "up", from.up, from.upHeight, entry.up, entry.upHeight)
    copy(entry, "down", from.down, from.downHeight, entry.down, entry.downHeight)
    const rows = glyph.arc.map
    if (!glyph.arc.top && !glyph.arc.bottom) {
      copy(entry, "front", from.top, from.height, entry.top)
      continue
    }
    if (!smooth && scale <= 1) {
      for (const [row, sourceRow] of rows.entries()) copy(entry, "front", from.top + from.height - 1 - sourceRow, 1, entry.top + rows.length - 1 - row)
      continue
    }
    for (const run of runs(glyph.arc)) copy(entry, "front", from.top + from.height - run.from - run.rows, run.rows, entry.top + rows.length - run.at - run.height, run.height)
  }
  return canvas
}

function cached(arced, original, source, smooth) {
  if (!remaps.has(arced)) remaps.set(arced, new Map())
  return remember(remaps.get(arced), `${smooth}:${idOf(source)}`, () => remap(arced, original, source, smooth), CACHED_REMAPS)
}

export function arcAssets(assets, arced, original) {
  const map = source => cached(arced, original, source, false)
  return {
    ...assets,
    shape: map(assets.shape),
    base: assets.base ? map(assets.base) : assets.base,
    fontOverlay: assets.fontOverlay ? map(assets.fontOverlay) : assets.fontOverlay,
    overlays: assets.overlays.map(overlay => overlay.source.generated ? overlay : { ...overlay, source: cached(arced, original, overlay.source, true) })
  }
}
