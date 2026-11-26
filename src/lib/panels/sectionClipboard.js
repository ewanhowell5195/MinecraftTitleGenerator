import { reactive } from "vue"
import { plainCopy } from "../core/values.js"
import { customFontEntry } from "../font/customFonts.js"
import { copiedKeys, transformKeys } from "../settings/settings.js"
import { OVERLAY_KINDS, setTexture } from "../settings/textureDefaults.js"
import { host } from "./host.js"
import { panelTarget } from "./panel.js"

const PANELS = {
  text: ["placement"],
  placement: ["placement"],
  font: ["font", "curves", "creeper", "terminators", "spacing"],
  texture: ["texture"],
  colour: ["colour", "outline", "faces", "inner", "sides"],
  overlays: ["overlays", "edgeOverlays"]
}
const FORM = ["geometry", "arc", "ribbon", "wrap", "fan"]
const TRANSFORM = ["scale", "rotation", "translation"]

const clipboard = reactive({ section: null, word: false, parts: [] })

function assign(part, values) {
  Object.assign(part.object, values)
}

function overlaysFit(part, values) {
  return values[OVERLAY_KINDS[part.name]] !== "custom" || values[part.name].every(layer => layer.source === "file" || !!part.list?.[part.name]?.[layer.overlay])
}

function pastePlacement(part, values) {
  host.placeLine(values.type)
  part.object.rowSpacing = values.rowSpacing
}

async function pasteFont(part, values) {
  if (values.customFont) await customFontEntry(values.customFont)
  assign(part, values)
}

const PASTE = {
  placement: pastePlacement,
  font: pasteFont,
  texture: (part, values) => setTexture(part.object, values, { before: part.list })
}

const FITS = {
  texture: (part, values) => values.textureSource !== "premade" || values.texture === null || !!part.list?.textures?.[values.texture] && (!values.textureVariant || !!part.list.textures[values.texture].variants?.[values.textureVariant]),
  overlays: overlaysFit,
  edgeOverlays: overlaysFit
}

function keysOf(name, object, font, word) {
  if (name === "placement") return ["type", "rowSpacing"]
  if (name === "texture") return Array.from(new Set(copiedKeys(object, "texture").concat(copiedKeys(object, "tiling"))))
  if (font?.model && (name === "geometry" || name === "wordGeometry")) return [word ? "wordBorder" : "border"]
  return copiedKeys(object, name)
}

function panelPart(name, word = false) {
  const { object, font, list } = panelTarget(name, word)
  return { name, object, list, keys: keysOf(name, object, font, word) }
}

function partsOf(section, { word, shape }) {
  if (section === "form") return (shape !== null ? ["geometry"] : FORM).map(name => panelPart(word ? `word${name[0].toUpperCase()}${name.slice(1)}` : name, word))
  if (section === "transform") return TRANSFORM.map(group => ({ name: `transform ${group}`, object: panelTarget("transform", word).object, keys: transformKeys(group, word) }))
  return (PANELS[section] ?? []).map(name => panelPart(name))
}

export function canCopySection(section, place) {
  return partsOf(section, place).length > 0
}

export function copySection(section, place) {
  clipboard.section = section
  clipboard.word = place.word
  clipboard.parts = partsOf(section, place).map(part => ({ name: part.name, values: Object.fromEntries(part.keys.map(key => [key, plainCopy(part.object[key])])) }))
}

export function canPasteSection(section, place) {
  if (clipboard.section !== section || clipboard.word !== place.word) return false
  const targets = new Map(partsOf(section, place).map(part => [part.name, part]))
  const shared = clipboard.parts.filter(part => targets.has(part.name))
  return shared.length > 0 && shared.every(({ name, values }) => FITS[name]?.(targets.get(name), values) ?? true)
}

export async function pasteSection(section, place) {
  if (!canPasteSection(section, place)) throw new Error(`there are no ${section} settings that fit here to paste`)
  const targets = new Map(partsOf(section, place).map(part => [part.name, part]))
  for (const { name, values } of plainCopy(clipboard.parts)) {
    if (targets.has(name)) await (PASTE[name] ?? assign)(targets.get(name), values)
  }
}
