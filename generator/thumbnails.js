import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { stripRange } from "../src/lib/assets.js"
import { rgbOf } from "../src/lib/colour.js"
import { sheetLayout, solidMask, splitCells } from "../src/lib/font.js"
import { GENERATED_EDGE_OVERLAYS, edgeAlpha, generatedAlpha, withGenerated } from "../src/lib/generated.js"
import { layout } from "../src/lib/layout.js"
import { defaultBorder, defaultDepth, overlayLayer } from "../src/lib/settings.js"
import { MARGIN, drawLayer, drawRing, drawStrip, over, sceneFrame, stripSource } from "../src/lib/thumbnails.js"
import { cli, inParallel, readPng, rgba, writePng } from "./common.js"
import { ROOT, fontDir, fontTextureList, publicDir, publishedFonts, publishedModels, publishedShapes, readMask } from "./fonts.js"
import { modelThumbnails } from "./submissionKinds/shape.js"

const BACKGROUND_ALPHA = 0.3
const AUTO_BORDER_ALPHA = 77

function opaque(colour) {
  return rgbOf(colour).concat(255)
}

function loadGlyphs(entry, list, root) {
  if (entry.inherits) {
    const parent = loadGlyphs(list.find(item => item.id === entry.variant), list, root)
    return { ...parent, glyphs: { ...parent.glyphs, ...parent.alternates[entry.id] } }
  }
  const { folder, cells, capHeight } = readMask(entry, list, root)
  return { ...splitCells(entry, list, cells), cells, capHeight, folder, depth: defaultDepth(entry) }
}

function surface(width, height) {
  const png = new PNG({ width, height })
  png.data.fill(0)
  return png
}

function drawFaces(png, { placed, layouts }, sheet, masks, { density: d, width }) {
  const scale = sheet.width / width
  for (const { glyph, x, y } of placed) {
    const mask = masks.get(glyph)
    const { x: sx, top: sy } = layouts.get(glyph)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        if (!mask[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)]) continue
        const sxp = Math.floor((sx * d + px) * scale / d)
        const syp = Math.floor((sy * d + py) * scale / d)
        over(png, x * d + px, y * d + py, rgba(sheet.data, (syp * sheet.width + sxp) * 4))
      }
    }
  }
}

function drawGenerated(png, { placed, capHeight }, { density: d, generated }) {
  for (const { glyph, x, y } of placed) {
    const alpha = generatedAlpha({ ...glyph, placedX: x }, generated, {}, capHeight, d)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) over(png, x * d + px, y * d + py, [255, 255, 255, Math.round(alpha[py * glyph.width * d + px] * 255)])
    }
  }
}

function layerSource({ layouts, capHeight }, { kind, image, layer }, { density: d, width }) {
  if (!image) return { alphaOf: ({ glyph, x }) => generatedAlpha({ ...glyph, placedX: x }, kind, layer, capHeight, d) }
  const scale = image.width / width
  function at({ glyph }) {
    const { x: sx, top: sy } = layouts.get(glyph)
    return (px, py) => (Math.floor((sy * d + py) * scale / d) * image.width + Math.floor((sx * d + px) * scale / d)) * 4
  }
  return { texel: { data: image.data, at } }
}

function render(scene, sheet, options) {
  const png = surface(scene.frame.width * options.density, scene.frame.height * options.density)
  const masks = new Map(scene.placed.map(({ glyph }) => {
    if (!options.ownShape) return [glyph, glyph.mask]
    const { x, top } = scene.layouts.get(glyph)
    return [glyph, solidMask(sheet.data, sheet.width, sheet.width / options.width, x, top, glyph.width, glyph.height)]
  }))
  if (options.ring) drawRing(png, scene.placed, options.density, options.border, glyph => masks.get(glyph))
  if (options.strip) drawStrip(png, scene.placed, options.density, options.strip)
  else drawFaces(png, scene, sheet, masks, options)
  if (options.fontOverlay) drawFaces(png, scene, options.fontOverlay, masks, options)
  if (options.generated) drawGenerated(png, scene, options)
  for (const layer of options.layers ?? []) drawLayer(png, scene.placed, options.density, layer.layer, layerSource(scene, layer, options))
  return png
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

function frameFill(png, colour) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3]) continue
    png.data.set(colour, i)
  }
}

function sceneFor(entry, list, root) {
  const { glyphs, cells, capHeight, folder, depth } = loadGlyphs(entry, list, root)
  const font = { ...entry, glyphs, kerning: { ...list.find(item => item.id === entry.variant)?.kerning, ...entry.kerning } }
  const placed = layout(font, entry.preview ?? "abc", { spacing: entry.characterSpacing ?? 0 })
  if (!placed.length) throw new Error(`${entry.id}: the preview text has no glyphs in this font`)
  const ring = defaultBorder("top", entry) > 0
  return {
    ...sceneFrame(placed, ring || entry.autoBorder ? MARGIN : 0),
    folder,
    layouts: sheetLayout(cells, capHeight, depth),
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
  const image = sheet("textures", name, merged.folder)
  let png
  if (merged.type === "strip") {
    const strip = stripSource(merged, image, scene.stripRange, scene.depth, scene.capHeight)
    if (strip.tiling !== "line" && strip.tiling !== "character") throw new Error(`${name} has tiling "${strip.tiling}", strips tile by "line" or "character"`)
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
  const load = file => loaded.get(file) ?? loaded.set(file, readPng(file)).get(file)
  const scene = sceneFor(entry, list, root)
  const sheet = (kind, id, folder) => load(path.join(folder ? path.join(publicDir(root), folder) : scene.folder, kind, `${id}.png`))
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
    if (fs.existsSync(file)) {
      const existing = readPng(file)
      if (existing.width === output.width && existing.height === output.height && existing.data.equals(output.data)) return
    }
    writePng(file, output)
    changed++
  }

  const flatBorder = opaque(meta.textures.flat?.border ?? "#000000")
  const background = fade(render(scene, flat, { density: densityOf(flat), border: flatBorder, width, ring: scene.ring }), BACKGROUND_ALPHA)
  if (entry.autoBorder) frameFill(background, [flatBorder[0], flatBorder[1], flatBorder[2], AUTO_BORDER_ALPHA])

  for (const [id, data] of Object.entries(meta.textures)) {
    for (const [name, variant] of [[id, data]].concat(Object.entries(data.variants ?? {}))) write(name, textureThumbnail(context, name, data, variant))
  }
  for (const [id, data] of Object.entries(meta.overlays)) write(id, compose(background, overlayThumbnail(context, id, data, flat)))
  for (const [id, data] of Object.entries(GENERATED_EDGE_OVERLAYS)) write(id, edgeThumbnail(scene, data.generated, background, densityOf(flat)))

  for (const file of fs.readdirSync(target).map(name => path.join(target, name))) {
    if (!kept.has(file)) fs.rmSync(file)
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
