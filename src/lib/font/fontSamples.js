import { loadFont, loadImage } from "./font.js"
import { flatThumbnail, fontScene } from "./fontThumbnails.js"
import { pixelsOf } from "../texture/canvas.js"
import { pngUrl } from "../core/virtualFiles.js"
import { defaultDepth } from "../settings/defaults.js"

const flats = new Map()
const samples = new Map()

function flatTexture(folder) {
  if (!flats.has(folder)) {
    flats.set(folder, loadImage(`${folder}/textures/flat.png`).then(image => ({ data: pixelsOf(image), width: image.width, height: image.height })).catch(err => {
      flats.delete(folder)
      throw err
    }))
  }
  return flats.get(folder)
}

async function drawSample(data, list, text) {
  const font = await loadFont(data, list)
  const entry = { ...font, multicase: font.letterCase === "both" }
  const scene = fontScene(entry, { glyphs: font.glyphs, cells: font.cells, capHeight: font.capHeight, layers: font.layers, kerning: font.kerning, depth: defaultDepth(font) }, text)
  if (!scene) return null
  return pngUrl(flatThumbnail(entry, scene, await flatTexture(font.sheetFolder)))
}

export function fontSample(data, list, text) {
  const key = `${data.id}\n${text}`
  if (!samples.has(key)) {
    samples.set(key, drawSample(data, list, text).catch(err => {
      samples.delete(key)
      throw err
    }))
  }
  return samples.get(key)
}
