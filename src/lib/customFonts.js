import { fontTextures } from "./assets.js"
import { pixelsOf } from "./canvas.js"
import { loadImage } from "./font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "./generated.js"
import { CUSTOM_FONT, defaultBorder, defaultDepth } from "./settings.js"
import { stripRows } from "./strips.js"
import { pngUrl, serveFile } from "./virtualFiles.js"

const OVERLAY_BASE = "#404040"
export const PREVIEW_DETAIL = 3
const KINDS = [["json", /\.json$/i], ["ascii", /\.png$/i], ["outline", /\.(ttf|otf|woff2?)$/i]]
const built = new Map()
const thumbnails = new Map()

export function customFontKind(fileName) {
  return KINDS.find(([, pattern]) => pattern.test(fileName))?.[0] ?? null
}

function hash(text) {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return (value >>> 0).toString(36)
}

export function customFontId({ kind, data, height, lowercase, mesh, density, strips }) {
  return CUSTOM_FONT + hash(JSON.stringify([kind, data, height, lowercase].concat(mesh ? ["mesh"] : [], squareSize({ kind, mesh, density }) > 1 ? [squareSize({ kind, mesh, density })] : [], strips?.length ? [strips] : [])))
}

export function squareSize({ kind, mesh, density }) {
  return kind === "outline" && !mesh ? density ?? 1 : 1
}

export function customThumbnail(fontId, name) {
  return thumbnails.get(fontId)?.[name] ?? null
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

async function editorFont({ kind, data, height, lowercase, mesh, density }) {
  if (kind === "json") {
    const { fontFromFiles, parseFontJson } = await import("./fontEditor.js")
    const json = parseFontJson(await (await fetch(data)).text())
    if (!json.editor?.texture) throw new Error("this JSON has no font sheet in it. Download the JSON from the font editor")
    return { font: fontFromFiles({ sheet: await pixels(json.editor.texture), json }) }
  }
  if (kind === "silhouette") {
    const [{ fontFromShapes }, { silhouetteGlyph }] = await Promise.all([import("./fontEditor.js"), import("./submissionKinds/shape.js")])
    const glyph = silhouetteGlyph(await pixels(data))
    return { font: fontFromShapes(new Map([["x", glyph]]), { name: "Shape", capHeight: glyph.height, grid: 1, spaceWidth: Math.round(glyph.height / 2) }) }
  }
  if (kind === "ascii") {
    const { fontFromAscii } = await import("./asciiImport.js")
    return { font: fontFromAscii(await pixels(data), { height, lowercase }) }
  }
  const { fontFromOutlines, meshOutlines, parseFontFile } = await import("./fontImport.js")
  const source = await parseFontFile(await (await fetch(data)).arrayBuffer())
  const options = { height, lowercase, density: squareSize({ kind, mesh, density }) }
  return { font: fontFromOutlines(source, options), outlines: meshOutlines(source, options), mesh }
}

function plainStrip(rows, colour) {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = rows
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, 1, rows)
  return canvas
}

async function drawThumbnails(font, folder, strips, mesh) {
  const { stripThumbnail, thumbnailScene } = await import("../fontEditor/stripThumbs.js")
  const scene = thumbnailScene(font, mesh)
  if (!scene) return {}
  const rows = stripRows({}, { top: scene.stripTop, bottom: scene.stripBottom }, scene.depth, scene.capHeight).rows
  const shaded = plainStrip(rows, OVERLAY_BASE)
  const drawn = { flat: stripThumbnail(scene, {}, plainStrip(rows, "#ffffff")) }
  if (mesh) drawn.preview = stripThumbnail(scene, {}, plainStrip(rows, "#ffffff"), PREVIEW_DETAIL)
  for (const name of Object.keys(withGenerated({}))) drawn[name] = stripThumbnail(scene, { overlays: [{ overlay: name, blend: "source-over", colour: "#ffffff", colourBlend: "multiply", opacity: 100 }] }, shaded)
  for (const name of Object.keys(GENERATED_EDGE_OVERLAYS)) drawn[name] = stripThumbnail(scene, {}, shaded)
  const list = await fontTextures(folder, strips)
  await Promise.all(Object.entries(list.textures).filter(([, entry]) => entry.type === "strip").flatMap(([id, entry]) => [[id, entry]].concat(Object.entries(entry.variants ?? {}).map(([name, variant]) => [name, { ...entry, ...variant }]))).map(async ([name, entry]) => {
    drawn[name] = stripThumbnail(scene, entry, await loadImage(`${entry.folder}/textures/${name}.png`))
  }))
  return drawn
}

async function silhouetteTexture(font, entry, data) {
  const [{ parsedSheet }, { silhouettePixels }] = await Promise.all([import("./fontEditor.js"), import("./submissionKinds/shape.js")])
  const { list, capHeight } = parsedSheet(font, defaultBorder("top", entry))
  const image = await loadImage(data)
  return silhouettePixels(list, capHeight, defaultDepth(entry), { width: image.width, height: image.height, data: pixelsOf(image) })
}

async function build(id, source) {
  const { buildSheet, exportJson, flatTexture } = await import("./fontEditor.js")
  const { font, outlines, mesh } = await editorFont(source)
  const { editor, ...entry } = { ...exportJson(font, ""), id, name: font.name || "Custom font", ...(source.strips?.length && { strips: source.strips }) }
  if (outlines) entry.outlines = outlines
  if (mesh) {
    const tools = await import("./meshGlyphs.js")
    entry.mesh = { glyphs: tools.glyphMeshes(outlines), tools }
  }
  const folder = `font/${id}`
  serveFile(`${folder}/font.png`, pngUrl(buildSheet(font)))
  serveFile(`${folder}/textures/flat.png`, pngUrl(flatTexture(font, mesh ? "all" : outlines ? "strips" : null)))
  const own = source.kind === "silhouette" ? "image" : "flat"
  if (own === "image") serveFile(`${folder}/textures/image.png`, pngUrl(await silhouetteTexture(font, entry, source.data)))
  serveFile(`${folder}/textures.json`, { primary: own, secondary: own, textures: { ...(own === "image" && { image: { border: "#000000" } }), flat: { border: "#000000" } }, overlays: {} })
  thumbnails.set(id, { ...await drawThumbnails(font, folder, entry.strips, entry.mesh), ...(own === "image" && { image: source.data }) })
  return entry
}
