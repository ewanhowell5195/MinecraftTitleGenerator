import { bandOf, filePalette, image, stripBand, stripLayout, tileableUrl } from "../lib/texture/assets.js"
import { definitionPalette } from "../lib/texture/overlayColours.js"
import { bandEntry, layerSlice } from "../lib/font/strips.js"
import { independentLayers } from "../lib/font/flatSheet.js"
import { blockTextureImage } from "../lib/minecraft/minecraft.js"
import { defaultDepth } from "../lib/settings/defaults.js"
import { textureEntry } from "../lib/settings/settings.js"

export async function loadAssets({ font, list, sheet, tileables }, value, band, target) {
  function sheetImage(path) {
    return image(`${font.sheetFolder}/${path}`)
  }

  const assets = { shape: sheetImage("textures/flat.png"), border: list.textures.flat?.border ?? "#000000", densities: [], band: font.layers ? band : null, independent: independentLayers(font) }
  if (value.source === "gradient") assets.densities.push(1)
  if (value.source === "texture" && target.textureSource === "custom") {
    assets.base = target.customTexture ? image(target.customTexture) : sheetImage("textures/flat.png")
  } else if (value.source === "texture") {
    const premade = textureEntry(list, target)
    const id = premade ? target.textureVariant ?? target.texture : "flat"
    assets.base = sheetImage(`textures/${id}.png`)
    if (premade?.border) assets.border = premade.border
    assets.densities.push((premade || list.textures.flat)?.density ?? 1)
  }
  if (value.source === "strip") {
    const custom = target.textureSource === "custom"
    const entry = custom ? {} : bandEntry(textureEntry(list, target), band)
    const id = custom ? "custom" : target.textureVariant ?? target.texture
    const loaded = await image(custom ? target.customTexture : `${entry.folder ?? font.sheetFolder}/textures/${id}.png`)
    const layers = font.layers
    const layout = stripLayout(entry, font, defaultDepth(font), band)
    const { depth, top, bottom, rows, scale } = layout.shape
    const density = loaded.height / layout.total
    const strip = layout.stacked ? stripBand(loaded, layout.offset * density, rows * density) : loaded
    const tiling = entry.tiling ?? "line"
    if (tiling !== "line" && tiling !== "character") throw new Error(`${id} has tiling "${tiling}", strips tile by "line" or "character"`)
    const slice = layers && (layout.stacked || entry.stripLayer != null) ? layerSlice(layers, band, independentLayers(font)) : null
    assets.strip = { image: strip, density, snap: entry.snap ?? 1 / density, top, bottom, depth, tiling, scale, slice, band: assets.band, independent: assets.independent }
    if (entry.border) assets.border = entry.border
    assets.densities.push(Math.max(1, density))
  }
  if (value.source === "cover") {
    assets.cover = image(target.customTexture)
    assets.densities.push(1)
  }
  if (value.source === "tile") {
    assets.tile = target.textureSource === "custom" ? image(target.customTexture) : target.tileableSource === "minecraft" ? blockTextureImage(target.minecraftVersion, target.minecraftTexture) : image(tileableUrl(tileables, target.tileable, target.tileableVariant))
    assets.densities.push(1 / target.tileableScale)
  }
  if (value.source !== "texture" && font.overlay && (target.textureSource === "premade" || !target.disableFontOverlay)) {
    assets.fontOverlay = sheetImage("forced-overlay.png")
    assets.densities.push(1)
  }
  assets.overlays = []
  const files = []
  for (const layer of value.overlays) {
    if (layer.source === "file") {
      if (!layer.file) continue
      const file = image(layer.file)
      assets.overlays.push({ layer: filePalette(layer.file).then(({ anchors }) => ({ ...layer, palette: anchors })), source: file })
      files.push(file)
      continue
    }
    const entry = list.overlays[layer.overlay]
    if (!entry || entry.layers && assets.band !== null && !entry.layers.includes(assets.band)) continue
    if (entry.generated) {
      assets.overlays.push({ layer: { ...layer, palette: definitionPalette(entry) }, source: { generated: entry.generated } })
      assets.densities.push(1)
    } else {
      assets.overlays.push({ layer: { ...layer, palette: definitionPalette(entry) }, source: sheetImage(`overlays/${layer.overlay}.png`) })
      assets.densities.push(entry.density ?? 1)
    }
  }
  const keys = ["shape", "base", "tile", "cover", "fontOverlay"].filter(key => key in assets)
  const [loaded, overlays, sizes] = await Promise.all([Promise.all(keys.map(key => assets[key])), Promise.all(assets.overlays.map(async ({ layer, source }) => ({ layer: await layer, source: await source }))), Promise.all(files)])
  const fromFont = new Set(["shape", "fontOverlay"].concat(value.source === "texture" ? ["base"] : []))
  for (const [index, key] of keys.entries()) assets[key] = fromFont.has(key) ? bandOf(loaded[index], band, font) : loaded[index]
  assets.overlays = overlays.map(({ layer, source }) => source.generated ? { layer, source } : { layer, source: bandOf(source, band, font) })
  for (const file of sizes) assets.densities.push(bandOf(file, band, font).width / sheet.width)
  if (value.source === "texture" && target.textureSource === "custom") assets.densities.push(assets.base.width / sheet.width)
  assets.edgeOverlays = value.edgeOverlays.flatMap(layer => list.edgeOverlays[layer.overlay] ? [{ layer, generated: list.edgeOverlays[layer.overlay].generated }] : [])
  return assets
}

export function paintedLayer(value, assets) {
  return { edge: 1 / Math.min(...assets.densities, 4), edgeOnly: value.source === "tile", look: value, assets }
}
