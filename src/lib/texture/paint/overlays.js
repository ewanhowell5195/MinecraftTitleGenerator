import { surface } from "../canvas.js"
import { hexOf } from "../../core/colour.js"
import { PLACED_KINDS, SMOOTH_KINDS, WRAPPED_KINDS, settingsOf, toneKinds } from "../overlays/settings.js"
import { fineShapes, FINE_SHAPED } from "../overlays/fineShapes.js"
import { shineOutlines, waveOutline } from "../overlays/patterns.js"
import { crackList, crackTriangle, crackWrap, wrapTriangles } from "../overlays/cracks.js"
import { edgeAlpha } from "../overlays/edges.js"
import { generatedAlpha } from "../overlays/faces.js"
import { shadowQualityName } from "../overlays/shadows.js"
import { layerGlyph, layerMask } from "../../font/flatSheet.js"
import { joinNeighbours } from "../../geometry/joins.js"
import { clamp, remember } from "../../core/maths.js"
import { WHITE, chosenColours, recolour } from "../overlayColours.js"
import { CACHED_OVERLAYS, R, pageSurface, pixelAt } from "./draw.js"
import { idOf } from "./keys.js"

const SOFT_LABEL = 16

const layeredSheets = new WeakMap()
const overlays = new WeakMap()

function putAlpha(ctx, tones, palette, width, height, [x, y], scale) {
  const image = ctx.createImageData(width * scale, height * scale)
  image.data.fill(255)
  for (const [tone, alpha] of tones.entries()) {
    for (let index = 0; index < alpha.length; index++) {
      if (tone && !alpha[index]) continue
      if (tones.length > 1) image.data.set(palette[tone], index * 4)
      image.data[index * 4 + 3] = Math.round(alpha[index] * 255)
    }
  }
  ctx.putImageData(image, x, y)
}

function generate(ctx, entries, kind, layer, capHeight) {
  for (const entry of entries) {
    const { glyph } = entry
    const scale = entry.regions.front.sx
    if (glyph.width && glyph.height) putAlpha(ctx, toneKinds(kind).map(tone => generatedAlpha(glyph, tone, layer, capHeight, scale, scale > R)), layer.palette ?? [WHITE], glyph.width, glyph.height, pixelAt(entry, "front", entry.x, entry.top), scale)
  }
}

function generateEdges(ctx, entries, kind, layer) {
  for (const entry of entries) {
    if (!entry.glyph.width || !entry.glyph.height) continue
    for (const [side, y, depth] of [["up", entry.up, entry.upHeight], ["down", entry.down, entry.downHeight]]) {
      if (!depth) continue
      const { sx, sy } = entry.regions[side]
      const scale = Math.max(sx, sy)
      const at = pixelAt(entry, side, entry.x, y)
      const tones = [edgeAlpha(entry.glyph, side, kind, layer, depth, scale, scale > R)]
      if (sx === sy) {
        putAlpha(ctx, tones, [WHITE], entry.glyph.width, depth, at, scale)
        continue
      }
      const square = surface(entry.glyph.width * scale, depth * scale)
      putAlpha(square.ctx, tones, [WHITE], entry.glyph.width, depth, [0, 0], scale)
      ctx.drawImage(square.canvas, at[0], at[1], entry.glyph.width * sx, depth * sy)
    }
  }
}

