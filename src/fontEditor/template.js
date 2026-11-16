import { CREEPER } from "../lib/order.js"
import { SPACE_CHAR, autoStretch, glyphFromTemplate, setGlyph, shownAs } from "../lib/fontEditor.js"

const sources = new Map()

function fontImport() {
  return import("../lib/fontImport.js")
}

function sourceOf(template) {
  if (!sources.has(template.data)) sources.set(template.data, Promise.all([fontImport(), fetch(template.data).then(response => response.arrayBuffer())]).then(([{ parseFontFile }, buffer]) => parseFontFile(buffer)))
  return sources.get(template.data)
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

function drawable(chars) {
  return chars.filter(char => char !== SPACE_CHAR && char !== CREEPER)
}

export function glyphsFromSource(outlineShape, source, font, chars, square) {
  return Object.fromEntries(drawable(chars).flatMap(char => {
    const found = outlineShape(source, shownAs(char, font.letterCase), { height: font.height, density: square })
    return found ? [[char, glyphFromTemplate(font, found.shape, found.capHeight)]] : []
  }))
}

export async function templateGlyphs(font, chars) {
  if (!font.template || !drawable(chars).length) return {}
  const [{ outlineShape }, source] = await Promise.all([fontImport(), sourceOf(font.template)])
  return glyphsFromSource(outlineShape, source, font, chars, font.template.square)
}

export function withTemplateGlyphs(font, glyphs) {
  const chars = Object.keys(glyphs)
  if (!chars.length) return font
  return autoStretch(chars.reduce((result, char) => setGlyph(result, char, glyphs[char]), font), chars)
}
