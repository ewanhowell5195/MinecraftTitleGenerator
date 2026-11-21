import { shallowReactive } from "vue"
import { fontTextures } from "../texture/assets.js"
import { IMPORTED_TEXTURES } from "../texture/imported.js"
import { pixelsOf } from "../texture/canvas.js"
import { defaultBorder, defaultDepth } from "../settings/defaults.js"
import { fontFolder } from "./catalog.js"
import { kerningPairs } from "./kerning.js"
import { loadImage } from "./font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "../texture/overlays/settings.js"
import { CUSTOM_FONT } from "../settings/settings.js"
import { SILHOUETTE_TEXT } from "../geometry/shapes.js"
import { stripRows } from "./strips.js"
import { pngUrl, serveFile } from "../core/virtualFiles.js"
import { platform } from "../core/platform.js"

const OVERLAY_BASE = "#404040"
export const PREVIEW_DETAIL = 3
const KINDS = [["json", /\.json$/i], ["ascii", /\.png$/i], ["outline", /\.(ttf|otf|woff2?)$/i]]
const built = new Map()
const thumbnails = shallowReactive(new Map())
const drawing = new Map()
const undrawn = new Map()

export function customFontKind(fileName) {
  return KINDS.find(([, pattern]) => pattern.test(fileName))?.[0] ?? null
}

function hash(text) {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return (value >>> 0).toString(36)
}

export function customFontId({ kind, data, google, style, height, mesh, density, strips }) {
  return CUSTOM_FONT + hash(JSON.stringify([kind, data ?? `${google}:${style}`, height].concat(mesh ? ["mesh"] : [], squareSize({ kind, mesh, density }) > 1 ? [squareSize({ kind, mesh, density })] : [], strips?.length ? [strips] : [])))
}

function squareSize({ kind, mesh, density }) {
  return kind === "outline" && !mesh ? density ?? 1 : 1
}

function thumbnailsOf(fontId) {
  if (undrawn.has(fontId)) {
    drawing.set(fontId, undrawn.get(fontId)().then(drawn => {
      thumbnails.set(fontId, drawn)
      return drawn
    }))
    undrawn.delete(fontId)
  }
  return drawing.get(fontId)
}

export function customThumbnail(fontId, name) {
  thumbnailsOf(fontId)
  return thumbnails.get(fontId)?.[name] ?? null
}

export function customThumbnails(fontId) {
  return thumbnailsOf(fontId) ?? Promise.resolve({})
}

export function customFontEntry(source) {
  const id = customFontId(source)
  if (!built.has(id)) built.set(id, build(id, source).catch(err => {
    built.delete(id)
    throw err
  }))
  return built.get(id)
}

async function pixels(url) {
  const image = await loadImage(url)
  return { data: pixelsOf(image), width: image.width, height: image.height }
}

async function editorFont({ kind, data, google, style, height, mesh, density }) {
  if (kind === "json") {
    const { fontFromFiles, parseFontJson } = await import("./editor/import.js")
    const json = parseFontJson(await (await fetch(data)).text())
    if (!json.editor?.texture) throw new Error("this JSON has no font sheet in it. Download the JSON from the font editor")
    return { font: fontFromFiles({ sheet: await pixels(json.editor.texture), json }) }
  }
  if (kind === "silhouette") {
    const [{ fontFromShapes }, { sampleGlyph, silhouetteSample }, { traceSilhouette }] = await Promise.all([import("./editor/import.js"), import("./silhouette.js"), import("./silhouetteTrace.js")])
    const sample = silhouetteSample(await pixels(data))
    const glyph = sampleGlyph(sample)
    const font = fontFromShapes(new Map([[SILHOUETTE_TEXT, glyph]]), { name: "Shape", capHeight: glyph.height, grid: 1, spaceWidth: Math.round(glyph.height / 2), letterCase: "upper" })
    return mesh ? { font, sample, outlines: { [SILHOUETTE_TEXT]: traceSilhouette(sample) }, mesh } : { font, sample }
  }
  if (kind === "ascii") {
    const { fontFromAscii } = await import("./asciiImport.js")
    return { font: fontFromAscii(await pixels(data), { height }) }
  }
  if (kind === "minecraft") {
    const { fontFromMinecraft, minecraftSource } = await import("./minecraftFont.js")
    return { font: fontFromMinecraft(await minecraftSource(await (await fetch(data)).text(), pixels), { height }) }
  }
  const { atVariation, fontFromOutlines, meshOutlines, parseFontFile } = await import("./fontImport.js")
  const { googleFontBytes, styleParts } = await import("./googleFonts.js")
  const parsed = await parseFontFile(google ? await googleFontBytes({ family: google, style }) : await (await fetch(data)).arrayBuffer())
  const source = google && parsed.tables.fvar ? atVariation(parsed, { wght: styleParts(style).weight }) : parsed
  const options = { height, density: squareSize({ kind, mesh, density }) }
  return { font: fontFromOutlines(source, options), outlines: meshOutlines(source, options), mesh }
}