function wrapEdges(overlay, entries, band, independent) {
  const { width, height } = overlay.canvas
  const image = overlay.ctx.getImageData(0, 0, width, height)
  const { data } = image
  for (const entry of entries) {
    const { glyph, x, top, up, upHeight, down, downHeight } = entry
    const mask = band === null || !glyph.depths ? glyph.mask : layerMask(glyph, band, independent)
    const scale = entry.regions.front.sx
    const fine = mask === glyph.mask ? glyph.fine?.(scale) : null
    const rows = glyph.height * scale
    const columns = glyph.width * scale
    const [glyphLeft, glyphTop] = pixelAt(entry, "front", x, top)
    const smoothed = fine && { up: fineEdges(true), down: fineEdges(false) }
    function fineEdges(highest) {
      const picked = new Float32Array(columns * 4)
      const solid = new Uint8Array(columns)
      for (let at = 0; at < columns; at++) {
        for (let step = 0; step < rows; step++) {
          const row = highest ? rows - 1 - step : step
          if (!fine[row * columns + at]) continue
          const source = ((glyphTop + rows - 1 - row) * width + glyphLeft + at) * 4
          const alpha = data[source + 3] / 255
          for (let channel = 0; channel < 3; channel++) picked[at * 4 + channel] = data[source + channel] * alpha
          picked[at * 4 + 3] = alpha
          solid[at] = 1
          break
        }
      }
      const reach = Math.ceil(scale / 2)
      const out = new Uint8ClampedArray(columns * 4)
      for (let at = 0; at < columns; at++) {
        if (!solid[at]) continue
        const sum = [0, 0, 0, 0]
        let count = 0
        for (let near = Math.max(0, at - reach); near <= Math.min(columns - 1, at + reach); near++) {
          if (!solid[near]) continue
          for (let channel = 0; channel < 4; channel++) sum[channel] += picked[near * 4 + channel]
          count++
        }
        const alpha = sum[3] / count
        for (let channel = 0; channel < 3; channel++) out[at * 4 + channel] = alpha ? sum[channel] / count / alpha : 0
        out[at * 4 + 3] = alpha * 255
      }
      return { out, solid }
    }
    for (let column = 0; column < glyph.width; column++) {
      let first = -1
      let last = -1
      for (let row = 0; row < glyph.height; row++) {
        if (!mask[(glyph.height - 1 - row) * glyph.width + column]) continue
        if (first < 0) first = row
        last = row
      }
      if (first < 0) continue
      const [left, high] = pixelAt(entry, "front", x + column, top + first)
      const low = pixelAt(entry, "front", x + column, top + last + 1)[1] - 1
      for (const [from, part, y, depth] of [[high, "up", up, upHeight], [low, "down", down, downHeight]]) {
        const [start, to] = pixelAt(entry, part, x + column, y)
        const { sx, sy } = entry.regions[part]
        for (let step = 0; step < sx; step++) {
          const along = Math.floor(step * scale / sx)
          const at = column * scale + along
          const pixel = smoothed?.[part].solid[at] ? smoothed[part].out.subarray(at * 4, at * 4 + 4) : data.subarray((from * width + left + along) * 4, (from * width + left + along) * 4 + 4)
          for (let row = 0; row < depth * sy; row++) data.set(pixel, ((to + row) * width + start + step) * 4)
        }
      }
    }
  }
  overlay.ctx.putImageData(image, 0, 0)
}

function layeredGlyphs(sheet, band, independent) {
  if (band === null) return null
  if (!layeredSheets.has(sheet)) layeredSheets.set(sheet, new Map())
  const bands = layeredSheets.get(sheet)
  const key = `${band}:${!!independent}`
  if (!bands.has(key)) {
    const copies = new Map()
    function own(glyph) {
      if (!copies.has(glyph)) copies.set(glyph, layerGlyph(glyph, band, independent))
      return copies.get(glyph)
    }
    const entries = Object.values(sheet.glyphs)
    for (const { glyph } of entries) {
      let head = glyph
      while (head.previous) head = head.previous
      if (copies.has(head)) continue
      const chain = []
      for (let item = head; item; item = item.next) chain.push(own(item))
      joinNeighbours(chain)
    }
    bands.set(key, new Map(entries.map(({ glyph }) => [glyph.char, own(glyph)])))
  }
  return bands.get(key)
}

function layeredEntries(sheet, band, independent) {
  const layered = layeredGlyphs(sheet, band, independent)
  return Object.values(sheet.glyphs).map(entry => layered ? { ...entry, glyph: layered.get(entry.glyph.char) } : entry)
}

function drawOverlay(sheet, layer, source, capHeight, band, independent) {
  const overlay = pageSurface(sheet)
  const entries = layeredEntries(sheet, band, independent)
  if (source.edge) generateEdges(overlay.ctx, entries, source.edge, layer)
  else if (source.generated) generate(overlay.ctx, entries, source.generated, layer, capHeight)
  else overlay.ctx.drawImage(source, 0, 0)
  if (WRAPPED_KINDS.has(source.generated)) generateEdges(overlay.ctx, entries, source.generated, layer)
  else if (layer.edgeWrap && !source.edge) wrapEdges(overlay, entries.filter(entry => entry.glyph.width && entry.glyph.height), band, independent)
  return overlay
}

export function labelIndexes(layers) {
  const indexes = new Map()
  let hard = 0
  let soft = SOFT_LABEL
  for (const { layer, source } of layers) {
    if (!layer.opacity) continue
    const index = PLACED_KINDS.has(source.generated) ? soft++ : hard++
    if (index < SOFT_LABEL * 1.5 && hard <= SOFT_LABEL) indexes.set(layer, index)
  }
  return indexes
}

