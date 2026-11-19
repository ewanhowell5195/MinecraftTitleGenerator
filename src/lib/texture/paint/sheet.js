import { fadeStops, linearGradient, surface } from "../canvas.js"
import { hexOf, packed } from "../../core/colour.js"
import { gradientStops } from "../colourStops.js"
import { clamp } from "../../core/maths.js"
import { R, fillRect, gradientFill, into, pageSurface, pixelAt, plain, stripParts } from "./draw.js"
import { adjusted, borderOf, paintedStops } from "./adjust.js"
import { gradientEnds, paintGradient } from "./gradient.js"
import { adjustedTiles, paintTiles } from "./tiles.js"
import { paintStrip } from "./strip.js"
import { paintCover } from "./cover.js"
import { paintBakedCover, paintBakedRuns } from "./coverBake.js"
import { edgeFacesOf, labelIndexes, overlayLabels, overlayLayer, sideWrapsOf, wrapsOf } from "./overlays.js"
import { lookKey } from "./keys.js"

const preparedSheets = new WeakMap()

function stripPixels(entry) {
  return stripParts(entry).map(([part, [x, y, w, h]]) => {
    const [px, py] = pixelAt(entry, part, x, y)
    const { sx, sy } = entry.regions[part]
    return [px, py, w * sx, h * sy]
  })
}

function fillStrips(ctx, entries) {
  for (const entry of entries) {
    for (const [part, rect] of stripParts(entry)) {
      into(ctx, entry, part)
      fillRect(ctx, rect)
    }
  }
  plain(ctx)
}

