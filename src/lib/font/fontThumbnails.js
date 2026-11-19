import { rgbOf } from "../core/colour.js"
import { expandBands, independentLayers, layerGlyph, layerLeft } from "./flatSheet.js"
import { sheetLayout } from "./sheet.js"
import { solidMask } from "./sheetParse.js"
import { FADE_KINDS, GENERATED_EDGE_OVERLAYS, SMOOTH_KINDS, thumbnailLayer, toneKinds, withGenerated } from "../texture/overlays/settings.js"
import { edgeAlpha } from "../texture/overlays/edges.js"
import { generatedAlpha } from "../texture/overlays/faces.js"
import { joinNeighbours, keptAt } from "../geometry/joins.js"
import { layout } from "../geometry/layout.js"
import { WHITE, definitionPalette } from "../texture/overlayColours.js"
import { defaultBorder } from "../settings/defaults.js"
import { layerDefault, overlayLayer, perLayerDefault } from "../settings/textureDefaults.js"
import { bandEntry, stripCovers, stripLayout, stripRange } from "./strips.js"
import { MARGIN, drawLayer, drawRing, drawStrip, over, sceneFrame } from "./thumbnails.js"

const BACKGROUND_ALPHA = 0.3
const AUTO_BORDER_ALPHA = 77
const SUPERSAMPLE = 4

export function opaque(colour) {
  return rgbOf(colour).concat(255)
}

function rgba(data, i) {
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

export function blankImage(width, height) {
  return { data: new Uint8ClampedArray(width * height * 4), width, height }
}

function bandRow(glyph, px, py, d, rows, bands) {
  return (glyph.depths?.[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)] ?? 0) * rows / bands
}

function drawFaces(image, { placed, layouts, bands }, sheet, masks, { density: d, width }) {
  const scale = sheet.width / width
  for (const { glyph, x, y } of placed) {
    const mask = masks.get(glyph)
    const { x: sx, top: sy, fill } = layouts.get(glyph)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        const row = glyph.height - 1 - Math.floor(py / d)
        if (!mask[row * glyph.width + Math.floor(px / d)] || !keptAt(glyph, row, (px + 0.5) / d)) continue
        const sxp = Math.floor((sx * d + (fill ? px % d : px)) * scale / d)
        const syp = Math.floor((sy * d + py) * scale / d + bandRow(glyph, px, py, d, sheet.height, bands))
        over(image, x * d + px, y * d + py, rgba(sheet.data, (syp * sheet.width + sxp) * 4))
      }
    }
  }
}

const depthScenes = new WeakMap()

function depthAlpha(scene, index, scale, alphaOf) {
  const { glyph } = scene.placed[index]
  if (!scene.layers || scene.layer != null || !glyph.depths) return alphaOf(glyph)
  if (!depthScenes.has(scene)) depthScenes.set(scene, scene.layers.map((_, layer) => layerScene(scene, layer)))
  const alphas = depthScenes.get(scene).map(shown => alphaOf(shown.placed[index].glyph))
  const columns = glyph.width * scale
  const out = new Float32Array(columns * glyph.height * scale)
  for (let py = 0; py < glyph.height * scale; py++) {
    for (let px = 0; px < columns; px++) {
      const depth = glyph.depths[(glyph.height - 1 - Math.floor(py / scale)) * glyph.width + Math.floor(px / scale)]
      out[py * columns + px] = alphas[depth][py * columns + px]
    }
  }
  return out
}

function drawGenerated(image, scene, { density: d, generated, palette = [WHITE] }) {
  const { placed, capHeight } = scene
  const fine = SMOOTH_KINDS.has(generated) || FADE_KINDS.has(generated) ? SUPERSAMPLE : 1
  for (const [index, { glyph, x, y }] of placed.entries()) {
    const columns = glyph.width * d * fine
    for (const [tone, kind] of toneKinds(generated).entries()) {
      const alpha = depthAlpha(scene, index, d * fine, own => generatedAlpha(own, kind, {}, capHeight, d * fine, fine > 1))
      for (let py = 0; py < glyph.height * d; py++) {
        for (let px = 0; px < glyph.width * d; px++) {
          if (!keptAt(glyph, glyph.height - 1 - Math.floor(py / d), (px + 0.5) / d)) continue
          let sum = 0
          for (let j = 0; j < fine; j++) {
            for (let i = 0; i < fine; i++) sum += alpha[(py * fine + j) * columns + px * fine + i]
          }
          over(image, x * d + px, y * d + py, palette[tone].concat(Math.round(sum / (fine * fine) * 255)))
        }
      }
    }
  }
}

