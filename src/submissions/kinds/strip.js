import { fetched } from "../../lib/submissions/api.js"
import { stripRange } from "../../lib/texture/assets.js"
import { pixelsOf } from "../../lib/texture/canvas.js"
import { fullName, loadFont, loadFontList, loadImage, stripsOf } from "../../lib/font/font.js"
import { defaultDepth } from "../../lib/settings/defaults.js"
import { stripFolder, stripRows, stripUse } from "../../lib/font/strips.js"
import { textureName } from "../../lib/submissions/kinds/fontAsset.js"
import { stripFonts } from "../../lib/submissions/kinds/published.js"
import { layerDepth, remapScale, remapStrip, setEntry, setName, stripTarget } from "../../lib/submissions/kinds/stripFit.js"
import { pngUrl } from "../../lib/core/virtualFiles.js"
import { fontDefaults } from "./preview.js"

const sets = new Map()

function loadSet(id) {
  if (!sets.has(id)) {
    sets.set(id, fetched(`${stripFolder(id)}/textures.json`, `the ${setName(id)} strip type`).then(response => response.json()).then(list => ({ id, depth: list.depth, baseline: list.baseline ?? list.depth, height: list.height ?? null })).catch(err => {
      sets.delete(id)
      throw err
    }))
  }
  return sets.get(id)
}

function named(fonts, id) {
  const font = fonts.find(entry => entry.id === id)
  return font ? fullName(font, fonts) : id
}

export const previewFonts = stripFonts

async function placedSet(item, font, fonts) {
  const target = stripTarget(item.target)
  if (target.kind === "set") {
    const use = stripsOf(font, fonts).map(stripUse).find(entry => entry.id === target.id)
    return { set: await loadSet(target.id), layer: use?.layer ? use.layer - 1 : null }
  }
  const { depth, baseline, height } = item.details
  if (![depth, baseline, height].every(Number.isInteger) || depth < 1 || height < 1 || baseline < depth) throw new Error("Fill in the new strip type's shape to preview it")
  return { set: { id: "new", depth, baseline, height }, layer: null }
}

function measureOf(loaded, band) {
  return { range: stripRange(loaded, band), capHeight: loaded.capHeight, depth: layerDepth(defaultDepth(loaded), loaded.layers, band, loaded.layerDepth === "independent") }
}

function stackedRemap(pixels, entry, loaded, layer) {
  const measures = loaded.layers.map((_, band) => measureOf(loaded, band))
  const covered = band => layer === null || band === layer
  const scale = Math.max(...measures.filter((_, band) => covered(band)).map(measure => remapScale(pixels, entry, measure)))
  const bands = measures.map((measure, band) => covered(band) ? remapStrip(pixels, entry, measure, scale) : { data: null, height: stripRows({}, measure.range, measure.depth).rows * scale })
  const widths = new Set(bands.filter(band => band.data).map(band => band.width))
  if (widths.size !== 1) throw new Error(`this strip remaps to different widths on each layer of ${loaded.name ?? "this font"}, so it can't be stacked`)
  const [width] = widths
  const line = width * 4
  const data = new Uint8ClampedArray(line * bands.reduce((sum, band) => sum + band.height, 0))
  let at = 0
  for (const band of bands) {
    if (band.data) data.set(band.data, at * line)
    at += band.height
  }
  return { data, width, height: at }
}

async function stripFile(item, file, font, fonts) {
  if (stripTarget(item.target).kind === "font") return { url: file, layer: null, layers: 1 }
  const [{ set, layer }, loaded, image] = await Promise.all([placedSet(item, font, fonts), loadFont(font, fonts), loadImage(file)])
  const pixels = { data: pixelsOf(image), width: image.width, height: image.height }
  const rows = set.baseline + set.depth + set.height
  const entry = { ...setEntry(set, item.details.stretch), ...(item.details.anchor && { anchor: item.details.anchor }), snap: (item.details.snap ?? 1) * rows / image.height }
  if (!(loaded.layers?.length > 1)) return { url: pngUrl(remapStrip(pixels, entry, measureOf(loaded, null))), layer: null, layers: 1 }
  return { url: pngUrl(stackedRemap(pixels, entry, loaded, layer)), layer, layers: loaded.layers.length }
}

export async function stripLine(item, file, text, fontId, fonts) {
  const font = fonts.find(entry => entry.id === fontId)
  if (!font) throw new Error(`there is no font called ${fontId}`)
  const { url, layer, layers } = await stripFile(item, file, font, fonts)
  const custom = { textureSource: "custom", customTexture: url, customTextureMode: "strip", customBorder: true, borderColour: item.details.border ?? "#000000" }
  if (layer === null) return { text, font: font.id, ...custom, ...fontDefaults(font) }
  return { text, font: font.id, ...(layer === 0 && custom), ...fontDefaults(font), separateTexture: true, layerSettings: Array.from({ length: layers - 1 }, (_, index) => index + 1 === layer ? custom : {}) }
}

function targetName(item, fonts) {
  const target = stripTarget(item.target)
  if (target.kind === "font") return named(fonts, target.id)
  if (target.kind === "set") return `the ${setName(target.id)} strip type`
  return `a new ${setName(item.details.set ?? "")} strip type`
}

export const strip = {
  file: "PNG",
  async line(item, file, text) {
    const fonts = await loadFontList()
    const font = previewFonts(item, fonts)[0]
    if (!font) throw new Error("none of the fonts this strip is for are published")
    return stripLine(item, file, text, font.id, fonts)
  },
  summary(item, fonts) {
    return `${item.details.variantOf ? `A variant of the ${textureName(item.details.variantOf)} strip` : "A strip"} for ${targetName(item, fonts)}`
  },
  rows(item, fonts) {
    const target = stripTarget(item.target)
    const { size, border, stretch, snap } = item.details
    const shape = target.kind === "new" ? [
      { label: "Strip type", value: `${setName(item.details.set ?? "")} (new)` },
      { label: "Depth", value: String(item.details.depth) },
      { label: "Baseline", value: String(item.details.baseline) },
      { label: "Height", value: String(item.details.height) },
      { label: "Fonts", value: (item.details.fonts ?? []).map(id => named(fonts, id)).join(", ") }
    ] : [{ label: target.kind === "font" ? "Font" : "Strip type", value: target.kind === "font" ? named(fonts, target.id) : setName(target.id) }]
    return shape.concat(item.details.variantOf ? [{ label: "Variant of", value: textureName(item.details.variantOf) }] : [], size ? [{ label: "Size", value: `${size.width}x${size.height}` }] : [], target.kind === "font" ? [] : [{ label: "Stretches", value: stretch ? "Yes" : "No" }], snap > 1 ? [{ label: "Snap", value: `${snap} pixels` }] : [], [{ label: "Border", value: border, colour: border }])
  }
}
