import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { stripRange } from "../src/lib/assets.js"
import { rgbOf } from "../src/lib/colour.js"
import { expandBands, layerMask } from "../src/lib/flatSheet.js"
import { sheetLayout, solidMask, splitCells } from "../src/lib/font.js"
import { GENERATED_EDGE_OVERLAYS, SMOOTH_KINDS, edgeAlpha, generatedAlpha, withGenerated } from "../src/lib/generated.js"
import { layout } from "../src/lib/layout.js"
import { defaultBorder, defaultDepth, overlayLayer } from "../src/lib/settings.js"
import { stackedStrip } from "../src/lib/strips.js"
import { MARGIN, drawLayer, drawRing, drawStrip, over, sceneFrame, stripSource } from "../src/lib/thumbnails.js"
import { cli, inParallel, readPng, rgba, writePng } from "./common.js"
import { ROOT, fontDir, fontTextureList, publicDir, publishedFonts, publishedModels, publishedShapes, readMask } from "./fonts.js"
import { modelThumbnails } from "./submissionKinds/shape.js"

const BACKGROUND_ALPHA = 0.3
const AUTO_BORDER_ALPHA = 77
const SUPERSAMPLE = 4

function opaque(colour) {
  return rgbOf(colour).concat(255)
}

function loadGlyphs(entry, list, root) {
  if (entry.inherits) {
    const parent = loadGlyphs(list.find(item => item.id === entry.variant), list, root)
    return { ...parent, glyphs: { ...parent.glyphs, ...parent.alternates[entry.id] } }
  }
  const { folder, cells, capHeight, layers } = readMask(entry, list, root)
  return { ...splitCells(entry, list, cells), cells, capHeight, folder, depth: defaultDepth(entry), layers, bands: layers?.length ?? 1 }
}

function surface(width, height) {
  const png = new PNG({ width, height })
  png.data.fill(0)
  return png
}

function bandRow(glyph, px, py, d, rows, bands) {
  return (glyph.depths?.[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)] ?? 0) * rows / bands
}

function drawFaces(png, { placed, layouts, bands }, sheet, masks, { density: d, width }) {
  const scale = sheet.width / width
  for (const { glyph, x, y } of placed) {
    const mask = masks.get(glyph)
    const { x: sx, top: sy } = layouts.get(glyph)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        if (!mask[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)]) continue
        const sxp = Math.floor((sx * d + px) * scale / d)
        const syp = Math.floor((sy * d + py) * scale / d + bandRow(glyph, px, py, d, sheet.height, bands))
        over(png, x * d + px, y * d + py, rgba(sheet.data, (syp * sheet.width + sxp) * 4))
      }
    }
  }
}

function drawGenerated(png, { placed, capHeight }, { density: d, generated }) {
  const fine = SMOOTH_KINDS.has(generated) ? SUPERSAMPLE : 1
  for (const { glyph, x, y } of placed) {
    const alpha = generatedAlpha({ ...glyph, placedX: x }, generated, {}, capHeight, d * fine, fine > 1)
    const columns = glyph.width * d * fine
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        let sum = 0
        for (let j = 0; j < fine; j++) {
          for (let i = 0; i < fine; i++) sum += alpha[(py * fine + j) * columns + px * fine + i]
        }
        over(png, x * d + px, y * d + py, [255, 255, 255, Math.round(sum / (fine * fine) * 255)])
      }
    }
  }
}

function layerSource({ layouts, capHeight, bands }, { kind, image, layer }, { density: d, width }) {
  if (!image) return { alphaOf: ({ glyph, x }) => generatedAlpha({ ...glyph, placedX: x }, kind, layer, capHeight, d) }
  const scale = image.width / width
  function at({ glyph }) {
    const { x: sx, top: sy } = layouts.get(glyph)
    return (px, py) => (Math.floor((sy * d + py) * scale / d + bandRow(glyph, px, py, d, image.height, bands)) * image.width + Math.floor((sx * d + px) * scale / d)) * 4
  }
  return { texel: { data: image.data, at } }
}

