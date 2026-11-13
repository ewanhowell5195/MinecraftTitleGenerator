import { pixelsOf, surface } from "./canvas.js"
import { expandBands } from "./flatSheet.js"
import { loadImage, sheetLayout, solidMask } from "./font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "./generated.js"
import { titleCase } from "./names.js"
import { platform } from "./platform.js"
import { defaultDepth } from "./settings.js"
import { mergeStrips, stripFolder, stripUse } from "./strips.js"

const json = new Map()
const images = new Map()
const shapes = new WeakMap()

function remembered(cache, url, load) {
  if (!cache.has(url)) {
    const loading = load()
    loading.catch(() => cache.delete(url))
    cache.set(url, loading)
  }
  return cache.get(url)
}

function fetchJson(url) {
  return remembered(json, url, async () => {
    const response = await platform.fetch(url)
    if (!response.ok) throw new Error(`failed to load ${url}`)
    return response.json()
  })
}

export function preload(folder) {
  textureList(folder).catch(() => {})
  image(`${folder}/textures/flat.png`).catch(() => {})
}

export function image(url) {
  return remembered(images, url, () => loadImage(url))
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
  const { id, offset, layer } = stripUse(item)
  return fetchJson(`${stripFolder(id)}/textures.json`).then(list => ({ ...list, id, offset, layer }))
}

export async function fontTextures(folder, strips = []) {
  const [own, sets] = await Promise.all([textureList(folder), Promise.all(strips.map(stripSet))])
  return mergeStrips(own, sets)
}

export async function modelTextures(folder) {
  const data = await fetchJson(`${folder}/textures.json`)
  return { ...data, overlays: data.overlays ?? {}, edgeOverlays: {} }
}

export function modelOf(folder) {
  return fetchJson(`${folder}/model.json`)
}

export async function stripTextures(id) {
  return mergeStrips({ textures: {}, overlays: {} }, [await stripSet(id)])
}

export async function loadTileables() {
  const data = structuredClone(await fetchJson("tileables/tileables.json"))
  for (const [id, tileable] of Object.entries(data)) {
    tileable.name ??= titleCase(id)
    tileable.authors ??= ["Mojang"]
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

const bands = new WeakMap()

export function bandOf(source, band, font) {
  const count = font.layers?.length ?? 1
  if (count < 2) return source
  if (!bands.has(source)) {
    const expanded = expandBands(pixelsOf(source), source.width, font.cells, font.capHeight, defaultDepth(font), font.layers)
    const height = expanded.height / count
    const size = source.width * height * 4
    bands.set(source, Array.from({ length: count }, (_, index) => {
      const { canvas, ctx } = surface(source.width, height)
      const pixels = ctx.createImageData(source.width, height)
      pixels.data.set(expanded.data.subarray(index * size, (index + 1) * size))
      ctx.putImageData(pixels, 0, 0)
      return canvas
    }))
  }
  return bands.get(source)[band]
}

const stripBands = new WeakMap()

export function stripBand(source, top, height) {
  if (!stripBands.has(source)) stripBands.set(source, new Map())
  const cropped = stripBands.get(source)
  if (!cropped.has(top)) {
    if (!Number.isInteger(top) || !Number.isInteger(height) || top + height > source.height) throw new Error(`a strip ${source.height}px tall has no layer band at ${top}px that is ${height}px tall`)
    const { canvas, ctx } = surface(source.width, height)
    ctx.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height)
    cropped.set(top, canvas)
  }
  return cropped.get(top)
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
