import { pixelsOf } from "../texture/canvas.js"
import { parsedSheet } from "./editor/sheet.js"
import { rgbOf } from "../core/colour.js"
import { fontScene, layerScene, opaque, render, sceneStrip } from "./fontThumbnails.js"
import { generatedAlpha } from "../texture/overlays/faces.js"
import { thumbnailLayer, toneKinds, withGenerated } from "../texture/overlays/settings.js"
import { clamp } from "../core/maths.js"
import { definitionPalette } from "../texture/overlayColours.js"
import { defaultBorder, defaultDepth } from "../settings/defaults.js"
import { overlayLayer } from "../settings/settings.js"
import { safeRows, stripY } from "./strips.js"
import { MARGIN, drawLayer, over } from "./thumbnails.js"
import { pngUrl } from "../core/virtualFiles.js"
import { platform } from "../core/platform.js"
import { MITER_LIMIT } from "../geometry/clip.js"
import { edgeReach } from "../texture/material.js"

const OVERLAYS = withGenerated({})

export function thumbnailScene(font, mesh = null, text = undefined, layer = null) {
  const { glyphs, list: cells, capHeight, layers } = parsedSheet(font, defaultBorder("top", font))
  const scene = fontScene({ ...font, multicase: font.letterCase === "both" }, { glyphs, cells, capHeight, layers: mesh ? null : layers, kerning: font.kerning, depth: defaultDepth(font) }, text)
  if (!scene) return null
  return { ...(layer === null ? scene : layerScene(scene, layer)), mesh }
}

function coverage(scene, size, items, grow) {
  const canvas = platform.createCanvas()
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.strokeStyle = "#ffffff"
  ctx.beginPath()
  for (const { glyph, x, y } of items) {
    for (const shape of scene.mesh.glyphs[glyph.char]?.shapes ?? []) {
      for (const ring of [shape.outer].concat(shape.holes)) {
        for (const [index, [px, py]] of ring.entries()) {
          const at = [(x + px) * size.scale, (y + glyph.top - py) * size.scale]
          if (index) ctx.lineTo(...at)
          else ctx.moveTo(...at)
        }
        ctx.closePath()
      }
    }
  }
  ctx.fill("nonzero")
  if (grow) {
    ctx.lineJoin = "miter"
    ctx.miterLimit = MITER_LIMIT
    ctx.lineWidth = grow * 2
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, size.width, size.height).data
}

function fineOf(scene, glyph) {
  const mesh = scene.mesh?.glyphs[glyph.char]
  return mesh ? scene.mesh.tools.fineMasks(mesh, glyph, glyph, edgeReach(scene.capHeight)) : null
}

function drawOverlays(target, scene, entry, d) {
  for (const layer of entry.overlays ?? []) {
    const known = OVERLAYS[layer.overlay]
    if (!known?.generated) continue
    const settings = thumbnailLayer({ ...overlayLayer(layer.overlay, known), ...layer, palette: definitionPalette(known) })
    drawLayer(target, scene.placed, d, settings, { tonesOf: ({ glyph, x }) => toneKinds(known.generated).map(tone => generatedAlpha({ ...glyph, placedX: x, fine: fineOf(scene, glyph) }, tone, settings, scene.capHeight, d)) })
  }
}

function meshPixels(scene, entry, image, detail) {
  const { shape, density, top, tiling } = sceneStrip(scene, entry, image)
  const scale = Math.max(1, Math.ceil(density)) * detail
  const size = { width: scene.frame.width * scale, height: scene.frame.height * scale, scale }
  const target = { data: new Uint8ClampedArray(size.width * size.height * 4), width: size.width, height: size.height }
  if (scene.ring) {
    const border = rgbOf(entry.border ?? "#000000")
    const ring = coverage(scene, size, scene.placed, MARGIN * scale)
    for (let i = 3; i < ring.length; i += 4) over(target, (i - 3) / 4 % size.width, Math.floor((i - 3) / 4 / size.width), border.concat(ring[i]))
  }
  for (const item of scene.placed) {
    const { glyph, x, y, lineX } = item
    const origin = tiling === "character" ? 0 : lineX
    const solid = coverage(scene, size, [item], 0)
    for (let at = 3; at < solid.length; at += 4) {
      if (!solid[at]) continue
      const px = (at - 3) / 4 % size.width
      const py = Math.floor((at - 3) / 4 / size.width)
      const across = (px + 0.5) / scale - x
      const down = clamp((py + 0.5) / scale - y, 0, glyph.height - 0.001)
      const glyphRow = glyph.top - 1 - Math.floor(down)
      const row = top - 1 - stripY(shape, glyphRow)
      const sx = ((Math.floor((origin + across) * density) % image.width) + image.width) % image.width
      const sy = clamp(Math.floor((row + down % 1) * density), 0, image.height - 1)
      const k = (sy * image.width + sx) * 4
      over(target, px, py, [image.data[k], image.data[k + 1], image.data[k + 2], Math.round(image.data[k + 3] * solid[at] / 255)])
    }
  }
  drawOverlays(target, scene, entry, scale)
  return target
}

function generatedLayers(entry) {
  return (entry.overlays ?? []).filter(layer => OVERLAYS[layer.overlay]?.generated).map(layer => ({ kind: OVERLAYS[layer.overlay].generated, image: null, layer: thumbnailLayer({ ...overlayLayer(layer.overlay, OVERLAYS[layer.overlay]), ...layer }) }))
}

export function stripPixels(scene, entry, image) {
  const strip = sceneStrip(scene, entry, image)
  return render(scene, null, { density: Math.max(1, Math.ceil(strip.density)), border: opaque(entry.border ?? "#000000"), ring: scene.ring, strip, layers: generatedLayers(entry) })
}

export function stripGuides(scene, entry, image) {
  const { low, high } = safeRows(sceneStrip(scene, entry, image).shape)
  const { glyph, y } = scene.placed[0]
  const baseline = y + glyph.top
  return { top: (baseline - high) / scene.frame.height, bottom: (baseline - low) / scene.frame.height }
}

export function stripThumbnail(scene, entry, image, detail = 1) {
  const strip = { data: pixelsOf(image), width: image.width, height: image.height }
  return pngUrl(scene.mesh ? meshPixels(scene, entry, strip, detail) : stripPixels(scene, entry, strip))
}