export async function silhouetteMesh(data) {
  const { cubesMatch, silhouetteSample } = await import("./silhouette.js")
  return !cubesMatch(silhouetteSample(await pixels(data)))
}

export async function silhouetteFont(data) {
  return (await editorFont({ kind: "silhouette", data })).font
}

function plainStrip(rows, colour) {
  const canvas = platform.createCanvas()
  canvas.width = 1
  canvas.height = rows
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, 1, rows)
  return canvas
}

async function meshThumbnails(font, mesh, list) {
  const { stripThumbnail, thumbnailScene } = await import("./stripThumbs.js")
  const scene = thumbnailScene(font, mesh)
  if (!scene) return {}
  const rows = stripRows({}, scene.stripRange, scene.depth, scene.capHeight).rows
  const shaded = plainStrip(rows, OVERLAY_BASE)
  const white = plainStrip(rows, "#ffffff")
  const textures = Object.entries(list.textures).filter(([, entry]) => entry.type === "strip").flatMap(([id, entry]) => [[id, entry]].concat(Object.entries(entry.variants ?? {}).map(([name, variant]) => [name, { ...entry, ...variant }])))
  const images = Promise.all(textures.map(([name, entry]) => loadImage(`${entry.folder}/textures/${name}.png`)))
  const jobs = [["preview", {}, white, PREVIEW_DETAIL], ["flat", {}, white]].concat(Object.keys(withGenerated({})).map(name => [name, { overlays: [{ overlay: name, blend: "source-over", opacity: 100 }] }, shaded]), Object.keys(GENERATED_EDGE_OVERLAYS).map(name => [name, {}, shaded]))
  const loaded = await images
  const drawn = {}
  for (const [name, entry, strip, detail] of jobs.concat(textures.map(([name, entry], index) => [name, entry, loaded[index]]))) {
    drawn[name] = stripThumbnail(scene, entry, strip, detail)
    await breather()
  }
  return drawn
}

function breather() {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

async function drawThumbnails(font, folder, entry) {
  const list = await fontTextures(folder, entry.strips)
  if (entry.mesh) return meshThumbnails(font, entry.mesh, list)
  const [{ parsedSheet }, { fontScene, fontThumbnails }] = await Promise.all([import("./editor/sheet.js"), import("./fontThumbnails.js")])
  const { glyphs, list: cells, capHeight, layers } = parsedSheet(font, defaultBorder("top", entry))
  const scene = fontScene(entry, { glyphs, cells, capHeight, layers, kerning: font.kerning, depth: defaultDepth(entry) })
  if (!scene) return {}
  const drawn = await fontThumbnails(entry, scene, list, (kind, id, sheetFolder) => pixels(`${sheetFolder ?? folder}/${kind === "." ? "" : `${kind}/`}${id}.png`))
  return Object.fromEntries(drawn.map(([name, image]) => [name, pngUrl(image)]))
}

async function silhouetteTexture(font, entry, sample) {
  const [{ parsedSheet }, { samplePixels }] = await Promise.all([import("./editor/sheet.js"), import("./silhouette.js")])
  const { list, capHeight } = parsedSheet(font, defaultBorder("top", entry))
  return { ...samplePixels(list, capHeight, defaultDepth(entry), sample), scale: sample.scale }
}

async function build(id, source) {
  const [{ buildSheet }, { exportJson, flatTexture }] = await Promise.all([import("./editor/sheet.js"), import("./editor/export.js")])
  const { font, outlines, mesh, sample } = await editorFont(source)
  const { editor, ...entry } = { ...exportJson(font, ""), id, name: font.name || "Custom font", ...(source.strips?.length && { strips: source.strips }) }
  entry.kerning = kerningPairs(entry.kerning, id)
  if (outlines) entry.outlines = outlines
  if (mesh) {
    const tools = await import("./meshGlyphs.js")
    entry.mesh = { glyphs: tools.glyphMeshes(outlines), tools }
  }
  const folder = fontFolder({ id })
  serveFile(`${folder}/font.png`, pngUrl(buildSheet(font)))
  serveFile(`${folder}/textures/flat.png`, pngUrl(flatTexture(font, mesh ? "all" : outlines ? "strips" : null)))
  const own = sample ? "image" : "flat"
  const painted = sample ? await silhouetteTexture(font, entry, sample) : null
  if (painted) serveFile(`${folder}/textures/image.png`, pngUrl(painted))
  serveFile(`${folder}/textures.json`, painted ? { ...IMPORTED_TEXTURES, primary: own, secondary: own, textures: { image: { border: "#000000", ...(painted.scale > 1 && { density: painted.scale }) }, ...IMPORTED_TEXTURES.textures } } : IMPORTED_TEXTURES)
  undrawn.set(id, () => drawThumbnails(font, folder, entry))
  return entry
}
