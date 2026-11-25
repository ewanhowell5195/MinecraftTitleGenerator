import { authorList } from "#lib/core/authors.js"
import { blankStrip, flatLayers, flatPixels, independentLayers } from "../flatSheet.js"
import { groupedKerning } from "../kerning.js"
import { DEFAULT_ORDER } from "../order.js"
import { defaultBorder, defaultDepth } from "#lib/settings/defaults.js"
import { SPACE_CHAR, charactersOf, previewText } from "./characters.js"
import { DEFAULT_BORDER, DEFAULT_DEPTH, DEFAULT_ID, DEFAULT_SPACE_WIDTH } from "./defaults.js"
import { fontLayers } from "./depths.js"
import { inkLeft, isBlank, trimmed, widthOf } from "./glyph.js"
import { parsedSheet, savedCharacters, savedSheet } from "./sheet.js"

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function fontId(font) {
  return font.id?.trim() || slug(font.name ?? "")
}

export function savedJson(font, encode) {
  return exportJson(font, encode(savedSheet(font)), savedCharacters(font))
}

export function flatTexture(value, fill = null) {
  const entry = exportJson(value, "")
  const { list, capHeight, layers } = parsedSheet(value, defaultBorder("top", entry))
  if (fill === "all") return flatPixels(list.map(cell => ({ ...cell, mask: new Uint8Array(cell.mask.length).fill(1) })), capHeight, defaultDepth(entry), 1, true)
  return flatLayers(list, capHeight, defaultDepth(entry), layers, 1, !!fill, independentLayers(entry))
}

export function stripTexture(value) {
  const entry = exportJson(value, "")
  const { list, capHeight, layers } = parsedSheet(value, defaultBorder("top", entry))
  const letter = list.find(cell => cell.char === "A" && cell.width) ?? list.find(cell => cell.char === "a" && cell.width)
  return blankStrip(list, capHeight, defaultDepth(entry), layers, letter?.width ?? value.width * value.density, independentLayers(entry))
}

function canvasOf(font, glyph) {
  const trim = trimmed(font, glyph)
  const saved = isBlank(glyph) ? { above: 0, below: 0, stretch: [] } : trim
  const marked = saved.stretch.length === glyph.stretch.length
  if (widthOf(font, trim) === widthOf(font, glyph) && saved.above === glyph.above && saved.below === glyph.below && marked) return null
  return { width: glyph.width, left: isBlank(glyph) ? 0 : inkLeft(glyph), above: glyph.above, below: glyph.below, ...(!marked && { stretch: glyph.stretch }) }
}

export function exportJson(font, texture, characters = charactersOf(font)) {
  const entry = { id: fontId(font) || DEFAULT_ID, name: font.name?.trim() }
  const order = characters.join("")
  const authors = authorList(font.authors)
  const description = font.description?.trim()
  const basedOn = font.basedOn?.trim()
  if (authors.length) entry.authors = authors
  if (description) entry.description = description
  if (previewText(font)) entry.preview = previewText(font)
  if (basedOn) entry.basedOn = basedOn
  if (font.strips.length) entry.strips = font.strips
  if (order !== DEFAULT_ORDER && order !== `${DEFAULT_ORDER}${SPACE_CHAR}`) entry.order = order
  if (font.letterCase === "both") entry.multicase = true
  if (font.spaceWidth !== DEFAULT_SPACE_WIDTH) entry.spaceWidth = font.spaceWidth
  if (font.depth !== DEFAULT_DEPTH) entry.depth = font.depth
  if (font.border !== DEFAULT_BORDER) entry.border = font.border
  if (font.characterSpacing) entry.characterSpacing = font.characterSpacing
  for (const key of ["terminatorSpace", "forcedTerminators", "autoBorder", "flat", "overlay"]) if (font[key]) entry[key] = true
  if (font.allFaces) entry.allFaces = font.allFaces === "fade" ? "fade" : true
  if (font.layerDepth === "independent" && fontLayers(font)) entry.layerDepth = "independent"
  if (font.terminatorSpace && !font.defineSpace && (font.terminatorSpaceWidth ?? font.spaceWidth) !== font.spaceWidth) entry.terminatorSpaceWidth = font.terminatorSpaceWidth
  const kerning = Object.fromEntries(Object.entries(font.kerning).filter(([, amount]) => amount))
  if (Object.keys(kerning).length) entry.kerning = groupedKerning(kerning)
  const canvas = Object.fromEntries(Array.from(order).flatMap(char => {
    const saved = font.glyphs[char] && canvasOf(font, font.glyphs[char])
    return saved ? [[char, saved]] : []
  }))
  entry.editor = { height: font.height, width: font.width, grid: font.grid, density: font.density, ...(font.letterCase === "lower" && { letterCase: "lower" }), ...(Object.keys(canvas).length && { canvas }), texture, ...(font.template && { template: font.template }), ...(font.requireCharacters === false && { requireCharacters: false, ...(font.omitted?.length && { omitted: font.omitted.join("") }) }) }
  return entry
}