export function wrapsOf(sheet, layers, indexes, band, independent) {
  const layered = layeredGlyphs(sheet, band, independent)
  const own = glyph => layered?.get(glyph.char) ?? glyph
  return layers.filter(({ layer, source }) => WRAPPED_KINDS.has(source.generated) && layer.opacity).map(({ layer }) => ({
    blend: layer.blend,
    opacity: layer.opacity / 100,
    label: indexes.get(layer) ?? null,
    alpha: (glyph, side, line, from, width, depth, scale) => crackWrap(own(glyph), layer, side, line, from, width, depth, scale, scale > R),
    triangles: (glyph, side, line, from, width, depth) => wrapTriangles(own(glyph), layer, side, line, from, width, depth),
    front: glyph => crackList(own(glyph), layer).map(crackTriangle),
    face(glyph, side, line, from, width, depth, scale) {
      const alpha = crackWrap(own(glyph), layer, side, line, from, width, depth, scale, scale > R)
      if (!alpha) return null
      const mask = surface(width * scale, depth * scale)
      const image = mask.ctx.createImageData(width * scale, depth * scale)
      image.data.fill(255)
      for (let index = 0; index < alpha.length; index++) image.data[index * 4 + 3] = alpha[index] * 255
      mask.ctx.putImageData(image, 0, 0)
      return colourOverlay(mask, layer).canvas
    }
  }))
}

function waveShapes(glyph, layer, capHeight) {
  const outline = waveOutline(glyph, { ...settingsOf("wave", layer), capHeight })
  return outline && [outline]
}

const EXACT_SHAPES = {
  ...Object.fromEntries(FINE_SHAPED.map(kind => [kind, (glyph, layer, capHeight) => fineShapes(glyph, kind, layer, capHeight)])),
  wave: waveShapes,
  shine: (glyph, layer, capHeight) => shineOutlines(glyph, "shine", { ...settingsOf("shine", layer), capHeight }),
  shine_random: (glyph, layer, capHeight) => shineOutlines(glyph, "shine_random", { ...settingsOf("shine_random", layer), capHeight })
}

export function exactShapesOf(sheet, layers, indexes, capHeight, band, independent) {
  const layered = layeredGlyphs(sheet, band, independent)
  const own = glyph => layered?.get(glyph.char) ?? glyph
  return layers.filter(({ layer, source }) => EXACT_SHAPES[source.generated] && layer.opacity && indexes.has(layer)).map(({ layer, source }) => {
    const tones = toneKinds(source.generated)
    return {
      label: indexes.get(layer),
      front: glyph => EXACT_SHAPES[source.generated](own(glyph), layer, capHeight),
      tones: tones.length > 1 ? glyph => tones.map(tone => fineShapes(own(glyph), tone, layer, capHeight)) : null
    }
  })
}

export function edgeFacesOf(sheet, layers, band, independent) {
  const layered = layeredGlyphs(sheet, band, independent)
  const own = glyph => layered?.get(glyph.char) ?? glyph
  return layers.filter(({ layer }) => layer.opacity).map(({ layer, generated }) => ({
    blend: layer.blend,
    opacity: layer.opacity / 100,
    face(glyph, side, line, from, width, depth, scale) {
      const alpha = edgeAlpha(own(glyph), side, generated, layer, depth, scale, scale > R, { line, from, width })
      const mask = surface(width * scale, depth * scale)
      const image = mask.ctx.createImageData(width * scale, depth * scale)
      image.data.fill(255)
      for (let index = 0; index < alpha.length; index++) image.data[index * 4 + 3] = alpha[index] * 255
      mask.ctx.putImageData(image, 0, 0)
      return colourOverlay(mask, layer).canvas
    }
  }))
}