function layerSource(scene, { kind, image, layer }, { density: d, width }) {
  const { layouts, capHeight, bands } = scene
  if (!image) return { tonesOf: item => toneKinds(kind).map(tone => depthAlpha(scene, scene.placed.indexOf(item), d, own => generatedAlpha(own, tone, layer, capHeight, d))) }
  const scale = image.width / width
  function at({ glyph }) {
    const { x: sx, top: sy, fill } = layouts.get(glyph)
    return (px, py) => (Math.floor((sy * d + py) * scale / d + bandRow(glyph, px, py, d, image.height, bands)) * image.width + Math.floor((sx * d + (fill ? px % d : px)) * scale / d)) * 4
  }
  return { texel: { data: image.data, at } }
}

export function render(scene, sheet, options) {
  const image = blankImage(scene.frame.width * options.density, scene.frame.height * options.density)
  const masks = new Map(scene.placed.map(({ glyph }) => {
    const { x, top, fill } = scene.layouts.get(glyph)
    if (!options.ownShape || fill) return [glyph, glyph.mask]
    const bands = Array.from({ length: scene.bands }, (_, band) => solidMask(sheet.data, sheet.width, sheet.width / options.width, x, top + band * sheet.height / (sheet.width / options.width) / scene.bands, glyph.width, glyph.height))
    if (scene.layer != null) return [glyph, bands[scene.layer]]
    return [glyph, bands[0].map((solid, at) => bands.some(band => band[at]) ? 1 : 0)]
  }))
  if (options.ring) drawRing(image, scene.placed, options.density, options.border, glyph => masks.get(glyph))
  if (options.strip && scene.layers && scene.layer == null) {
    for (const layer of scene.layers.keys()) drawStrip(image, exposed(scene.placed, layer, independentLayers(scene)), options.density, options.strip.layers?.[layer] ?? options.strip)
  } else if (options.strip) drawStrip(image, scene.placed.map(item => ({ ...item, trim: layerLeft(item.glyph, scene.layer ?? null, independentLayers(scene)) })), options.density, options.strip.layers?.[scene.layer] ?? options.strip)
  else drawFaces(image, scene, sheet, masks, options)
  if (options.fontOverlay) drawFaces(image, scene, options.fontOverlay, masks, options)
  if (options.generated) drawGenerated(image, scene, options)
  for (const layer of options.layers ?? []) drawLayer(image, scene.placed, options.density, layer.layer, layerSource(scene, layer, options))
  return image
}

function exposed(placed, layer, independent) {
  return placed.map(item => ({ ...item, trim: layerLeft(item.glyph, layer, independent), glyph: { ...item.glyph, mask: item.glyph.mask.map((solid, at) => solid && (item.glyph.depths?.[at] ?? 0) === layer ? 1 : 0) } }))
}

export function layerScene(scene, layer) {
  const copies = new Map()
  function copy(glyph) {
    if (!copies.has(glyph)) copies.set(glyph, { ...layerGlyph(glyph, layer, independentLayers(scene)), depths: new Uint8Array(glyph.mask.length).fill(layer) })
    return copies.get(glyph)
  }
  const placed = scene.placed.map(item => ({ ...item, glyph: copy(item.glyph) }))
  joinNeighbours(placed.map(item => item.glyph))
  return { ...scene, layer, placed, layouts: new Map(Array.from(scene.layouts, ([glyph, at]) => [copy(glyph), at])) }
}

