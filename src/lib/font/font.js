import { pixelsOf } from "../texture/canvas.js"
import { defaultBorder } from "../settings/defaults.js"
import { titleCase } from "../core/names.js"
import { platform } from "../core/platform.js"
import { parseMask } from "./sheetParse.js"
import { FONTS_FOLDER, flattenFonts, fontFolder, fullOrder, orderOf, splitCells } from "./catalog.js"

export function loadImage(src) {
  return platform.loadImage(src)
}

const META = ["authors", "description", "multicase", "strips", "height", "depth", "border", "characterSpacing", "spaceWidth", "terminatorSpace", "terminatorSpaceWidth", "forcedTerminators", "autoBorder", "flat", "overlay", "allFaces", "layerDepth", "mesh", "outlines"]

export async function loadFontList() {
  const response = await platform.fetch(`${FONTS_FOLDER}/fonts.json`)
  if (!response.ok) throw new Error(`failed to load ${FONTS_FOLDER}/fonts.json`)
  return flattenFonts(await response.json()).map(data => ({ ...data, name: data.name ?? titleCase(data.id) }))
}

function meta(data) {
  return Object.fromEntries(META.filter(key => data[key] !== undefined).map(key => [key, data[key]]))
}

const loaded = new Map()

export function forgetFont(id) {
  loaded.delete(id)
}

export function loadFont(data, list) {
  if (!loaded.has(data.id)) {
    loaded.set(data.id, readFont(data, list).catch(err => {
      loaded.delete(data.id)
      throw err
    }))
  }
  return loaded.get(data.id)
}

async function readFont(data, list) {
  if (data.inherits) {
    const parent = list.find(entry => entry.id === data.variant)
    if (!parent) throw new Error(`${data.id} inherits from ${data.variant}, which is not in the font list`)
    const inherited = await loadFont(parent, list)
    return {
      ...inherited,
      ...meta(data),
      id: data.id,
      name: data.name,
      variant: data.variant,
      folder: fontFolder(data),
      kerning: { ...inherited.kerning, ...data.kerning },
      glyphs: { ...inherited.glyphs, ...inherited.alternates[data.id] }
    }
  }
  const folder = fontFolder(data)
  const image = await loadImage(`${folder}/font.png`)
  const pixels = pixelsOf(image)
  const { list: cells, capHeight, layers } = parseMask(pixels, image.width, image.height, fullOrder(data, list), defaultBorder("top", data))
  const { glyphs, alternates } = splitCells(data, list, cells)
  return {
    layers,
    height: capHeight + defaultBorder("top", data) * 2,
    ...meta(data),
    id: data.id,
    name: data.name,
    variant: data.variant,
    folder,
    sheetFolder: folder,
    order: orderOf(data),
    kerning: data.kerning ?? {},
    capHeight,
    glyphs,
    alternates,
    cells
  }
}
