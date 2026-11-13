import { pixelsOf } from "../lib/canvas.js"
import { layerMask } from "../lib/flatSheet.js"
import { parsedSheet } from "../lib/fontEditor.js"
import { rgbOf } from "../lib/colour.js"
import { generatedAlpha, withGenerated } from "../lib/generated.js"
import { layout } from "../lib/layout.js"
import { clamp } from "../lib/maths.js"
import { defaultBorder, defaultDepth, overlayLayer } from "../lib/settings.js"
import { stripY } from "../lib/strips.js"
import { MARGIN, drawLayer, drawRing, drawStrip, over, sceneFrame, stripSource } from "../lib/thumbnails.js"
import { pngUrl } from "../lib/virtualFiles.js"
import { previewFont } from "./textCanvas.js"

const TEXT = "abc"
const OVERLAYS = withGenerated({})

export function thumbnailScene(font, mesh = null, text = TEXT, layer = null) {
  const parsed = previewFont(font)
  const laid = layout(parsed, text, { spacing: font.characterSpacing })
  const placed = layer === null ? laid : laid.map(item => ({ ...item, glyph: { ...item.glyph, mask: layerMask(item.glyph, layer) } }))
  if (!placed.length) return null
  const ring = defaultBorder("top", font) > 0
  const drawn = Object.values(parsed.glyphs).filter(glyph => glyph.width)
  return {
    ...sceneFrame(placed, ring ? MARGIN : 0),
    capHeight: parsed.capHeight,
    depth: defaultDepth(font),
    ring,
    mesh,
    layers: mesh ? null : parsedSheet(font).layers ?? null,
    stripTop: Math.max(parsed.capHeight, ...drawn.map(glyph => glyph.top)),
    stripBottom: Math.min(0, ...drawn.map(glyph => glyph.bottom))
  }
}

function coverage(scene, size, items, grow) {
  const canvas = document.createElement("canvas")
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
    ctx.lineJoin = "round"
    ctx.lineWidth = grow * 2
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, size.width, size.height).data
}

function stripOf(scene, entry, image) {
  return stripSource(entry, image, { top: scene.stripTop, bottom: scene.stripBottom }, scene.depth, scene.capHeight)
}

function fineOf(scene, glyph) {
  const mesh = scene.mesh?.glyphs[glyph.char]
  return mesh ? scene.mesh.tools.fineMasks(mesh, glyph, glyph) : null
}

function drawOverlays(target, scene, entry, d) {
  for (const layer of entry.overlays ?? []) {
    const known = OVERLAYS[layer.overlay]
    if (!known?.generated) continue
    const settings = { ...overlayLayer(layer.overlay, known), ...layer }
    drawLayer(target, scene.placed, d, settings, { alphaOf: ({ glyph, x }) => generatedAlpha({ ...glyph, placedX: x, fine: fineOf(scene, glyph) }, known.generated, settings, scene.capHeight, d) })
  }
}

function meshPixels(scene, entry, image, detail) {
  const { shape, density, top, tiling } = stripOf(scene, entry, image)
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
      const row = top - 1 - stripY(shape, glyph.top - 1 - Math.floor(down))
      const sx = ((Math.floor((origin + across) * density) % image.width) + image.width) % image.width
      const sy = clamp(Math.floor((row + down % 1) * density), 0, image.height - 1)
      const k = (sy * image.width + sx) * 4
      over(target, px, py, [image.data[k], image.data[k + 1], image.data[k + 2], Math.round(image.data[k + 3] * solid[at] / 255)])
    }
  }
  drawOverlays(target, scene, entry, scale)
  return target
}

export function stripPixels(scene, entry, image) {
  const strip = stripOf(scene, entry, image)
  const d = Math.max(1, Math.ceil(strip.density))
  const target = { data: new Uint8ClampedArray(scene.frame.width * d * scene.frame.height * d * 4), width: scene.frame.width * d, height: scene.frame.height * d }
  if (scene.ring) drawRing(target, scene.placed, d, rgbOf(entry.border ?? "#000000").concat(255))
  drawStrip(target, scene.placed, d, strip)
  drawOverlays(target, scene, entry, d)
  return target
}

export function stripThumbnail(scene, entry, image, detail = 1) {
  const strip = { data: pixelsOf(image), width: image.width, height: image.height }
  return pngUrl(scene.mesh ? meshPixels(scene, entry, strip, detail) : stripPixels(scene, entry, strip))
}