export function sceneStrip(scene, entry, image) {
  const tiling = entry.tiling ?? "line"
  if (tiling !== "line" && tiling !== "character") throw new Error(`${entry.id ?? "a strip"} has tiling "${tiling}", strips tile by "line" or "character"`)
  const first = stripLayout(entry, scene, scene.depth, 0)
  const density = image.height / first.total
  const placed = ({ shape, offset }) => ({ image, shape, density, snap: entry.snap ?? 1 / density, top: offset + shape.depth + shape.top, tiling })
  if (!first.stacked) return placed(first)
  return { ...placed(first), layers: scene.layers.map((_, layer) => placed(stripLayout(entry, scene, scene.depth, layer))) }
}

function compose(base, top) {
  const image = blankImage(top.width, top.height)
  for (const layer of [base, top]) {
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const sx = Math.floor(x * layer.width / image.width)
        const sy = Math.floor(y * layer.height / image.height)
        over(image, x, y, rgba(layer.data, (sy * layer.width + sx) * 4))
      }
    }
  }
  return image
}

function fade(image, amount) {
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = Math.round(image.data[i] * amount)
  return image
}

function expanded({ cells, capHeight, depth, layers, layerDepth }, image) {
  if (!layers || layers.length < 2) return image
  return expandBands(image.data, image.width, cells, capHeight, depth, layers, independentLayers({ layerDepth }))
}

function frameFill(image, colour) {
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3]) continue
    image.data.set(colour, i)
  }
}

function fillerLayout(sheet, cells) {
  const space = cells.find(cell => cell.char === " ")
  const at = sheet.get(space)
  return { ...at, x: at.x + Math.floor(space.width / 2), fill: true }
}

export function fontScene(entry, { glyphs, cells, capHeight, layers, kerning, depth }, text = entry.preview || (entry.multicase ? "ABC" : "abc")) {
  const placed = layout({ ...entry, glyphs, kerning }, text, { spacing: entry.characterSpacing ?? 0 })
  if (!placed.length) return null
  const ring = defaultBorder("top", entry) > 0
  const { frame, placed: framed } = sceneFrame(placed, ring || entry.autoBorder ? MARGIN : 0)
  const sheet = sheetLayout(cells, capHeight, depth)
  const own = framed.map(item => ({ ...item, glyph: { ...item.glyph, placedX: item.x, lift: 0 } }))
  joinNeighbours(own.map(item => item.glyph))
  return {
    frame,
    placed: own,
    layouts: new Map(own.map((item, index) => [item.glyph, framed[index].glyph.fill ? fillerLayout(sheet, cells) : sheet.get(framed[index].glyph)])),
    cells,
    layers,
    bands: layers?.length ?? 1,
    layerDepth: entry.layerDepth,
    depth,
    capHeight,
    ring,
    stripRange: stripRange({ cells, capHeight, layerDepth: entry.layerDepth })
  }
}

export function flatThumbnail(entry, scene, flat) {
  const image = expanded(scene, flat)
  const border = opaque("#000000")
  const png = render(scene, image, { density: 1, border, width: image.width, ring: scene.ring, ownShape: true, layers: [] })
  if (entry.autoBorder) frameFill(png, border)
  return png
}

function bandedStrip(scene, entry, image) {
  if (scene.layer != null) return sceneStrip(scene, bandEntry(entry, scene.layer), image)
  const layers = scene.layers.map((_, band) => sceneStrip(scene, bandEntry(entry, band), image))
  return { ...layers[0], layers }
}

async function textureThumbnail(context, name, data, variant) {
  const { entry, scene, meta, sheet, width, densityOf } = context
  const border = opaque(variant.border ?? data.border ?? "#000000")
  const merged = { ...data, ...variant }
  if (perLayerDefault(merged.overlays, "overlays") && scene.layer == null && scene.layers) {
    const bands = await Promise.all(scene.layers.map((_, band) => textureThumbnail({ ...context, scene: layerScene(scene, band) }, name, data, variant)))
    return bands.reduceRight((behind, front) => compose(behind, front))
  }
  const overlays = await Promise.all((layerDefault(merged.overlays, "overlays", scene.layer ?? 0) ?? []).map(async layer => {
    const known = meta.overlays[layer.overlay]
    if (!known) throw new Error(`${name}: default overlay "${layer.overlay}" is not one of this font's overlays`)
    return { kind: known.generated ?? null, image: known.generated ? null : await sheet("overlays", layer.overlay), layer: thumbnailLayer({ ...overlayLayer(layer.overlay, known), ...layer, palette: definitionPalette(known) }) }
  }))
  const image = await sheet("textures", name, merged.folder, merged.type === "strip")
  let png
  if (merged.type === "strip") {
    const strip = merged.stripBands ? bandedStrip(scene, { ...merged, id: name }, image) : sceneStrip(scene, { ...merged, id: name }, image)
    png = render(scene, null, { density: Math.max(1, Math.ceil(strip.density)), border, width, ring: scene.ring, strip, layers: overlays, fontOverlay: entry.overlay ? await sheet(".", "forced-overlay") : null })
  } else {
    png = render(scene, image, { density: densityOf(image), border, width, ring: scene.ring, ownShape: true, layers: overlays })
  }
  if (entry.autoBorder) frameFill(png, border)
  return png
}

