import { CREEPER } from "../lib/font/order.js"
import { SPACE_CHAR, shownAs } from "../lib/font/editor/characters.js"
import { setGlyph } from "../lib/font/editor/glyph.js"
import { glyphFromTemplate } from "../lib/font/editor/import.js"
import { autoStretch } from "../lib/font/editor/sheet.js"

const sources = new Map()
const families = new Map()

function fontImport() {
  return import("../lib/font/fontImport.js")
}

function minecraftImport() {
  return import("../lib/font/minecraftFont.js")
}

async function minecraftTemplateSource(template) {
  const [{ minecraftSource }, { texturePixels }, text] = await Promise.all([minecraftImport(), import("../lib/font/minecraftFiles.js"), fetch(template.data).then(response => response.text())])
  return minecraftSource(text, texturePixels)
}

export function templateSource(template) {
  if (!sources.has(template.data)) sources.set(template.data, template.kind === "minecraft" ? minecraftTemplateSource(template) : Promise.all([fontImport(), fetch(template.data).then(response => response.arrayBuffer())]).then(([{ parseFontFile }, buffer]) => parseFontFile(buffer)))
  return sources.get(template.data)
}

async function templateShape(template) {
  return template.kind === "minecraft" ? (await minecraftImport()).minecraftShape : (await fontImport()).outlineShape
}

export function templateFamily(template) {
  if (template.kind === "minecraft") return null
  if (!families.has(template.data)) {
    const family = `font-template-${families.size}`
    const face = new FontFace(family, `url(${template.data})`)
    document.fonts.add(face)
    face.load()
    families.set(template.data, family)
  }
  return families.get(template.data)
}

function dataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`${file.name} couldn't be read`))
    reader.readAsDataURL(file)
  })
}

export async function loadTemplate(file, square = 1) {
  const [{ outlineShape, parseFontFile }, buffer, data] = await Promise.all([fontImport(), file.arrayBuffer(), dataUrl(file)])
  const source = await parseFontFile(buffer)
  outlineShape(source, "H", { density: square })
  sources.set(data, Promise.resolve(source))
  return { template: { name: file.name, data, square }, source }
}

export function minecraftTemplate(minecraft, square = 1) {
  sources.set(minecraft.data, Promise.resolve(minecraft.source))
  return { template: { kind: "minecraft", name: minecraft.name, data: minecraft.data, square }, source: minecraft.source }
}

export async function loadTemplateFiles(files, square = 1) {
  const { minecraftFontFiles, minecraftSheetFiles } = await import("../lib/font/minecraftFiles.js")
  const minecraft = await minecraftFontFiles(files) ?? await minecraftSheetFiles(files)
  return minecraft ? minecraftTemplate(minecraft, square) : loadTemplate(Array.from(files).find(file => /\.(ttf|otf|woff2?)$/i.test(file.name)) ?? files[0], square)
}

function drawable(chars) {
  return chars.filter(char => char !== SPACE_CHAR && char !== CREEPER)
}

export function glyphsFromSource(shapeOf, source, font, chars, square) {
  return Object.fromEntries(drawable(chars).flatMap(char => {
    const found = shapeOf(source, shownAs(char, font.letterCase), { height: font.height, density: square })
    return found ? [[char, glyphFromTemplate(font, found.shape, found.capHeight)]] : []
  }))
}

export async function templateGlyphs(font, chars) {
  if (!font.template || !drawable(chars).length) return {}
  const [shapeOf, source] = await Promise.all([templateShape(font.template), templateSource(font.template)])
  return glyphsFromSource(shapeOf, source, font, chars, font.template.square)
}

export function withTemplateGlyphs(font, glyphs) {
  const chars = Object.keys(glyphs)
  if (!chars.length) return font
  return autoStretch(chars.reduce((result, char) => setGlyph(result, char, glyphs[char]), font), chars)
}
