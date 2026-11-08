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
import { stripRows, stripY } from "../src/lib/strips.js"
import { blend } from "./blend.js"
import { cli, inParallel, readPng, rgb, rgba, writePng } from "./common.js"
import { PUBLIC, fontDir, fontTextureList, publishedFonts, readMask } from "./fonts.js"

const MARGIN = 2
const BACKGROUND_ALPHA = 0.3
const AUTO_BORDER_ALPHA = 77

const { first: only } = cli("thumbnails.js [font]", { optional: true })
const list = publishedFonts()

function opaque(colour) {
  return rgbOf(colour).concat(255)
}

function loadGlyphs(entry) {
  if (entry.inherits) {
    const parent = loadGlyphs(list.find(item => item.id === entry.variant))
    return { ...parent, glyphs: { ...parent.glyphs, ...parent.alternates[entry.id] } }
  }
  const { folder, cells, capHeight } = readMask(entry, list)
  return { ...splitCells(entry, list, cells), cells, capHeight, folder, depth: defaultDepth(entry) }
}

function surface(width, height) {
  const png = new PNG({ width, height })
  png.data.fill(0)
  return png
}

function over(png, x, y, [r, g, b, a]) {
  if (!a || x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const i = (y * png.width + x) * 4
  const da = png.data[i + 3] / 255
  const sa = a / 255
  const oa = sa + da * (1 - sa)
  png.data[i] = Math.round((r * sa + png.data[i] * da * (1 - sa)) / oa)
  png.data[i + 1] = Math.round((g * sa + png.data[i + 1] * da * (1 - sa)) / oa)
  png.data[i + 2] = Math.round((b * sa + png.data[i + 2] * da * (1 - sa)) / oa)
  png.data[i + 3] = Math.round(oa * 255)
}

function drawRing(png, { placed }, masks, { density: d, border }) {
  for (const { glyph, x, y } of placed) {
    const mask = masks.get(glyph)
    for (let r = 0; r < glyph.height; r++) {
      for (let c = 0; c < glyph.width; c++) {
        if (!mask[(glyph.height - 1 - r) * glyph.width + c]) continue
        for (let dy = -MARGIN; dy <= MARGIN; dy++) {
          for (let dx = -MARGIN; dx <= MARGIN; dx++) {
            for (let j = 0; j < d; j++) {
              for (let i = 0; i < d; i++) over(png, (x + c + dx) * d + i, (y + r + dy) * d + j, border)
            }
          }
        }
      }
    }
  }
}

function drawStrip(png, { placed }, { density: d, strip }) {
  const { image, density, top, tiling, shape } = strip
  for (const { glyph, x, y, lineX } of placed) {
    const origin = tiling === "character" ? 0 : lineX
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        if (!glyph.mask[(glyph.height - 1 - Math.floor(py / d)) * glyph.width + Math.floor(px / d)]) continue
        const row = top - 1 - stripY(shape, glyph.top - 1 - Math.floor(py / d))
        const sxp = Math.floor((origin * d + px) * density / d) % image.width
        const syp = Math.floor((row * d + py % d) * density / d)
        over(png, x * d + px, y * d + py, rgba(image.data, (syp * image.width + sxp) * 4))
      }
    }
  }
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

function drawLayer(png, { placed, layouts, capHeight }, { kind, image, layer }, { density: d, width }) {
  const tint = rgbOf(layer.colour)
  const scale = image ? image.width / width : 1
  for (const { glyph, x, y } of placed) {
    const alpha = kind ? generatedAlpha({ ...glyph, placedX: x }, kind, layer, capHeight, d) : null
    const { x: sx, top: sy } = layouts.get(glyph)
    for (let py = 0; py < glyph.height * d; py++) {
      for (let px = 0; px < glyph.width * d; px++) {
        let source = [255, 255, 255]
        let coverage = alpha?.[py * glyph.width * d + px] ?? 0
        if (image) {
          const k = (Math.floor((sy * d + py) * scale / d) * image.width + Math.floor((sx * d + px) * scale / d)) * 4
          source = rgb(image.data, k)
          coverage = image.data[k + 3] / 255
        }
        const strength = coverage * layer.opacity / 100
        const i = ((y * d + py) * png.width + x * d + px) * 4
        if (!strength || !png.data[i + 3]) continue
        const base = rgb(png.data, i)
        const mixed = blend(layer.blend, base, blend(layer.colourBlend, source, tint))
        for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(base[c] + (mixed[c] - base[c]) * strength)
      }
    }
  }
}