function render(scene, sheet, options) {
  const png = surface(scene.frame.width * options.density, scene.frame.height * options.density)
  const masks = new Map(scene.placed.map(({ glyph }) => {
    if (!options.ownShape) return [glyph, glyph.mask]
    const { x, top } = scene.layouts.get(glyph)
    const bands = Array.from({ length: scene.bands }, (_, band) => solidMask(sheet.data, sheet.width, sheet.width / options.width, x, top + band * sheet.height / (sheet.width / options.width) / scene.bands, glyph.width, glyph.height))
    if (scene.layer != null) return [glyph, bands[scene.layer]]
    return [glyph, bands[0].map((solid, at) => bands.some(band => band[at]) ? 1 : 0)]
  }))
  if (options.ring) drawRing(png, scene.placed, options.density, options.border, glyph => masks.get(glyph))
  if (options.strip?.layers && scene.layer == null) {
    for (const [layer, strip] of options.strip.layers.entries()) drawStrip(png, exposed(scene.placed, layer), options.density, strip)
  } else if (options.strip) drawStrip(png, scene.placed, options.density, options.strip.layers?.[scene.layer] ?? options.strip)
  else drawFaces(png, scene, sheet, masks, options)
  if (options.fontOverlay) drawFaces(png, scene, options.fontOverlay, masks, options)
  if (options.generated) drawGenerated(png, scene, options)
  for (const layer of options.layers ?? []) drawLayer(png, scene.placed, options.density, layer.layer, layerSource(scene, layer, options))
  return png
}

function exposed(placed, layer) {
  return placed.map(item => ({ ...item, glyph: { ...item.glyph, mask: item.glyph.mask.map((solid, at) => solid && (item.glyph.depths?.[at] ?? 0) === layer ? 1 : 0) } }))
}

function layerScene(scene, layer) {
  const copies = new Map()
  function copy(glyph) {
    if (!copies.has(glyph)) copies.set(glyph, { ...glyph, mask: layerMask(glyph, layer), depths: new Uint8Array(glyph.mask.length).fill(layer) })
    return copies.get(glyph)
  }
  return { ...scene, layer, placed: scene.placed.map(item => ({ ...item, glyph: copy(item.glyph) })), layouts: new Map(Array.from(scene.layouts, ([glyph, at]) => [copy(glyph), at])) }
}

function stripOf(scene, entry, image) {
  const strip = stripSource(entry, image, scene.stripRange, scene.depth, scene.capHeight)
  if (strip.tiling !== "line" && strip.tiling !== "character") throw new Error(`${entry.id ?? "a strip"} has tiling "${strip.tiling}", strips tile by "line" or "character"`)
  if (!scene.layers || entry.stripSet) return strip
  const shapes = scene.layers.map((_, layer) => stackedStrip(strip.shape, scene.layers, layer))
  const density = image.height / shapes[0].total
  return { ...strip, density, layers: shapes.map(({ shape, offset }) => ({ ...strip, shape, density, top: offset + shape.depth + shape.top })) }
}

function compose(base, top) {
  const png = surface(top.width, top.height)
  for (const layer of [base, top]) {
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const sx = Math.floor(x * layer.width / png.width)
        const sy = Math.floor(y * layer.height / png.height)
        const i = (sy * layer.width + sx) * 4
        over(png, x, y, rgba(layer.data, i))
      }
    }
  }
  return png
}

function premultiply(png) {
  const copy = surface(png.width, png.height)
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255
    copy.data[i] = Math.round(png.data[i] * a)
    copy.data[i + 1] = Math.round(png.data[i + 1] * a)
    copy.data[i + 2] = Math.round(png.data[i + 2] * a)
    copy.data[i + 3] = png.data[i + 3]
  }
  return copy
}

function fade(png, amount) {
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = Math.round(png.data[i] * amount)
  return png
}

function expanded({ cells, capHeight, depth, layers }, png) {
  if (!layers || layers.length < 2) return png
  const { data, height } = expandBands(png.data, png.width, cells, capHeight, depth, layers)
  const out = new PNG({ width: png.width, height })
  out.data = Buffer.from(data.buffer)
  return out
}

