import { fontFolder, sheetOwner, stripsOf } from "../font.js"
import { encodeTitle } from "../linkformat.js"
import { FILE_VERSION, overlayLayer } from "../settings.js"
import { stripUse } from "../strips.js"
import { stripTarget } from "./stripFit.js"

export const PREVIEW_FONT = "minecraft-ten"
export const THUMBNAIL_KINDS = ["font", "texture", "overlay", "strip"]

export function stripFonts(item, fonts) {
  const target = stripTarget(item.target)
  if (target.kind === "font") return fonts.filter(font => font.id === target.id)
  if (target.kind === "set") return fonts.filter(font => stripsOf(font, fonts).some(use => stripUse(use).id === target.id)).sort((a, b) => (b.id === PREVIEW_FONT) - (a.id === PREVIEW_FONT))
  const chosen = item.details.fonts ?? []
  return fonts.filter(font => chosen.includes(sheetOwner(font, fonts).id))
}

export function publishedLine(item, fonts, text) {
  if (item.kind === "font") return { text, font: item.asset }
  if (item.kind === "texture") return { text, font: item.target, textureSource: "premade", texture: item.asset }
  if (item.kind === "overlay") return { text, font: item.target, textureSource: "premade", texture: "flat", overlayMode: "custom", overlays: [overlayLayer(item.asset)] }
  if (item.kind === "strip") return { text, font: stripFonts(item, fonts)[0]?.id ?? PREVIEW_FONT, textureSource: "premade", texture: item.asset }
  if (item.kind === "tileable") return { text, font: PREVIEW_FONT, textureSource: "tileable", tileableSource: "premade", tileable: item.target || item.asset, tileableVariant: item.target ? item.asset : null }
  throw new Error(`${item.kind} submissions have no published line`)
}

export function thumbnailPath(item, fonts) {
  if (!item.asset || !THUMBNAIL_KINDS.includes(item.kind)) return null
  if (item.kind === "font") return `${fontFolder({ id: item.asset, variant: item.target })}/thumbnails/flat.png`
  const font = item.kind === "strip" ? stripFonts(item, fonts)[0] : fonts.find(entry => entry.id === item.target)
  if (font) return `${fontFolder(font)}/thumbnails/${item.asset}.png`
  return null
}

export function publishedTitle(item, fonts) {
  return `/app/?title=${encodeTitle({ version: FILE_VERSION, lines: [publishedLine(item, fonts, item.name)] }).code}`
}
