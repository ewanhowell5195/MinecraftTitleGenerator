import { pixelsOf, surface } from "../texture/canvas.js"
import { loadImage } from "./font.js"
import { isMinecraftFont, minecraftBundle, readMinecraftFont } from "./minecraftFont.js"

function dataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`${file.name} couldn't be read`))
    reader.readAsDataURL(file)
  })
}

export async function texturePixels(url, name = "a texture") {
  let image
  try {
    image = await loadImage(url)
  } catch {
    throw new Error(`${name} isn't an image this browser can read`)
  }
  return { data: pixelsOf(image), width: image.width, height: image.height }
}

async function fontJson(file) {
  try {
    const json = JSON.parse(await file.text())
    return isMinecraftFont(json) ? json : null
  } catch {
    return null
  }
}

const VANILLA_SHEETS = ["ascii.png", "accented.png", "nonlatin_european.png"]
const PICTURE_HEIGHT = 22
const pictures = new WeakMap()

function drawGlyph(glyph, colour) {
  const { canvas, ctx } = surface(glyph.right, glyph.cellHeight)
  const image = ctx.createImageData(glyph.right, glyph.cellHeight)
  for (let row = 0; row < glyph.cellHeight; row++) {
    for (let column = 0; column < glyph.right; column++) image.data[(row * glyph.right + column) * 4 + 3] = glyph.image.data[((glyph.y + row) * glyph.image.width + glyph.x + column) * 4 + 3]
  }
  ctx.putImageData(image, 0, 0)
  ctx.globalCompositeOperation = "source-in"
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/png")
}

function picture(source, glyph, colour) {
  const size = Math.max(1, Math.floor(PICTURE_HEIGHT / source.capRows)) * glyph.scale / source.scale
  return { src: drawGlyph(glyph, colour), width: glyph.right * size, height: glyph.cellHeight * size }
}

export function glyphPicture(source, char, colour) {
  const known = pictures.get(source) ?? new Map()
  pictures.set(source, known)
  const key = `${colour}:${char}`
  const glyph = source.glyphs.get(char)
  if (!known.has(key)) known.set(key, glyph?.right ? picture(source, glyph, colour) : null)
  return known.get(key)
}

export async function minecraftJson(files) {
  for (const file of Array.from(files).filter(item => /\.json$/i.test(item.name))) {
    const json = await fontJson(file)
    if (json) return { file, json }
  }
  return null
}

function pngsOf(files) {
  return Array.from(files).filter(item => /\.png$/i.test(item.name))
}

async function fontFrom(json, fileName, name, named) {
  const urls = new Map(await Promise.all(named.map(async ([sheet, item]) => [sheet, await dataUrl(item)])))
  const images = new Map(await Promise.all(Array.from(urls, async ([sheet, url]) => [sheet, await texturePixels(url, sheet)])))
  const source = readMinecraftFont(json, images, { fileName })
  const textures = Object.fromEntries(source.used.map(sheet => [sheet, urls.get(sheet)]))
  return { name, data: minecraftBundle({ json, fileName, textures }), source }
}

export async function minecraftFontFiles(files) {
  const found = await minecraftJson(files)
  if (!found) return null
  return fontFrom(found.json, found.file.name, found.file.name, pngsOf(files).map(item => [item.name.toLowerCase(), item]))
}

export async function minecraftSheetFiles(files) {
  const pngs = pngsOf(files)
  if (!pngs.length) return null
  const sheets = pngs.filter(item => VANILLA_SHEETS.includes(item.name.toLowerCase()))
  const named = sheets.length ? sheets.map(item => [item.name.toLowerCase(), item]) : [["ascii.png", pngs[0]]]
  return fontFrom({ providers: [] }, "default.json", (sheets[0] ?? pngs[0]).name, named)
}
