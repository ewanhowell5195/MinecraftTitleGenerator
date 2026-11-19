import { surface } from "./canvas.js"
import { adjusted } from "./paint/adjust.js"
import { cellOf, sideOf } from "../geometry/modelShape.js"

const SHADE = { north: 1, south: 1, up: 1, down: 0.6, east: 0.75, west: 0.75 }

function tinted(ctx, y, width, height, tint) {
  if (!tint || tint.every(channel => channel === 1)) return
  const pixels = ctx.getImageData(0, y, width, height)
  for (let at = 0; at < pixels.data.length; at += 4) {
    for (let channel = 0; channel < 3; channel++) pixels.data[at + channel] = Math.round(pixels.data[at + channel] * tint[channel])
  }
  ctx.putImageData(pixels, 0, y)
}

export function solidAdjusted(surface, look, width, height) {
  const pixels = surface.ctx.getImageData(0, 0, width, height)
  const alpha = pixels.data.filter((value, index) => index % 4 === 3)
  for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = 255
  surface.ctx.putImageData(pixels, 0, 0)
  const out = adjusted(surface.canvas, look, { willReadFrequently: true })
  const result = out.ctx.getImageData(0, 0, width, height)
  for (let at = 3; at < result.data.length; at += 4) result.data[at] = alpha[(at - 3) / 4]
  out.ctx.putImageData(result, 0, 0)
  return out
}

export function packing(faces) {
  const cells = faces.map(cellOf)
  let y = 0
  for (const cell of cells) {
    cell.at = y
    y += cell.height
  }
  return { cells, width: Math.max(...cells.map(cell => cell.width)), height: y + 1, swatchY: y }
}

export function atlasOf({ cells, width, height }, sources) {
  const atlas = surface(width, height, { willReadFrequently: true })
  for (const cell of cells) {
    atlas.ctx.drawImage(sources[cell.face.source], cell.x, cell.y, cell.width, cell.height, 0, cell.at, cell.width, cell.height)
    tinted(atlas.ctx, cell.at, cell.width, cell.height, cell.face.tint)
    const factor = SHADE[sideOf(cell.face)]
    if (factor < 1) {
      atlas.ctx.globalCompositeOperation = "source-atop"
      atlas.ctx.fillStyle = `rgba(0, 0, 0, ${1 - factor})`
      atlas.ctx.fillRect(0, cell.at, cell.width, cell.height)
      atlas.ctx.globalCompositeOperation = "source-over"
    }
  }
  return atlas
}
