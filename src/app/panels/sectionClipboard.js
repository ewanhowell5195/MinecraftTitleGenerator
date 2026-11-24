import "./host.js"
import { reactive } from "vue"
import { plainCopy } from "../../lib/core/values.js"
import { customFontEntry } from "../../lib/font/customFonts.js"
import { copiedKeys, transformKeys } from "../../lib/settings/settings.js"
import { OVERLAY_KINDS, setTexture } from "../../lib/settings/textureDefaults.js"
import { currentWord, shapingWord } from "../../lib/state/scene.js"
import { FORM_SECTIONS } from "../../lib/state/view.js"
import { host } from "../../lib/panels/host.js"
import { panelTarget } from "../../lib/panels/panel.js"

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

function partsOf(section) {
  const word = sectionWord(section)
  if (section === "form") return (currentWord.value?.shape != null ? ["geometry"] : FORM).map(name => panelPart(word ? `word${name[0].toUpperCase()}${name.slice(1)}` : name, word))
  if (section === "transform") return TRANSFORM.map(group => ({ name: `transform ${group}`, object: panelTarget("transform", word).object, keys: transformKeys(group, word) }))
  return (PANELS[section] ?? []).map(name => panelPart(name))
}

function sectionWord(section) {
  return FORM_SECTIONS.has(section) && shapingWord.value
}

export function canCopySection(section) {
  return partsOf(section).length > 0
}

export function copySection(section) {
  clipboard.section = section
  clipboard.word = sectionWord(section)
  clipboard.parts = partsOf(section).map(part => ({ name: part.name, values: Object.fromEntries(part.keys.map(key => [key, plainCopy(part.object[key])])) }))
}

export function canPasteSection(section) {
  if (clipboard.section !== section || clipboard.word !== sectionWord(section)) return false
  const targets = new Map(partsOf(section).map(part => [part.name, part]))
  const shared = clipboard.parts.filter(part => targets.has(part.name))
  return shared.length > 0 && shared.every(({ name, values }) => FITS[name]?.(targets.get(name), values) ?? true)
}

export async function pasteSection(section) {
  if (!canPasteSection(section)) throw new Error(`there are no ${section} settings that fit here to paste`)
  const targets = new Map(partsOf(section).map(part => [part.name, part]))
  for (const { name, values } of plainCopy(clipboard.parts)) {
    if (targets.has(name)) await (PASTE[name] ?? assign)(targets.get(name), values)
  }
}