export function sideWrapsOf(sheet, layers, capHeight, band, independent) {
  const entries = new Map(Object.values(sheet.glyphs).map(entry => [entry.glyph.char, entry]))
  return layers.filter(({ layer, source }) => layer.sideWrap && layer.opacity && !source.edge && !WRAPPED_KINDS.has(source.generated)).map(({ layer, source }) => {
    let pixels = null
    function read() {
      if (!pixels) {
        const overlay = overlayLayer(sheet, layer, source, capHeight, band, independent)
        pixels = overlay.ctx.getImageData(0, 0, overlay.canvas.width, overlay.canvas.height)
      }
      return pixels
    }
    return {
      blend: layer.blend,
      opacity: layer.opacity / 100,
      face(glyph, side, line, from, width, height, scale) {
        const entry = entries.get(glyph.char)
        if (!entry) return null
        const { data, width: columns } = read()
        const vertical = side === "left" || side === "right"
        const out = surface(width * scale, height * scale)
        const image = out.ctx.createImageData(width * scale, height * scale)
        const across = vertical ? height * scale : width * scale
        const along = vertical ? width * scale : height * scale
        const r = entry.regions.front.sx
        const [left, top] = pixelAt(entry, "front", entry.x, entry.top)
        const [lineX, lineY] = pixelAt(entry, "front", entry.x + line, entry.top + line)
        const low = vertical ? top : left
        const high = vertical ? top + entry.height * r - 1 : left + entry.width * r - 1
        const edge = vertical ? lineX - (side === "right" ? 1 : 0) : lineY - (side === "down" ? 1 : 0)
        let any = false
        for (let i = 0; i < across; i++) {
          const at = clamp((vertical ? top : left) + from * r + Math.floor(i * r / scale), low, high)
          const texel = ((vertical ? at : edge) * columns + (vertical ? edge : at)) * 4
          if (!data[texel + 3]) continue
          any = true
          for (let j = 0; j < along; j++) image.data.set(data.subarray(texel, texel + 4), ((vertical ? i : j) * width * scale + (vertical ? j : i)) * 4)
        }
        if (!any) return null
        out.ctx.putImageData(image, 0, 0)
        return out.canvas
      }
    }
  })
}

export function colourOverlay(mask, layer) {
  const { width, height } = mask.canvas
  const overlay = surface(width, height)
  overlay.ctx.drawImage(mask.canvas, 0, 0)
  const anchors = layer.palette ?? [WHITE]
  const colours = chosenColours(layer, anchors)
  if (!colours && layer.tint) {
    overlay.ctx.globalCompositeOperation = layer.tintBlend
    overlay.ctx.fillStyle = layer.tint
    overlay.ctx.fillRect(0, 0, width, height)
    overlay.ctx.globalCompositeOperation = "destination-in"
    overlay.ctx.drawImage(mask.canvas, 0, 0)
    return overlay
  }
  if (!colours) return overlay
  if (anchors.length === 1) {
    overlay.ctx.globalCompositeOperation = "source-in"
    overlay.ctx.fillStyle = hexOf(colours[0])
    overlay.ctx.fillRect(0, 0, width, height)
    return overlay
  }
  const pixels = overlay.ctx.getImageData(0, 0, width, height)
  recolour(pixels.data, anchors, colours)
  overlay.ctx.putImageData(pixels, 0, 0)
  return overlay
}

export function overlayLayer(sheet, layer, source, capHeight, band = null, independent = false) {
  if (sheet.sharp) return colourOverlay(drawOverlay(sheet, layer, source, capHeight, band, independent), layer)
  if (!overlays.has(sheet)) overlays.set(sheet, { shapes: new Map(), coloured: new Map() })
  const { shapes, coloured } = overlays.get(sheet)
  const shapeKey = JSON.stringify([source.edge ? `edge:${source.edge}` : source.generated ?? idOf(source), capHeight, Object.entries(layer).filter(([name]) => !["file", "blend", "opacity", "colours", "palette", "tint", "tintBlend", "sideWrap"].includes(name)), band, independent, source.generated === "shadow" && shadowQualityName()])
  return remember(coloured, JSON.stringify([shapeKey, layer.colours, layer.palette, layer.tint, layer.tintBlend]), () => colourOverlay(remember(shapes, shapeKey, () => drawOverlay(sheet, layer, source, capHeight, band, independent), CACHED_OVERLAYS), layer), CACHED_OVERLAYS)
}

export function overlayLabels(sheet, layers, capHeight, width, height, band, independent) {
  const { ctx } = surface(width, height, { willReadFrequently: true })
  const image = ctx.createImageData(width, height)
  for (let at = 3; at < image.data.length; at += 4) image.data[at] = 255
  const reader = surface(width, height, { willReadFrequently: true })
  const indexes = labelIndexes(layers)
  for (const { layer, source } of layers) {
    if (!indexes.has(layer)) continue
    const index = indexes.get(layer)
    const threshold = SMOOTH_KINDS.has(source.generated) ? 128 : 1
    reader.ctx.clearRect(0, 0, width, height)
    reader.ctx.drawImage(overlayLayer(sheet, layer, source, capHeight, band, independent).canvas, 0, 0)
    const alpha = reader.ctx.getImageData(0, 0, width, height).data
    for (let at = 0; at < alpha.length; at += 4) {
      if (alpha[at + 3] >= threshold) image.data[at + (index >> 3)] |= 1 << (index & 7)
    }
  }
  ctx.putImageData(image, 0, 0)
  return ctx.canvas
}
