import { fillPattern, surface } from "../canvas.js"
import { remember, toRad } from "#lib/core/maths.js"
import { R, fillRect, into, pixelAt, plain, stripParts } from "./draw.js"
import { adjusted, adjustmentsOf } from "./adjust.js"

const CACHED_TILES = 8

const tileBlocks = new WeakMap()

function fract(n) {
  return n - Math.floor(n)
}

function random(x, y, z) {
  x = fract(x * 0.1031)
  y = fract(y * 0.1031)
  z = fract(z * 0.1031)
  const res = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32)
  return fract((x + y + res * 2) * (z + res))
}

function drawTile(ctx, tile, x, y, w, h, rotation, mirror) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(toRad(rotation))
  if (mirror) ctx.scale(-1, 1)
  ctx.drawImage(tile, -w / 2, -h / 2, w, h)
  ctx.restore()
}

function tiling(look, image) {
  const shifted = surface(image.width, image.height)
  const ox = look.tileableXOffset % image.width
  const oy = look.tileableYOffset % image.height
  shifted.ctx.drawImage(image, -ox, -oy)
  if (ox) shifted.ctx.drawImage(image, image.width - ox, -oy)
  if (oy) shifted.ctx.drawImage(image, -ox, image.height - oy)
  if (ox && oy) shifted.ctx.drawImage(image, image.width - ox, image.height - oy)
  return { tile: shifted.canvas, tw: Math.max(1, Math.round(image.width * look.tileableScale * R)), th: Math.max(1, Math.round(image.height * look.tileableScale * R)) }
}

function drawRandomTile(ctx, look, tile, x, y, w, h, seed, keyX = x, keyY = y) {
  const rotation = look.tileableRandomRotations ? Math.floor(random(seed, keyX, keyY) * 4) * 90 : 0
  const mirror = look.tileableRandomMirroring && random(seed + 400, keyX, keyY) < 0.5
  drawTile(ctx, tile, x, y, w, h, rotation, mirror)
}

export function firstTile(x, origin, size) {
  return origin + Math.floor((x - origin) / size) * size
}

function tileBlock(look, image) {
  const { tile, tw, th } = tiling(look, image)
  const block = surface(Math.ceil(64 * R / tw) * tw, Math.ceil(64 * R / th) * th)
  for (let ty = 0; ty < block.canvas.height; ty += th) {
    for (let tx = 0; tx < block.canvas.width; tx += tw) drawRandomTile(block.ctx, look, tile, tx, ty, tw, th, 7)
  }
  return block.canvas
}

export function adjustedTiles(look, image) {
  if (!tileBlocks.has(image)) tileBlocks.set(image, new Map())
  const key = JSON.stringify([look.tileableScale, look.tileableXOffset, look.tileableYOffset, look.tileableRandomRotations, look.tileableRandomMirroring, adjustmentsOf(look)])
  return remember(tileBlocks.get(image), key, () => adjusted(tileBlock(look, image), look).canvas, CACHED_TILES)
}

export function paintTiles(ctx, entries, look, image, capHeight) {
  const { tile, tw, th } = tiling(look, image)
  const randomised = look.tileableRandomRotations || look.tileableRandomMirroring

  function originOf(entry) {
    return look.tileablePerCharacter ? entry.x : entry.x - entry.glyph.lineX
  }

  function region([x, y, w, h], anchor, seed, origin) {
    const left = origin * R
    ctx.save()
    ctx.beginPath()
    ctx.rect(x * R, y * R, w * R, h * R)
    ctx.clip()
    ctx.fillStyle = "#ffffff"
    fillRect(ctx, [x, y, w, h])
    const start = anchor - Math.ceil((anchor - y * R) / th) * th
    if (!randomised) {
      fillPattern(ctx, tile, new DOMMatrix().translate(left, start).scale(tw / tile.width, th / tile.height))
      fillRect(ctx, [x, y, w, h])
    } else {
      for (let ty = start; ty < (y + h) * R; ty += th) {
        for (let tx = firstTile(x * R, left, tw); tx < (x + w) * R; tx += tw) {
          if (look.tileablePerCharacter) drawRandomTile(ctx, look, tile, tx, ty, tw, th, seed)
          else drawRandomTile(ctx, look, tile, tx, ty, tw, th, seed, tx - left, ty - anchor)
        }
      }
    }
    ctx.restore()
  }

  function seedOf(index, kind) {
    return look.tileablePerCharacter ? index + entries.length * kind : kind
  }

  for (const [index, entry] of entries.entries()) {
    into(ctx, entry, "front")
    region([entry.x, entry.top, entry.width, entry.height], (entry.top + entry.glyph.top - capHeight) * R, seedOf(index, 0), originOf(entry))
  }
  if (look.tileableTileEdges) {
    for (const [index, entry] of entries.entries()) {
      for (const [part, rect] of stripParts(entry)) {
        into(ctx, entry, part)
        region(rect, rect[1] * R, seedOf(index, part === "up" ? 1 : 2), originOf(entry))
      }
    }
    plain(ctx)
    return
  }
  plain(ctx)
  const faces = surface(ctx.canvas.width, ctx.canvas.height)
  faces.ctx.drawImage(ctx.canvas, 0, 0)
  for (const entry of entries) {
    const scale = entry.regions.front.sx
    const [left, top] = pixelAt(entry, "front", entry.x, entry.top)
    const bottom = pixelAt(entry, "front", entry.x, entry.top + entry.height)[1] - 1
    for (const [part, [x, y, width, height]] of stripParts(entry)) {
      const [px, py] = pixelAt(entry, part, x, y)
      const { sx, sy } = entry.regions[part]
      ctx.drawImage(faces.canvas, left, part === "up" ? top : bottom, entry.width * scale, 1, px, py, width * sx, height * sy)
    }
  }
}