async function overlayThumbnail({ scene, sheet, width, densityOf }, id, data, flat) {
  if (data.generated) return render(scene, blankImage(flat.width, flat.height), { density: densityOf(flat), border: [0, 0, 0, 0], width, generated: data.generated, palette: definitionPalette(data) })
  const image = await sheet("overlays", id)
  return render(scene, image, { density: densityOf(image), border: [0, 0, 0, 0], width })
}

function edgeThumbnail(scene, generated, background, d) {
  const image = blankImage(background.width, background.height)
  const depth = background.height / d
  for (const { glyph, x } of scene.placed) {
    const runs = edgeAlpha(glyph, "down", "edge_front", { thickness: depth }, depth, d)
    const alpha = edgeAlpha(glyph, "down", generated, {}, depth, d)
    for (let py = 0; py < depth * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        const k = py * glyph.width * d + px
        if (!runs[k]) continue
        over(image, x * d + px, py, [64, 64, 64, 255])
        over(image, x * d + px, py, [255, 255, 255, Math.round(alpha[k] * 255)])
      }
    }
  }
  return image
}

export async function fontThumbnails(entry, scene, textures, load) {
  const banded = new Map()
  function sheet(kind, id, folder, strip = false) {
    const key = JSON.stringify([kind, id, folder ?? null])
    if (strip) return load(kind, id, folder)
    if (!banded.has(key)) banded.set(key, Promise.resolve(load(kind, id, folder)).then(image => expanded(scene, image)))
    return banded.get(key)
  }
  const meta = { ...textures, overlays: withGenerated(textures.overlays) }
  const flat = await sheet("textures", "flat")
  const width = flat.width / (meta.textures.flat?.density ?? 1)
  const densityOf = image => Math.round(image.width / width)
  const context = { entry, scene, meta, sheet, width, densityOf }
  const flatBorder = opaque(meta.textures.flat?.border ?? "#000000")
  const drawn = []

  async function drawAll(shown, prefix, layer) {
    const own = { ...context, scene: shown }
    const background = fade(render(shown, flat, { density: densityOf(flat), border: flatBorder, width, ring: shown.ring }), BACKGROUND_ALPHA)
    if (entry.autoBorder) frameFill(background, [flatBorder[0], flatBorder[1], flatBorder[2], AUTO_BORDER_ALPHA])
    for (const [id, data] of Object.entries(meta.textures)) {
      if (!stripCovers(data, layer, scene.layers?.length ?? 1)) continue
      for (const [name, variant] of [[id, data]].concat(Object.entries(data.variants ?? {}))) drawn.push([prefix + name, await textureThumbnail(own, name, data, variant)])
    }
    for (const [id, data] of Object.entries(meta.overlays)) if ((!data.layered || scene.layers && layer !== 0) && (!data.layers || layer === null || data.layers.includes(layer))) drawn.push([prefix + id, compose(background, await overlayThumbnail(own, id, data, flat))])
    for (const [id, data] of Object.entries(GENERATED_EDGE_OVERLAYS)) drawn.push([prefix + id, edgeThumbnail(shown, data.generated, background, densityOf(flat))])
  }

  await drawAll(scene, "", null)
  for (let layer = 0; layer < (scene.layers?.length ?? 0); layer++) await drawAll(layerScene(scene, layer), `layer-${layer}/`, layer)
  return drawn
}
