import { fontFolder, linkText, sheetOwner, stripsOf } from "#lib/font/catalog.js"
import { encodeTitle } from "#lib/link/linkformat.js"
import { DEFAULT_FONT } from "#lib/settings/defaults.js"
import { overlayLayer } from "#lib/settings/textureDefaults.js"
import { FILE_VERSION } from "#lib/settings/upgrades.js"
import { stripUse } from "#lib/font/strips.js"
import { stripTarget } from "./stripFit.js"

export const THUMBNAIL_KINDS = ["font", "texture", "overlay", "strip"]

export function stripFonts(item, fonts) {
  const target = stripTarget(item.target)
  if (target.kind === "font") return fonts.filter(font => font.id === target.id)
  if (target.kind === "set") return fonts.filter(font => stripsOf(font, fonts).some(use => stripUse(use).id === target.id)).sort((a, b) => (b.id === DEFAULT_FONT) - (a.id === DEFAULT_FONT))
  const chosen = item.details.fonts ?? []
  return fonts.filter(font => chosen.includes(sheetOwner(font, fonts).id))
}

function publishedLine(item, fonts, text) {
  if (item.kind === "font") return { text, font: item.asset }
  if (item.kind === "texture") return { text, font: item.target, textureSource: "premade", ...(item.details?.variantOf ? { texture: item.details.variantOf, textureVariant: item.asset } : { texture: item.asset }) }
  if (item.kind === "overlay") return { text, font: item.target, textureSource: "premade", texture: "flat", overlayMode: "custom", overlays: [overlayLayer(item.asset)] }
  if (item.kind === "strip") return { text, font: stripFonts(item, fonts)[0]?.id ?? DEFAULT_FONT, textureSource: "premade", ...(item.details?.variantOf ? { texture: item.details.variantOf, textureVariant: item.asset } : { texture: item.asset }) }
  if (item.kind === "tileable") return { text, font: DEFAULT_FONT, textureSource: "tileable", tileableSource: "premade", tileable: item.target || item.asset, tileableVariant: item.target ? item.asset : null }
  if (item.kind === "shapeImage" || item.kind === "shapeModel") return { shape: item.asset }
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
  const line = publishedLine(item, fonts, item.name)
  return `/app/?title=${encodeTitle({ version: FILE_VERSION, lines: [{ ...line, ...("text" in line && { text: linkText(line.text, line.font, fonts) }) }] }).code}`
}
