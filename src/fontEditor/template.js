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

export async function templateGlyphs(font, chars) {
  const wanted = chars.filter(char => char !== SPACE_CHAR && char !== CREEPER)
  if (!font.template || !wanted.length) return {}
  const [{ outlineShape }, source] = await Promise.all([fontImport(), sourceOf(font.template)])
  return Object.fromEntries(wanted.flatMap(char => {
    const found = outlineShape(source, shownAs(char, font.letterCase), { height: font.height, density: font.template.square })
    return found ? [[char, glyphFromTemplate(font, found.shape, found.capHeight)]] : []
  }))
}

export function withTemplateGlyphs(font, glyphs) {
  const chars = Object.keys(glyphs)
  if (!chars.length) return font
  return autoStretch(chars.reduce((result, char) => setGlyph(result, char, glyphs[char]), font), chars)
}