function frameFill(png, colour) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3]) continue
    png.data.set(colour, i)
  }
}

function sceneFor(entry, list, root) {
  const { glyphs, cells, capHeight, folder, depth, layers, bands } = loadGlyphs(entry, list, root)
  const font = { ...entry, glyphs, kerning: { ...list.find(item => item.id === entry.variant)?.kerning, ...entry.kerning } }
  const placed = layout(font, entry.preview ?? "abc", { spacing: entry.characterSpacing ?? 0 })
  if (!placed.length) throw new Error(`${entry.id}: the preview text has no glyphs in this font`)
  const ring = defaultBorder("top", entry) > 0
  return {
    ...sceneFrame(placed, ring || entry.autoBorder ? MARGIN : 0),
    folder,
    layouts: sheetLayout(cells, capHeight, depth),
    cells,
    layers,
    bands,
    depth,
    capHeight,
    ring,
    stripRange: stripRange({ cells, capHeight })
  }
}

function textureThumbnail({ entry, scene, meta, sheet, width, densityOf }, name, data, variant) {
  const border = opaque(variant.border ?? data.border ?? "#000000")
  const merged = { ...data, ...variant }
  const layers = (merged.overlays ?? []).map(layer => {
    const known = meta.overlays[layer.overlay]
    if (!known) throw new Error(`${name}: default overlay "${layer.overlay}" is not one of this font's overlays`)
    return { kind: known.generated ?? null, image: known.generated ? null : sheet("overlays", layer.overlay), layer: { ...overlayLayer(layer.overlay, known), ...layer } }
  })
  const image = sheet("textures", name, merged.folder, merged.type === "strip")
  let png
  if (merged.type === "strip") {
    const strip = stripOf(scene, { ...merged, id: name }, image)
    png = render(scene, null, { density: Math.max(1, Math.ceil(strip.density)), border, width, ring: scene.ring, strip, layers, fontOverlay: entry.overlay ? sheet(".", "overlay") : null })
  } else {
    png = render(scene, image, { density: densityOf(image), border, width, ring: scene.ring, ownShape: true, layers })
  }
  if (entry.autoBorder) frameFill(png, border)
  return png
}

function overlayThumbnail({ scene, sheet, width, densityOf }, id, data, flat) {
  if (data.generated) return render(scene, surface(flat.width, flat.height), { density: densityOf(flat), border: [0, 0, 0, 0], width, generated: data.generated })
  const image = sheet("overlays", id)
  return render(scene, image, { density: densityOf(image), border: [0, 0, 0, 0], width })
}

function edgeThumbnail(scene, generated, background, d) {
  const png = surface(background.width, background.height)
  const depth = background.height / d
  for (const { glyph, x } of scene.placed) {
    const runs = edgeAlpha(glyph, "down", "edge_front", { thickness: depth }, depth, d)
    const alpha = edgeAlpha(glyph, "down", generated, {}, depth, d)
    for (let py = 0; py < depth * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        const k = py * glyph.width * d + px
        if (!runs[k]) continue
        over(png, x * d + px, py, [64, 64, 64, 255])
        over(png, x * d + px, py, [255, 255, 255, Math.round(alpha[k] * 255)])
      }
    }
  }
  return png
}

export function thumbnailList(root = ROOT) {
  return publishedFonts(root).concat(publishedShapes(root))
}

export function thumbnailEntry(list, id) {
  const found = list.filter(item => item.id === id)
  if (!found.length) throw new Error(`no font or shape with id ${id}`)
  if (found.length > 1) throw new Error(`${found.length} fonts or shapes have the id ${id}, so thumbnails can't tell which one to draw`)
  return found[0]
}

