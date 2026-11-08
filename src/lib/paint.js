import { surface } from "./canvas.js"
import { hexOf } from "./colour.js"
import { PLACED_KINDS, edgeAlpha, generatedAlpha } from "./generated.js"
import { gradientLine, gradientStops } from "./material.js"
import { clamp } from "./maths.js"
import { stripY } from "./strips.js"

export const R = 4

const CACHED_OVERLAYS = 32
const SOFT_LABEL = 16
const WAVE_KINDS = new Set(["wave", "wave_inverted"])

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

function averageColour(image, rects) {
  const sum = [0, 0, 0]
  let count = 0
  for (const [x, y, w, h] of rects) {
    for (let row = y * R; row < (y + h) * R; row++) {
      for (let column = x * R; column < (x + w) * R; column++) {
        const at = (row * image.width + column) * 4
        if (image.data[at + 3] < 128) continue
        sum[0] += image.data[at]
        sum[1] += image.data[at + 1]
        sum[2] += image.data[at + 2]
        count++
      }
    }
  }
  return count ? hexOf(sum.map(value => value / count)) : "#000000"
}

function strips(entry) {
  return [[entry.x, entry.up, entry.width, entry.upHeight], [entry.x, entry.down, entry.width, entry.downHeight]].filter(rect => rect[3] > 0)
}

function fillRect(ctx, [x, y, w, h]) {
  ctx.fillRect(x * R, y * R, w * R, h * R)
}

function fillRects(ctx, rects) {
  ctx.beginPath()
  for (const [x, y, w, h] of rects) ctx.rect(x * R, y * R, w * R, h * R)
  ctx.fill()
}

function gradientFill(ctx, [x0, y0], [x1, y1], stops) {
  const gradient = ctx.createLinearGradient(x0 * R, y0 * R, x1 * R, y1 * R)
  for (const stop of stops) gradient.addColorStop(stop.position, stop.colour)
  return gradient
}

function edgeFill(ctx, [x0, y0], [x1, y1], y, stops) {
  const dx = x1 - x0
  const dy = y1 - y0
  const length = dx * dx + dy * dy
  const offset = ((y - y0) * dy - x0 * dx) / length
  if (Math.abs(dx) < 1e-9) return offset < 0.5 ? stops[0].colour : stops[stops.length - 1].colour
  const slope = dx / length
  return gradientFill(ctx, [-offset / slope, 0], [(1 - offset) / slope, 0], stops)
}

function gradientEnds(entry, look, capHeight, sheet) {
  const baseline = entry.top + entry.glyph.top
  const arc = look.arcGradient ? entry.glyph.arc : sheet.tallest
  const top = baseline - capHeight - arc.top
  const bottom = baseline + arc.bottom
  const [from, to] = gradientLine(entry.x - entry.glyph.wordX, top, sheet.wordWidth, bottom - top, look.gradientAngle)
  return { from, to, top, bottom }
}

function adjustmentsOf(look) {
  return [look.hue, look.saturation, look.brightness, look.contrast, look.blend, look.colour, look.colourOpacity]
}

function paintedStops(look) {
  const stops = gradientStops(look.stops, look.smooth)
  const data = remember(adjustedColours, JSON.stringify([stops, adjustmentsOf(look)]), () => {
    const row = surface(stops.length, 1)
    for (const [index, stop] of stops.entries()) {
      row.ctx.fillStyle = stop.colour
      row.ctx.fillRect(index, 0, 1, 1)
    }
    return adjusted(row.canvas, look, { willReadFrequently: true }).ctx.getImageData(0, 0, stops.length, 1).data
  })
  return stops.map((stop, index) => ({ position: stop.position, colour: data[index * 4] | data[index * 4 + 1] << 8 | data[index * 4 + 2] << 16 }))
}

