import { publishedFonts, readMask } from "../../generator/fonts.js"

export const fonts = publishedFonts()
export const sheets = fonts.filter(entry => !entry.inherits)
const masks = new Map()

export function maskOf(entry) {
  if (!masks.has(entry.id)) masks.set(entry.id, readMask(entry, fonts))
  return masks.get(entry.id)
}
