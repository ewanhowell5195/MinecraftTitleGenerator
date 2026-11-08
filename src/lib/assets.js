import { pixelsOf } from "./canvas.js"
import { loadImage, sheetLayout, solidMask } from "./font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "./generated.js"
import { titleCase } from "./names.js"
import { platform } from "./platform.js"
import { defaultDepth } from "./settings.js"
import { mergeStrips, stripFolder, stripUse } from "./strips.js"

const json = new Map()
const images = new Map()
const shapes = new WeakMap()

function fetchJson(url) {
  if (!json.has(url)) {
    json.set(url, platform.fetch(url).then(response => {
      if (!response.ok) throw new Error(`failed to load ${url}`)
      return response.json()
    }))
  }
  return json.get(url)
}

export function preload(folder) {
  textureList(folder).catch(() => {})
  image(`${folder}/textures/flat.png`).catch(() => {})
}

export function image(url) {
  if (!images.has(url)) images.set(url, loadImage(url))
  return images.get(url)
}

export function forgetFolder(folder) {
  for (const cache of [json, images]) {
    for (const url of cache.keys()) if (url.startsWith(`${folder}/`)) cache.delete(url)
  }
}

export function forgetImages(keep) {
  for (const url of images.keys()) {
    if (url.startsWith("data:") && !keep(url)) images.delete(url)
  }
}

function textureList(folder) {
  return fetchJson(`${folder}/textures.json`).then(data => ({ ...data, overlays: withGenerated(data.overlays), edgeOverlays: GENERATED_EDGE_OVERLAYS }))
}

function stripSet(item) {
  const { id, offset } = stripUse(item)
  return fetchJson(`${stripFolder(id)}/textures.json`).then(list => ({ ...list, id, offset }))
}

export async function fontTextures(folder, strips = []) {
  const [own, sets] = await Promise.all([textureList(folder), Promise.all(strips.map(stripSet))])
  return mergeStrips(own, sets)
}

export async function stripTextures(id) {
  return mergeStrips({ textures: {}, overlays: {} }, [await stripSet(id)])
}

export async function loadTileables() {
  const data = structuredClone(await fetchJson("tileables/tileables.json"))
  for (const [id, tileable] of Object.entries(data)) {
    tileable.name ??= titleCase(id)
    tileable.author ??= "Mojang"
    tileable.path ??= "minecraft"
    for (const [variantId, variant] of Object.entries(tileable.variants ?? {})) {
      variant.name ??= titleCase(variantId)
      variant.path ??= tileable.path
    }
  }
  return data
}

export function tileableUrl(tileables, id, variant) {
  const data = variant ? tileables[id].variants[variant] : tileables[id]
  return `tileables/${data.path}/${variant ?? id}.png`
}

export function shapeFont(font, sheet, image) {
  const last = shapes.get(sheet)
  if (last?.font === font && last.image === image) return last.shaped
  const density = image.width / sheet.width
  const data = pixelsOf(image)
  const glyphs = { ...font.glyphs }
  for (const { char, glyph, x, top } of Object.values(sheet.glyphs)) glyphs[char] = { ...glyph, mask: solidMask(data, image.width, density, x, top, glyph.width, glyph.height) }
  const shaped = { ...font, glyphs }
  shapes.set(sheet, { font, image, shaped })
  return shaped
}

export function stripRange(font) {
  const cells = font.cells.filter(glyph => glyph.width)
  return { top: Math.max(font.capHeight, ...cells.map(glyph => glyph.top)), bottom: Math.min(0, ...cells.map(glyph => glyph.bottom)) }
}

export async function sheetFor(font) {
  const [list, flat] = await Promise.all([textureList(font.sheetFolder), image(`${font.sheetFolder}/textures/flat.png`)])
  const depth = defaultDepth(font)
  const glyphs = {}
  for (const [glyph, at] of sheetLayout(font.cells, font.capHeight, depth)) {
    if (font.glyphs[glyph.char] === glyph) glyphs[glyph.char] = { char: glyph.char, glyph, x: at.x, top: at.top, up: at.up, upHeight: depth, down: at.down, downHeight: depth, width: glyph.width, height: glyph.height }
  }
  return { width: flat.width / (list.textures.flat?.density ?? 1), glyphs }
}
