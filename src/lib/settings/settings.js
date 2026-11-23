import { PANELS, TILING_KEYS, TYPED_KEYS, TYPES, TYPE_KEYS, applyType, defaultBorder, defaultDepth, defaultSpacing, objectDefaults, stops, typed } from "./defaults.js"
import { plainCopy, sameValue } from "../core/values.js"
import { FACE_PANELS, defaultTexture, textureFaces } from "./textureDefaults.js"

export const LINE = new Set(["font", "customFont", "fadeCurves", "curveAngle", "curveHeight", "terminators", "type", "row", "rowSpacing", "depth", "depthAnchor", "border", "clipHoles", "layerWords", "spacing", "kerning", "arcMode", "arcTop", "arcBottom", "arcMove", "arcCentre", "arcMarked", "twistRibbon", "twistRibbonCentre", "twistRibbonMirror", "twistDoor", "twistDoorCentre", "twistDoorSame", "twistDoorRoll", "twistDoorDepth", "twistFan", "twistFanCentre", "twistFanRoll", "twistFanHeight"].concat(Object.keys(PANELS.transform())))

const KEYS = Object.keys(objectDefaults())

let next = 1

export function buildObject(values = {}, id = next, wrap = value => value) {
  next = Math.max(next, id + 1)
  const object = wrap({ ...objectDefaults(), id })
  restore(object, values)
  for (const key of TYPED_KEYS) {
    if (!(key in values)) object[key] = TYPES[object.type][key]
  }
  return object
}

export const TRANSFORM_GROUPS = {
  match: ["matchWidth", "matchBottom", "matchScaleY"],
  scale: ["scaleX", "scaleY", "linkScale", "scaleMarked", "scaleZ", "scaleOutline"],
  rotation: ["rotationX", "rotationY", "rotationZ"],
  translation: ["translateX", "translateY", "translateZ"]
}

export function effectiveScale(object) {
  return [object.scaleX * object.matchScale, object.matchScaleY ? object.scaleY * object.matchScale : object.scaleY, object.scaleZ]
}

export const TRANSFORM_LIMITS = { scale: [0.05, 4], rotation: [-180, 180], translation: [-200, 200] }

export const TEXTURE_TABS = {
  premade: ["texture", "textureVariant"],
  tileable: ["tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion"].concat(TILING_KEYS),
  gradient: ["stops", "smooth", "mix", "gradientAngle"],
  custom: ["customTexture", "customTextureMode", "customCoverAlign", "customCoverX", "customCoverY", "customCoverSpan", "customStripPerCharacter"]
}

function panelKeys(object, name) {
  if (name === "texture") return TEXTURE_TABS[object.textureSource]
  if (name === "overlays" && object.textureSource === "premade") return ["overlayMode", "overlays"]
  return Object.keys(PANELS[name]()).filter(key => key !== "text")
}

export function copiedKeys(object, name) {
  return (name === "texture" ? ["textureSource"] : []).concat(panelKeys(object, name))
}

export function resetPanel(object, name, context = {}) {
  const values = PANELS[name]()
  for (const key of panelKeys(object, name)) object[key] = values[key]
  if (name === "placement") applyType(object, object.type, context.font)
  if (name === "geometry") {
    object.depth = defaultDepth(context.font)
    object.border = defaultBorder(object.type, context.font)
  }
  if (name === "spacing") object.spacing = defaultSpacing(object.type, context.font)
  if (name === "texture" && object.textureSource === "gradient") object.stops = stops(object.type)
  if (name === "texture" && object.textureSource === "premade") {
    if (context.list) object.texture = defaultTexture(context.list, object.type)
    object.overlayMode = "default"
    object.edgeOverlayMode = "default"
  }
  for (const key of TYPE_KEYS[name] ?? []) object[key] = typed(object.type, context.font)[key]
  if (FACE_PANELS.includes(name)) Object.assign(object, textureFaces(context.list, object, name, context.layer ?? 0))
}

export function isModified(object, name, context = {}, keys = panelKeys(object, name)) {
  const probe = { type: object.type, textureSource: object.textureSource, texture: object.texture, textureVariant: object.textureVariant }
  resetPanel(probe, name, context)
  return keys.some(key => !sameValue(probe[key], object[key]))
}

export function wordKey(key) {
  return `word${key[0].toUpperCase()}${key.slice(1)}`
}

export function transformKeys(group, word) {
  return word ? TRANSFORM_GROUPS[group].map(wordKey).filter(key => key in PANELS.wordTransform()) : TRANSFORM_GROUPS[group]
}

export function resetTransform(object, group, word = false) {
  const values = PANELS[word ? "wordTransform" : "transform"]()
  for (const key of transformKeys(group, word)) object[key] = values[key]
}

export const CUSTOM_FONT = "custom-"
export const CUSTOM_FONT_KINDS = ["json", "ascii", "minecraft", "outline", "silhouette"]

export function isCustomFont(id) {
  return typeof id === "string" && id.startsWith(CUSTOM_FONT)
}

export function snapshot(object) {
  const { id, ...values } = plainCopy(object)
  return values
}

export function restore(object, values) {
  for (const key of KEYS) {
    if (key in values) object[key] = structuredClone(values[key])
  }
}
