import { pixelsOf } from "../lib/canvas.js"
import { parsedSheet } from "../lib/fontEditor.js"
import { rgbOf } from "../lib/colour.js"
import { fontScene, layerScene, opaque, render, sceneStrip } from "../lib/fontThumbnails.js"
import { generatedAlpha, withGenerated } from "../lib/generated.js"
import { clamp } from "../lib/maths.js"
import { defaultBorder, defaultDepth, overlayLayer } from "../lib/settings.js"
import { stripY } from "../lib/strips.js"
import { MARGIN, drawLayer, over } from "../lib/thumbnails.js"
import { pngUrl } from "../lib/virtualFiles.js"

const TEXT = "abc"
const OVERLAYS = withGenerated({})

export function thumbnailScene(font, mesh = null, text = TEXT, layer = null) {
  const { glyphs, list: cells, capHeight, layers } = parsedSheet(font, defaultBorder("top", font))
  const scene = fontScene({ ...font, multicase: font.letterCase === "both" }, { glyphs, cells, capHeight, layers: mesh ? null : layers, kerning: font.kerning, depth: defaultDepth(font) }, text)
  if (!scene) return null
  return { ...(layer === null ? scene : layerScene(scene, layer)), mesh }
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

function generatedLayers(entry) {
  return (entry.overlays ?? []).filter(layer => OVERLAYS[layer.overlay]?.generated).map(layer => ({ kind: OVERLAYS[layer.overlay].generated, image: null, layer: { ...overlayLayer(layer.overlay, OVERLAYS[layer.overlay]), ...layer } }))
}

export function stripPixels(scene, entry, image) {
  const strip = sceneStrip(scene, entry, image)
  return render(scene, null, { density: Math.max(1, Math.ceil(strip.density)), border: opaque(entry.border ?? "#000000"), ring: scene.ring, strip, layers: generatedLayers(entry) })
}

export function stripThumbnail(scene, entry, image, detail = 1) {
  const strip = { data: pixelsOf(image), width: image.width, height: image.height }
  return pngUrl(scene.mesh ? meshPixels(scene, entry, strip, detail) : stripPixels(scene, entry, strip))
}