function render(scene, sheet, options) {
  const png = surface(scene.frame.width * options.density, scene.frame.height * options.density)
  const masks = new Map(scene.placed.map(({ glyph }) => {
    if (!options.ownShape) return [glyph, glyph.mask]
    const { x, top } = scene.layouts.get(glyph)
    return [glyph, solidMask(sheet.data, sheet.width, sheet.width / options.width, x, top, glyph.width, glyph.height)]
  }))
  if (options.ring) drawRing(png, scene, masks, options)
  if (options.strip) drawStrip(png, scene, options)
  else drawFaces(png, scene, sheet, masks, options)
  if (options.fontOverlay) drawFaces(png, scene, options.fontOverlay, masks, options)
  if (options.generated) drawGenerated(png, scene, options)
  for (const layer of options.layers ?? []) drawLayer(png, scene, layer, options)
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

function sceneFor(entry) {
  const { glyphs, cells, capHeight, folder, depth } = loadGlyphs(entry)
  const font = { ...entry, glyphs, kerning: { ...list.find(item => item.id === entry.variant)?.kerning, ...entry.kerning } }
  const placed = layout(font, entry.preview ?? "abc", { spacing: entry.characterSpacing ?? 0 })
  if (!placed.length) throw new Error(`${entry.id}: the preview text has no glyphs in this font`)
  const minX = Math.min(...placed.map(item => item.x))
  const maxX = Math.max(...placed.map(item => item.x + item.glyph.width))
  const top = Math.max(...placed.map(item => item.glyph.top))
  const bottom = Math.min(...placed.map(item => item.glyph.bottom))
  const ring = defaultBorder("top", entry) > 0
  const margin = ring || entry.autoBorder ? MARGIN : 0
  const frame = { width: maxX - minX + margin * 2, height: top - bottom + margin * 2 }
  return {
    folder,
    layouts: sheetLayout(cells, capHeight, depth),
    depth,
    frame,
    capHeight,
    ring,
    stripRange: stripRange({ cells, capHeight }),
    placed: placed.map(item => ({ glyph: item.glyph, x: item.x - minX + margin, y: top - item.glyph.top + margin, lineX: item.x - placed[0].x }))
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
    const tiling = merged.tiling ?? "line"
    if (tiling !== "line" && tiling !== "character") throw new Error(`${name} has tiling "${tiling}", strips tile by "line" or "character"`)
    const shape = stripRows(merged, scene.stripRange, scene.depth, scene.capHeight)
    const strip = { image, density: image.height / shape.rows, top: shape.depth + shape.top, tiling, shape }
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

function thumbnails(entry) {
  const loaded = new Map()
  const load = file => loaded.get(file) ?? loaded.set(file, readPng(file)).get(file)
  const scene = sceneFor(entry)
  const sheet = (kind, id, folder) => load(path.join(folder ? path.join(PUBLIC, folder) : scene.folder, kind, `${id}.png`))
  const meta = fontTextureList(entry, list)
  const flat = sheet("textures", "flat")
  const width = flat.width / (meta.textures.flat?.density ?? 1)
  const densityOf = image => Math.round(image.width / width)
  meta.overlays = withGenerated(meta.overlays)
  const context = { entry, scene, meta, sheet, width, densityOf }
  const target = path.join(fontDir(entry), "thumbnails")
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

  console.log(`${entry.id.padEnd(30)} ${String(kept.size).padStart(3)} thumbnails, ${String(changed).padStart(3)} changed, ${scene.frame.width}x${scene.frame.height} units`)
}

function child(id) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [import.meta.filename, id], { maxBuffer: 1 << 24 }, (error, stdout, stderr) => error ? reject(new Error(`${id} failed\n${stderr}`)) : resolve(stdout))
  })
}

async function allFonts() {
  const outputs = []
  await inParallel(list, async (entry, index) => outputs[index] = await child(entry.id))
  process.stdout.write(outputs.join(""))
}

if (only) {
  const entry = list.find(font => font.id === only)
  if (!entry) throw new Error(`no font with id ${only}`)
  thumbnails(entry)
} else {
  await allFonts()
}