export function drawThumbnails(entry, list, root = ROOT) {
  const loaded = new Map()
  const scene = sceneFor(entry, list, root)
  const load = file => loaded.get(file) ?? loaded.set(file, readPng(file)).get(file)
  const banded = new Map()
  function sheet(kind, id, folder, strip = false) {
    const file = path.join(folder ? path.join(publicDir(root), folder) : scene.folder, kind, `${id}.png`)
    if (strip) return load(file)
    return banded.get(file) ?? banded.set(file, expanded(scene, load(file))).get(file)
  }
  const meta = fontTextureList(entry, list, root)
  const flat = sheet("textures", "flat")
  const width = flat.width / (meta.textures.flat?.density ?? 1)
  const densityOf = image => Math.round(image.width / width)
  meta.overlays = withGenerated(meta.overlays)
  const context = { entry, scene, meta, sheet, width, densityOf }
  const target = path.join(fontDir(entry, root), "thumbnails")
  const kept = new Set()
  let changed = 0

  function write(name, png) {
    const file = path.join(target, `${name}.png`)
    const output = premultiply(png)
    kept.add(file)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file)) {
      const existing = readPng(file)
      if (existing.width === output.width && existing.height === output.height && existing.data.equals(output.data)) return
    }
    writePng(file, output)
    changed++
  }

  const flatBorder = opaque(meta.textures.flat?.border ?? "#000000")

  function writeAll(shown, prefix, layer) {
    const own = { ...context, scene: shown }
    const background = fade(render(shown, flat, { density: densityOf(flat), border: flatBorder, width, ring: shown.ring }), BACKGROUND_ALPHA)
    if (entry.autoBorder) frameFill(background, [flatBorder[0], flatBorder[1], flatBorder[2], AUTO_BORDER_ALPHA])
    for (const [id, data] of Object.entries(meta.textures)) {
      if (data.stripLayer != null && data.stripLayer !== layer) continue
      for (const [name, variant] of [[id, data]].concat(Object.entries(data.variants ?? {}))) write(prefix + name, textureThumbnail(own, name, data, variant))
    }
    for (const [id, data] of Object.entries(meta.overlays)) write(prefix + id, compose(background, overlayThumbnail(own, id, data, flat)))
    for (const [id, data] of Object.entries(GENERATED_EDGE_OVERLAYS)) write(prefix + id, edgeThumbnail(shown, data.generated, background, densityOf(flat)))
  }

  writeAll(scene, "", null)
  for (let layer = 0; layer < (scene.layers?.length ?? 0); layer++) writeAll(layerScene(scene, layer), `layer-${layer + 1}/`, layer)

  for (const file of fs.readdirSync(target, { recursive: true }).map(name => path.join(target, name))) {
    if (fs.statSync(file).isFile() && !kept.has(file)) fs.rmSync(file)
  }
  for (const folder of fs.readdirSync(target).map(name => path.join(target, name))) {
    if (fs.statSync(folder).isDirectory() && !fs.readdirSync(folder).length) fs.rmdirSync(folder)
  }

  return { count: kept.size, changed, frame: scene.frame }
}

function child(id) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [import.meta.filename, id], { maxBuffer: 1 << 24 }, (error, stdout, stderr) => error ? reject(new Error(`${id} failed\n${stderr}`)) : resolve(stdout))
  })
}

async function allFonts(list) {
  const outputs = []
  await inParallel(list, async (entry, index) => outputs[index] = await child(entry.id))
  process.stdout.write(outputs.join(""))
}

if (import.meta.main) {
  const { first: only } = cli("thumbnails.js [font]", { optional: true })
  const list = thumbnailList()
  const models = publishedModels()
  if (only && models.includes(only) && !list.some(item => item.id === only)) {
    modelThumbnails(ROOT, only)
    console.log(`${only.padEnd(30)} model thumbnails drawn`)
  } else if (only) {
    const { count, changed, frame } = drawThumbnails(thumbnailEntry(list, only), list)
    console.log(`${only.padEnd(30)} ${String(count).padStart(3)} thumbnails, ${String(changed).padStart(3)} changed, ${frame.width}x${frame.height} units`)
  } else {
    await allFonts(list)
    for (const id of models) modelThumbnails(ROOT, id)
  }
}
