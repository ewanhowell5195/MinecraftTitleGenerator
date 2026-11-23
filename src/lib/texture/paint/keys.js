import { PLACED_KINDS, settingsOf } from "../overlays/settings.js"
import { remember } from "../../core/maths.js"

const CACHED_URLS = 64

const BASE = ["font", "source", "textureSource", "texture", "textureVariant", "tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion", "customTexture", "customOverlayStrip", "customCoverX", "customCoverY", "customStripPerCharacter", "stops", "smooth", "mix", "gradientAngle", "arcGradient", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "tileablePerCharacter", "disableFontOverlay", "edgeBrightness"]

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
  return lookKey([BASE.map(name => look[name]), [assets.shape, assets.base, assets.tile, assets.fontOverlay, image, assets.overlayStrip?.image].map(item => item ? idOf(item) : null), strip, assets.border])
}

function neighbourReach({ layer = {}, source }) {
  if (source.generated === "shadow") {
    const { distance, blur } = settingsOf("shadow", layer)
    return Math.ceil(distance + blur) + 1
  }
  if (source.generated === "extrusion_outline") return Math.ceil(settingsOf("extrusion_outline", layer).thickness) + 1
  return source.generated ? 0 : -Infinity
}

function neighboursOf(glyph, reach) {
  const near = []
  if (glyph.placedX === undefined) return near
  for (let other = glyph.previous; other && other.placedX + other.width >= glyph.placedX - reach; other = other.previous) near.push(other)
  for (let other = glyph.next; other && other.placedX <= glyph.placedX + glyph.width + reach; other = other.next) near.push(other)
  return near.map(other => [other.char, other.placedX - glyph.placedX, other.bottom + (other.lift ?? 0) - glyph.bottom - (glyph.lift ?? 0), other.width, other.height, other.arc])
}

export function paintKey(sheet, assets, look) {
  const placed = assets.overlays.some(overlay => PLACED_KINDS.has(overlay.source.generated))
  const lined = assets.strip?.tiling === "line" || look.source === "tile" && !look.tileablePerCharacter
  const worded = look.wordedFaces || look.source === "cover" || look.source === "gradient" && look.gradientAngle % 180 !== 0
  const reach = Math.max(-Infinity, ...assets.overlays.map(neighbourReach), assets.edgeOverlays?.length ? 0 : -Infinity)
  return JSON.stringify([sheet.width, sheet.height, sheet.swatch, sheet.tallest, worded ? sheet.wordWidth : null, Object.values(sheet.glyphs).map(entry => [entry.char, entry.regions, entry.x, entry.top, entry.up, entry.upHeight, entry.down, entry.downHeight, entry.width, entry.height, entry.glyph.bottom, entry.glyph.top, entry.glyph.arc, placed ? [entry.glyph.placedX, entry.glyph.lineSpan] : null, lined ? [entry.glyph.lineX, entry.glyph.lineFirst?.char] : null, worded ? entry.glyph.wordX : null, neighboursOf(entry.glyph, reach)])])
}
