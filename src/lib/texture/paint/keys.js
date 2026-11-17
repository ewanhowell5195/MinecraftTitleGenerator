import { PLACED_KINDS } from "../overlays/settings.js"
import { remember } from "../../core/maths.js"

const CACHED_URLS = 64

const BASE = ["font", "source", "textureSource", "texture", "textureVariant", "tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion", "customTexture", "customCoverX", "customCoverY", "stops", "smooth", "gradientAngle", "arcGradient", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "tileablePerCharacter", "disableFontOverlay", "edgeBrightness"]

const ids = new WeakMap()
const urlIds = new Map()
let nextId = 0

export function idOf(value) {
  if (!ids.has(value)) ids.set(value, ++nextId)
  return ids.get(value)
}

export function lookKey(value) {
  return JSON.stringify(value, (name, item) => typeof item === "string" && item.startsWith("data:") ? remember(urlIds, item, () => ++nextId, CACHED_URLS) : item)
}

export function baseKey(look, assets) {
  const { image, ...strip } = assets.strip ?? {}
  return lookKey([BASE.map(name => look[name]), [assets.shape, assets.base, assets.tile, assets.fontOverlay, image].map(item => item ? idOf(item) : null), strip, assets.border])
}

export function paintKey(sheet, assets, look) {
  const placed = assets.overlays.some(overlay => PLACED_KINDS.has(overlay.source.generated))
  const lined = assets.strip?.tiling === "line" || look.source === "tile" && !look.tileablePerCharacter
  const worded = look.wordedFaces || look.source === "gradient" && look.gradientAngle % 180 !== 0
  return JSON.stringify([sheet.width, sheet.height, sheet.swatch, sheet.tallest, worded ? sheet.wordWidth : null, Object.values(sheet.glyphs).map(entry => [entry.char, entry.regions, entry.x, entry.top, entry.up, entry.upHeight, entry.down, entry.downHeight, entry.width, entry.height, entry.glyph.bottom, entry.glyph.top, entry.glyph.arc, placed ? [entry.glyph.placedX, entry.glyph.lineSpan] : null, lined ? [entry.glyph.lineX, entry.glyph.lineFirst?.char] : null, worded ? entry.glyph.wordX : null])])
}
