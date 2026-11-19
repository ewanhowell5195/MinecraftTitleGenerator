import { DEFAULT_ORDER } from "./order.js"
import { withDefaultStrips } from "./strips.js"
import { kerningPairs } from "./kerning.js"

export const FONTS_FOLDER = "fonts"

function partialsOf(data, list) {
  return list.filter(entry => entry.variant === data.id && entry.inherits)
}

export function orderOf(data) {
  return data.order ?? DEFAULT_ORDER
}

export function splitCells(data, list, cells) {
  let start = Array.from(orderOf(data)).length
  if (cells.length === Array.from(fullOrder(data, list)).length + 1 && cells[start]?.char === " ") start++
  const glyphs = Object.fromEntries(cells.slice(0, start).map(glyph => [glyph.char, glyph]))
  const alternates = {}
  for (const entry of partialsOf(data, list)) {
    const end = start + Array.from(entry.order).length
    alternates[entry.id] = Object.fromEntries(cells.slice(start, end).map(glyph => [glyph.char, glyph]))
    start = end
  }
  return { glyphs, alternates }
}

export function fullOrder(data, list) {
  return orderOf(data) + partialsOf(data, list).map(entry => entry.order).join("")
}

export function fontFolder(data) {
  if (data.folder) return data.folder
  return data.variant ? `${FONTS_FOLDER}/${data.variant}/variants/${data.id}` : `${FONTS_FOLDER}/${data.id}`
}

export function sheetOwner(data, list) {
  return data.inherits ? list.find(entry => entry.id === data.variant) ?? data : data
}

export function sheetFolder(data, list) {
  return fontFolder(sheetOwner(data, list))
}

export function linkText(text, id, list) {
  const font = list.find(entry => entry.id === id)
  return font && sheetOwner(font, list).multicase ? text : text.toLowerCase()
}

export function stripsOf(data, list) {
  return withDefaultStrips(sheetOwner(data, list).strips)
}

export function fullName(entry, fonts) {
  const parent = entry.variant && fonts.find(item => item.id === entry.variant)
  return parent ? `${parent.name}: ${entry.name}` : entry.name
}

function withPairs(entry) {
  return entry.kerning === undefined ? entry : { ...entry, kerning: kerningPairs(entry.kerning, entry.id) }
}

export function flattenFonts(list) {
  return list.flatMap(({ variants, ...entry }) => [withPairs(entry)].concat((variants ?? []).map(variant => withPairs({ ...variant, variant: entry.id }))))
}