function averageColour(image, rects) {
  const sum = [0, 0, 0]
  let count = 0
  for (const [x, y, w, h] of rects) {
    for (let row = y; row < y + h; row++) {
      for (let column = x; column < x + w; column++) {
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

function fillSwatch(ctx, sheet, colour) {
  ctx.fillStyle = colour
  ctx.fillRect(sheet.swatch.x, sheet.swatch.y, sheet.swatch.scale, sheet.swatch.scale)
}

export function paintBase(sheet, look, assets, capHeight) {
  const entries = Object.values(sheet.glyphs)
  const base = pageSurface(sheet)
  if (look.source === "texture") {
    base.ctx.drawImage(assets.base, 0, 0)
  } else {
    if (look.source === "gradient") paintGradient(base.ctx, entries, look, capHeight, sheet)
    else if (look.source === "cover" && assets.coverBase) paintBakedCover(base.ctx, assets.coverBase)
    else if (look.source === "cover") paintCover(base.ctx, entries, look, assets.cover, capHeight, sheet)
    else if (look.source === "strip") paintStrip(base.ctx, entries, assets.strip)
    else paintTiles(base.ctx, entries, look, assets.tile, capHeight)
    if (look.source !== "strip") {
      base.ctx.fillStyle = `rgba(0, 0, 0, ${(100 - look.edgeBrightness) / 100})`
      fillStrips(base.ctx, entries)
    }
    if (assets.fontOverlay) base.ctx.drawImage(assets.fontOverlay, 0, 0)
    base.ctx.globalCompositeOperation = "destination-in"
    base.ctx.drawImage(assets.shape, 0, 0)
    base.ctx.globalCompositeOperation = "source-over"
    if (look.source === "cover" && assets.coverBase) paintBakedRuns(base.ctx, sheet, assets.coverBase, look.edgeBrightness)
  }
  fillSwatch(base.ctx, sheet, assets.border)
  return base
}

function copyOf(source, options) {
  const copy = surface(source.width, source.height, options)
  copy.ctx.drawImage(source, 0, 0)
  return copy
}

function readLater(target) {
  let pixels = null
  return () => pixels ??= target.ctx.getImageData(0, 0, target.canvas.width, target.canvas.height)
}

function preparedSheet(sheet, look, base, reads) {
  const key = lookKey([look.hue, look.saturation, look.brightness, look.contrast, look.blend, look.colourOpacity, look.colour, look.customEdge, look.edgeFill, look.edgeColour, look.edgeStops, look.edgeSmooth, !!reads])
  if (!preparedSheets.has(base.canvas)) preparedSheets.set(base.canvas, new Map())
  const known = preparedSheets.get(base.canvas)
  if (known.has(key)) return known.get(key)
  const entries = Object.values(sheet.glyphs)
  const work = adjusted(base.canvas, look, reads)
  if (look.customEdge) {
    work.ctx.globalCompositeOperation = "source-atop"
    const stops = look.edgeFill === "gradient" ? gradientStops(look.edgeStops, look.edgeSmooth) : null
    work.ctx.fillStyle = look.edgeColour
    if (stops) {
      for (const entry of entries) {
        for (const [part, rect] of stripParts(entry)) {
          into(work.ctx, entry, part)
          work.ctx.fillStyle = gradientFill(work.ctx, [entry.x - entry.glyph.wordX, 0], [entry.x - entry.glyph.wordX + sheet.wordWidth, 0], stops)
          fillRect(work.ctx, rect)
        }
      }
      plain(work.ctx)
    } else fillStrips(work.ctx, entries)
  }
  work.ctx.globalCompositeOperation = "source-over"
  known.clear()
  known.set(key, { canvas: work.canvas, read: readLater(work) })
  return known.get(key)
}

export function paintSheet(sheet, look, assets, capHeight, base) {
  const { width, height } = sheet
  const entries = Object.values(sheet.glyphs)
  const band = assets.band ?? null
  const independent = !!assets.independent

  const layered = assets.overlays.length || assets.edgeOverlays.length || look.customBorder
  const reads = layered ? { willReadFrequently: true } : undefined
  const ready = preparedSheet(sheet, look, base, reads)
  const work = copyOf(ready.canvas, reads)

  // layered sheets must be faded in software, and reading this canvas back twice is what makes Chrome do that
  const eager = layered && look.fade
  const faces = eager ? ready.read() : null

  const overlayLayers = assets.overlays.concat(assets.edgeOverlays.map(({ layer, generated }) => ({ layer, source: { edge: generated } })))
  function shadedEdges(overlay) {
    const copy = copyOf(overlay.canvas)
    copy.ctx.globalCompositeOperation = "source-atop"
    copy.ctx.fillStyle = `rgba(0, 0, 0, ${(100 - look.edgeBrightness) / 100})`
    fillStrips(copy.ctx, entries)
    return copy
  }

  const extraFaces = assets.edgeOverlays.length && sheet.runs && Array.from(sheet.runs.keys()).some(run => run.region === "edge")
  const unedged = extraFaces ? copyOf(work.canvas) : null
  for (const { layer, source } of overlayLayers) {
    const own = overlayLayer(sheet, layer, source, capHeight, band, independent)
    const overlay = layer.edgeWrap && !source.edge && !look.customEdge && look.edgeBrightness < 100 && ["source-over", "lighter"].includes(layer.blend) ? shadedEdges(own) : own
    for (const target of source.edge || !unedged ? [work] : [work, unedged]) {
      target.ctx.globalCompositeOperation = layer.blend
      target.ctx.globalAlpha = layer.opacity / 100
      target.ctx.drawImage(overlay.canvas, 0, 0)
      target.ctx.globalAlpha = 1
      target.ctx.globalCompositeOperation = "source-over"
    }
  }
  const stripSource = unedged?.canvas ?? null

  if (look.customBorder) fillSwatch(work.ctx, sheet, look.borderColour)
  const final = eager ? work.ctx.getImageData(0, 0, width, height) : null
  const at = (sheet.swatch.y * width + sheet.swatch.x) * 4
  const rgb = final ? final.data.subarray(at, at + 3) : borderOf(look, assets)
  const [r, g, b] = rgb
  const border = `rgb(${r}, ${g}, ${b})`

  const finalPixels = final ? () => final : layered ? readLater(look.fade ? copyOf(work.canvas) : work) : ready.read
  const facePixels = eager ? () => faces : layered ? ready.read : finalPixels
  let average = null
  const edgeAverage = () => average ??= averageColour(finalPixels(), entries.flatMap(stripPixels))

  const fade = look.fade ? clamp(look.outerFade / 100, 0, 1) : null
  if (look.fade) {
    work.ctx.globalCompositeOperation = "source-atop"
    const stops = fadeStops(border, `rgba(${r}, ${g}, ${b}, 0)`, fade)
    for (const entry of entries) {
      for (const [part, rect] of stripParts(entry)) {
        const [, y, , h] = rect
        const far = part === "up" ? y : y + h
        const near = part === "up" ? y + h : y
        into(work.ctx, entry, part)
        work.ctx.fillStyle = linearGradient(work.ctx, 0, near * R, 0, far * R, stops)
        fillRect(work.ctx, rect)
      }
    }
    plain(work.ctx)
    work.ctx.globalCompositeOperation = "source-over"
  }

  const tiles = look.source === "tile" && look.tileableTileEdges ? adjustedTiles(look, assets.tile) : null
  const gradient = look.source === "gradient" ? { stops: paintedStops(look), ends: entry => gradientEnds(entry, look, capHeight, sheet) } : null
  return { canvas: work.canvas, coverRuns: assets.coverBase ? ready.canvas : null, facePixels, border, edgeAverage, tiles, tilesAcrossLine: !look.tileablePerCharacter, gradient, fade, borderColour: packed(rgb, 0), labels: () => overlayLabels(sheet, overlayLayers, capHeight, width, height, band, independent), wraps: wrapsOf(sheet, assets.overlays, labelIndexes(overlayLayers), band, independent), sideWraps: sideWrapsOf(sheet, assets.overlays, capHeight, band, independent), stripSource, edgeFaces: stripSource ? edgeFacesOf(sheet, assets.edgeOverlays, band, independent) : [], tileScale: R }
}
