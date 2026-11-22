import { pixelsOf } from "./canvas.js"
import { loadImage } from "../font/font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "./overlays/settings.js"
import { paletteOf } from "./overlayColours.js"
import { decodePng } from "../submissions/kinds/png.js"
import { titleCase } from "../core/names.js"
import { platform } from "../core/platform.js"
import { mergeStrips, stripFolder, stripUse, withDefaultStrips } from "../font/strips.js"
import { IMPORTED_TEXTURES } from "./imported.js"

const json = new Map()
const images = new Map()
const palettes = new Map()

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
  for (const cache of [images, palettes]) {
    for (const url of cache.keys()) if (url.startsWith("data:") && !keep(url)) cache.delete(url)
  }
}

export function filePalette(url) {
  return remembered(palettes, url, async () => {
    const bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), char => char.charCodeAt(0))
    try {
      return paletteOf(decodePng(bytes, Infinity).data)
    } catch {
      return paletteOf(pixelsOf(await image(url)))
    }
  })
}

function withOverlays(data) {
  return { ...data, overlays: withGenerated(data.overlays), edgeOverlays: GENERATED_EDGE_OVERLAYS }
}

export function textureList(folder) {
  return fetchJson(`${folder}/textures.json`).then(withOverlays)
}

function stripSet(item) {
  const { id, offset, layer, skip } = stripUse(item)
  return fetchJson(`${stripFolder(id)}/textures.json`).then(list => ({ ...list, id, offset, layer, skip }))
}

export async function importedTextures(strips = []) {
  return mergeStrips(withOverlays(IMPORTED_TEXTURES), await Promise.all(withDefaultStrips(strips).map(stripSet)))
}

export async function fontTextures(folder, strips = []) {
  const [own, sets] = await Promise.all([textureList(folder), Promise.all(withDefaultStrips(strips).map(stripSet))])
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