function paintGradient(ctx, entries, look, capHeight, sheet) {
  const stops = gradientStops(look.stops, look.smooth)
  for (const entry of entries) {
    const { from, to, top, bottom } = gradientEnds(entry, look, capHeight, sheet)
    ctx.fillStyle = gradientFill(ctx, from, to, stops)
    fillRect(ctx, [entry.x, entry.top, entry.width, entry.height])
    ctx.fillStyle = edgeFill(ctx, from, to, top, stops)
    if (entry.upHeight) fillRect(ctx, [entry.x, entry.up, entry.width, entry.upHeight])
    ctx.fillStyle = edgeFill(ctx, from, to, bottom, stops)
    if (entry.downHeight) fillRect(ctx, [entry.x, entry.down, entry.width, entry.downHeight])
  }
}

function drawTile(ctx, tile, x, y, w, h, rotation, mirror) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(rotation * Math.PI / 180)
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

function paintTiles(ctx, entries, look, image, capHeight) {
  const { tile, tw, th } = tiling(look, image)
  const pattern = look.tileableRandomRotations || look.tileableRandomMirroring ? null : ctx.createPattern(tile, "repeat")

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
    if (pattern) {
      pattern.setTransform(new DOMMatrix().translate(left, start).scale(tw / tile.width, th / tile.height))
      ctx.fillStyle = pattern
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

  for (const [index, entry] of entries.entries()) region([entry.x, entry.top, entry.width, entry.height], (entry.top + entry.glyph.top - capHeight) * R, seedOf(index, 0), originOf(entry))
  if (look.tileableTileEdges) {
    for (const [index, entry] of entries.entries()) {
      if (entry.upHeight) region([entry.x, entry.up, entry.width, entry.upHeight], entry.up * R, seedOf(index, 1), originOf(entry))
      if (entry.downHeight) region([entry.x, entry.down, entry.width, entry.downHeight], entry.down * R, seedOf(index, 2), originOf(entry))
    }
    return
  }
  const faces = surface(ctx.canvas.width, ctx.canvas.height)
  faces.ctx.drawImage(ctx.canvas, 0, 0)
  for (const entry of entries) {
    if (entry.upHeight) ctx.drawImage(faces.canvas, entry.x * R, entry.top * R, entry.width * R, 1, entry.x * R, entry.up * R, entry.width * R, entry.upHeight * R)
    if (entry.downHeight) ctx.drawImage(faces.canvas, entry.x * R, (entry.top + entry.height) * R - 1, entry.width * R, 1, entry.x * R, entry.down * R, entry.width * R, entry.downHeight * R)
  }
}

function stripRuns(map) {
  const runs = []
  for (const [row, from] of map.entries()) {
    const last = runs.at(-1)
    if (last && row === last.row + last.height && from - row === last.from - last.row) last.height++
    else runs.push({ row, from, height: 1 })
  }
  return runs
}

function paintStrip(ctx, entries, strip) {
  const pattern = ctx.createPattern(strip.image, "repeat")
  ctx.fillStyle = pattern
  for (const entry of entries) {
    const { glyph, source } = entry
    const origin = strip.tiling === "character" ? entry.x : entry.x - glyph.lineX
    for (const { row, from, height } of stripRuns(glyph.arc.map)) {
      const rows = strip.scale ? Array.from({ length: height }, (_, step) => [row + step, from + step, 1]) : [[row, from, height]]
      for (const [first, start, count] of rows) {
        const band = strip.depth + strip.top - 1 - stripY(strip, source.glyph.bottom + start)
        const y = entry.top + glyph.height - 1 - first
        pattern.setTransform(new DOMMatrix().translate(origin * R, (y - band) * R).scale(R / strip.density))
        fillRect(ctx, [entry.x, y - count + 1, entry.width, count])
      }
    }
    for (const [y, from, depth] of [[entry.up, 0, entry.upHeight], [entry.down, strip.depth + strip.top - strip.bottom, entry.downHeight]]) {
      const stretch = depth / strip.depth
      pattern.setTransform(new DOMMatrix().translate(origin * R, (y - from * stretch) * R).scale(R / strip.density, R / strip.density * stretch))
      fillRect(ctx, [entry.x, y, entry.width, depth])
    }
  }
}

function putAlpha(ctx, alpha, width, height, x, y) {
  const image = ctx.createImageData(width * R, height * R)
  image.data.fill(255)
  for (let index = 0; index < alpha.length; index++) image.data[index * 4 + 3] = Math.round(alpha[index] * 255)
  ctx.putImageData(image, x * R, y * R)
}

function generate(ctx, entries, kind, layer, capHeight) {
  for (const { glyph, x, top } of entries) {
    if (glyph.width && glyph.height) putAlpha(ctx, generatedAlpha(glyph, kind, layer, capHeight, R), glyph.width, glyph.height, x, top)
  }
}

function generateEdges(ctx, entries, kind, layer) {
  for (const entry of entries) {
    if (!entry.glyph.width || !entry.glyph.height) continue
    for (const [side, y, depth] of [["up", entry.up, entry.upHeight], ["down", entry.down, entry.downHeight]]) {
      if (depth) putAlpha(ctx, edgeAlpha(entry.glyph, side, kind, layer, depth, R), entry.glyph.width, depth, entry.x, y)
    }
  }
}

function drawOverlay(sheet, layer, source, capHeight) {
  const overlay = surface(sheet.width * R, sheet.height * R)
  if (source.edge) generateEdges(overlay.ctx, Object.values(sheet.glyphs), source.edge, layer)
  else if (source.generated) generate(overlay.ctx, Object.values(sheet.glyphs), source.generated, layer, capHeight)
  else overlay.ctx.drawImage(source, 0, 0)
  return overlay
}

function colourOverlay(mask, layer) {
  const { width, height } = mask.canvas
  const overlay = surface(width, height)
  overlay.ctx.drawImage(mask.canvas, 0, 0)
  overlay.ctx.globalCompositeOperation = layer.colourBlend
  overlay.ctx.fillStyle = layer.colour
  overlay.ctx.fillRect(0, 0, width, height)
  overlay.ctx.globalCompositeOperation = "destination-in"
  overlay.ctx.drawImage(mask.canvas, 0, 0)
  return overlay
}

const ids = new WeakMap()
const overlays = new WeakMap()
const adjustedColours = new Map()
let nextId = 0

export function idOf(value) {
  if (!ids.has(value)) ids.set(value, ++nextId)
  return ids.get(value)
}

function remember(cache, key, make) {
  if (cache.has(key)) return cache.get(key)
  const value = make()
  cache.set(key, value)
  if (cache.size > CACHED_OVERLAYS) cache.delete(cache.keys().next().value)
  return value
}

function overlayLayer(sheet, layer, source, capHeight) {
  if (!overlays.has(sheet)) overlays.set(sheet, { shapes: new Map(), coloured: new Map() })
  const { shapes, coloured } = overlays.get(sheet)
  const shapeKey = JSON.stringify([source.edge ? `edge:${source.edge}` : source.generated ?? idOf(source), capHeight, Object.entries(layer).filter(([name]) => !["file", "blend", "opacity", "colour", "colourBlend"].includes(name))])
  return remember(coloured, JSON.stringify([shapeKey, layer.colour, layer.colourBlend]), () => colourOverlay(remember(shapes, shapeKey, () => drawOverlay(sheet, layer, source, capHeight)), layer))
}

export function paintKey(sheet, assets, look) {
  const placed = assets.overlays.some(overlay => PLACED_KINDS.has(overlay.source.generated))
  const lined = assets.strip?.tiling === "line" || look.source === "tile" && !look.tileablePerCharacter
  const worded = look.wordedFaces || look.source === "gradient" && look.gradientAngle % 180 !== 0
  return JSON.stringify([sheet.width, sheet.height, sheet.tallest, worded ? sheet.wordWidth : null, Object.values(sheet.glyphs).map(entry => [entry.char, entry.x, entry.top, entry.up, entry.upHeight, entry.down, entry.downHeight, entry.width, entry.height, entry.glyph.bottom, entry.glyph.top, entry.glyph.arc, placed ? entry.glyph.placedX : null, lined ? entry.glyph.lineX : null, worded ? entry.glyph.wordX : null])])
}

export function paintBase(sheet, look, assets, capHeight) {
  const entries = Object.values(sheet.glyphs)
  const base = surface(sheet.width * R, sheet.height * R)
  if (look.source === "texture") {
    base.ctx.drawImage(assets.base, 0, 0)
  } else {
    if (look.source === "gradient") paintGradient(base.ctx, entries, look, capHeight, sheet)
    else if (look.source === "strip") paintStrip(base.ctx, entries, assets.strip)
    else paintTiles(base.ctx, entries, look, assets.tile, capHeight)
    if (look.source !== "strip") {
      base.ctx.fillStyle = `rgba(0, 0, 0, ${(100 - look.edgeBrightness) / 100})`
      fillRects(base.ctx, entries.flatMap(strips))
    }
    if (assets.fontOverlay) base.ctx.drawImage(assets.fontOverlay, 0, 0)
    base.ctx.globalCompositeOperation = "destination-in"
    base.ctx.drawImage(assets.shape, 0, 0)
    base.ctx.globalCompositeOperation = "source-over"
  }
  base.ctx.fillStyle = assets.border
  fillRect(base.ctx, [sheet.swatch.x, sheet.swatch.y, 1, 1])
  return base
}

function copyOf(source) {
  const copy = surface(source.width, source.height)
  copy.ctx.drawImage(source, 0, 0)
  return copy
}

function readLater(target) {
  let pixels = null
  return () => pixels ??= target.ctx.getImageData(0, 0, target.canvas.width, target.canvas.height)
}

function adjusted(source, look, options) {
  const out = surface(source.width, source.height, options)
  out.ctx.filter = `hue-rotate(${look.hue}deg) saturate(${look.saturation}%) brightness(${look.brightness}%) contrast(${look.contrast}%)`
  out.ctx.drawImage(source, 0, 0)
  out.ctx.filter = "none"
  out.ctx.globalCompositeOperation = look.blend
  out.ctx.globalAlpha = look.colourOpacity / 100
  out.ctx.fillStyle = look.colour
  out.ctx.fillRect(0, 0, source.width, source.height)
  out.ctx.globalAlpha = 1
  out.ctx.globalCompositeOperation = "destination-in"
  out.ctx.drawImage(source, 0, 0)
  out.ctx.globalCompositeOperation = "source-over"
  return out
}

function overlayLabels(sheet, layers, capHeight, width, height) {
  const { ctx } = surface(width, height, { willReadFrequently: true })
  const image = ctx.createImageData(width, height)
  for (let at = 3; at < image.data.length; at += 4) image.data[at] = 255
  let hard = 0
  let soft = SOFT_LABEL
  for (const { layer, source } of layers) {
    if (!layer.opacity) continue
    const index = PLACED_KINDS.has(source.generated) ? soft++ : hard++
    if (index >= SOFT_LABEL * 1.5 || hard > SOFT_LABEL) continue
    const threshold = WAVE_KINDS.has(source.generated) ? 128 : 1
    const reader = surface(width, height, { willReadFrequently: true })
    reader.ctx.drawImage(overlayLayer(sheet, layer, source, capHeight).canvas, 0, 0)
    const alpha = reader.ctx.getImageData(0, 0, width, height).data
    for (let at = 0; at < alpha.length; at += 4) {
      if (alpha[at + 3] >= threshold) image.data[at + (index >> 3)] |= 1 << (index & 7)
    }
  }
  ctx.putImageData(image, 0, 0)
  return ctx.canvas
}

function borderOf(look, assets) {
  return remember(adjustedColours, JSON.stringify(look.customBorder ? look.borderColour : [assets.border, adjustmentsOf(look)]), () => {
    const pixel = surface(1, 1, { willReadFrequently: true })
    pixel.ctx.fillStyle = look.customBorder ? look.borderColour : assets.border
    pixel.ctx.fillRect(0, 0, 1, 1)
    return (look.customBorder ? pixel : adjusted(pixel.canvas, look, { willReadFrequently: true })).ctx.getImageData(0, 0, 1, 1).data
  })
}

export function paintSheet(sheet, look, assets, capHeight, base = paintBase(sheet, look, assets, capHeight)) {
  const width = sheet.width * R
  const height = sheet.height * R
  const entries = Object.values(sheet.glyphs)
  const swatch = [sheet.swatch.x, sheet.swatch.y, 1, 1]

  const work = adjusted(base.canvas, look)

  if (look.customEdge) {
    work.ctx.globalCompositeOperation = "source-atop"
    const stops = look.edgeFill === "gradient" ? gradientStops(look.edgeStops, look.edgeSmooth) : null
    work.ctx.fillStyle = look.edgeColour
    if (stops) {
      for (const entry of entries) {
        work.ctx.fillStyle = gradientFill(work.ctx, [entry.x - entry.glyph.wordX, 0], [entry.x - entry.glyph.wordX + sheet.wordWidth, 0], stops)
        fillRects(work.ctx, strips(entry))
      }
    } else fillRects(work.ctx, entries.flatMap(strips))
  }
  work.ctx.globalCompositeOperation = "source-over"

  const layered = assets.overlays.length || assets.edgeOverlays.length || look.customBorder
  // layered sheets must be faded in software, and reading this canvas back twice is what makes Chrome do that
  const eager = layered && look.fade
  const faces = eager ? work.ctx.getImageData(0, 0, width, height) : layered ? copyOf(work.canvas) : null

  const overlayLayers = assets.overlays.concat(assets.edgeOverlays.map(({ layer, generated }) => ({ layer, source: { edge: generated } })))
  for (const { layer, source } of overlayLayers) {
    const overlay = overlayLayer(sheet, layer, source, capHeight)
    work.ctx.globalCompositeOperation = layer.blend
    work.ctx.globalAlpha = layer.opacity / 100
    work.ctx.drawImage(overlay.canvas, 0, 0)
    work.ctx.globalAlpha = 1
    work.ctx.globalCompositeOperation = "source-over"
  }

  if (look.customBorder) {
    work.ctx.fillStyle = look.borderColour
    fillRect(work.ctx, swatch)
  }
  const final = eager ? work.ctx.getImageData(0, 0, width, height) : null
  const at = (swatch[1] * R * width + swatch[0] * R) * 4
  const [r, g, b] = final ? final.data.subarray(at, at + 3) : borderOf(look, assets)
  const border = `rgb(${r}, ${g}, ${b})`

  const finalPixels = final ? () => final : readLater(look.fade ? copyOf(work.canvas) : work)
  const facePixels = eager ? () => faces : layered ? readLater(faces) : finalPixels
  let average = null
  const edgeAverage = () => average ??= averageColour(finalPixels(), entries.flatMap(strips))

  if (look.fade) {
    const fade = clamp(look.outerFade / 100, 0, 1)
    work.ctx.globalCompositeOperation = "source-atop"
    const rows = new Map()
    for (const entry of entries) {
      for (const rect of strips(entry)) {
        const [, y, , h] = rect
        const far = y === entry.up ? y : y + h
        const near = y === entry.up ? y + h : y
        const key = `${near},${far}`
        if (!rows.has(key)) rows.set(key, { near, far, rects: [] })
        rows.get(key).rects.push(rect)
      }
    }
    for (const { near, far, rects } of rows.values()) {
      const gradient = work.ctx.createLinearGradient(0, near * R, 0, far * R)
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
      gradient.addColorStop(1 - fade, border)
      gradient.addColorStop(1, border)
      work.ctx.fillStyle = gradient
      fillRects(work.ctx, rects)
    }
    work.ctx.globalCompositeOperation = "source-over"
  }

  const tiles = look.source === "tile" && look.tileableTileEdges ? adjusted(tileBlock(look, assets.tile), look).canvas : null
  const gradient = look.source === "gradient" ? { stops: paintedStops(look), ends: entry => gradientEnds(entry, look, capHeight, sheet) } : null
  return { canvas: work.canvas, facePixels, border, edgeAverage, tiles, tilesAcrossLine: !look.tileablePerCharacter, gradient, fade: look.fade ? clamp(look.outerFade / 100, 0, 1) : null, borderColour: r | g << 8 | b << 16, labels: () => overlayLabels(sheet, overlayLayers, capHeight, width, height) }
}
