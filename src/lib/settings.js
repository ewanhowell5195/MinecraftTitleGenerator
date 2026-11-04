import { reactive } from "vue"

export const TYPES = {
  top: { name: "Top Text", stops: [["#FFCF76", 0], ["#DA371E", 100]], fade: false, outerFade: 0, internalFaces: false, fadeInternal: true, internalFade: 0, sideFaces: false, fadeSides: true, sideFade: 0, border: 2, spacing: 0 },
  bottom: { name: "Update Text", stops: [["#FFCF76", 0], ["#DA371E", 100]], fade: true, outerFade: 50, internalFaces: true, fadeInternal: true, internalFade: 75, sideFaces: false, fadeSides: true, sideFade: 75, border: 2, spacing: 0 },
  small: { name: "Edition Text", stops: [["#E0E0E0", 0], ["#8A8A8A", 100]], fade: false, outerFade: 0, internalFaces: true, fadeInternal: false, internalFade: 75, sideFaces: true, fadeSides: false, sideFade: 75, border: 3, spacing: 2 }
}

const BLENDS = {
  multiply: "Multiply",
  color: "Colour",
  lighter: "Lighter",
  screen: "Screen",
  overlay: "Overlay",
  "soft-light": "Soft Light",
  hue: "Hue",
  saturation: "Saturation",
  difference: "Difference",
  "source-over": "Source Over"
}

export const BLEND_OPTIONS = Object.entries(BLENDS).map(([value, label]) => ({ value, label }))

function stops(type) {
  return TYPES[type].stops.map(([colour, position]) => ({ colour, position }))
}

const PANELS = {
  text: () => ({
    text: "minecraft",
    spaceBefore: true
  }),
  terminators: () => ({
    terminators: false
  }),
  font: () => ({
    font: "minecraft-ten"
  }),
  placement: () => ({
    type: "top",
    row: 0,
    rowSpacing: 0
  }),
  geometry: () => ({
    depth: 22,
    border: 2
  }),
  spacing: () => ({
    spacing: 0,
    kerning: true
  }),
  arc: () => ({
    arcMode: "stretch",
    arcTop: 0,
    arcBottom: 0,
    arcMove: 0,
    arcMarked: true,
    arcGradient: false
  }),
  transform: () => ({
    matchWidth: null,
    scaleX: 1,
    scaleY: 1,
    linkScale: null,
    scaleZ: 1,
    scaleMarked: false,
    scaleOutline: false,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0
  }),
  wordGeometry: () => ({
    wordDepth: null,
    wordBorder: null
  }),
  wordArc: () => ({
    wordArcMode: "stretch",
    wordArcTop: 0,
    wordArcBottom: 0,
    wordArcMove: 0,
    wordArcMarked: true
  }),
  wordTransform: () => ({
    wordScaleX: 1,
    wordScaleY: 1,
    wordLinkScale: null,
    wordScaleZ: 1,
    wordScaleMarked: false,
    wordScaleOutline: false,
    wordRotationX: 0,
    wordRotationY: 0,
    wordRotationZ: 0,
    wordTranslateX: 0,
    wordTranslateY: 0,
    wordTranslateZ: 0
  }),
  texture: () => ({
    textureSource: "premade",
    texture: null,
    textureVariant: null,
    tileable: "cobblestone",
    tileableVariant: null,
    stops: stops("top"),
    smooth: true,
    gradientAngle: 0,
    tileableScale: 2,
    tileableXOffset: 0,
    tileableYOffset: 0,
    tileableRandomRotations: false,
    tileableRandomMirroring: false,
    tileableTileEdges: false,
    disableFontOverlay: false
  }),
  overlays: () => ({
    overlayMode: "default",
    overlays: []
  }),
  edgeOverlays: () => ({
    edgeOverlayMode: "default",
    edgeOverlays: []
  }),
  colour: () => ({
    hue: 0,
    saturation: 100,
    brightness: 100,
    contrast: 100,
    colour: "#ffffff",
    blend: "multiply",
    colourOpacity: 100
  }),
  outline: () => ({
    customBorder: false,
    borderColour: "#000000"
  }),
  inner: () => ({
    internalFaces: false,
    fadeInternal: true,
    internalFade: 75,
    customInternal: false,
    internalColour: "#000000",
    internalBrightness: 35
  }),
  sides: () => ({
    sideFaces: false,
    fadeSides: true,
    sideFade: 75,
    customSide: false,
    sideColour: "#000000",
    sideBrightness: 35
  }),
  faces: () => ({
    fade: false,
    outerFade: 50,
    customEdge: false,
    edgeColour: "#000000",
    edgeBrightness: 35
  })
}

export const LINE = new Set(["hidden", "font", "terminators", "type", "row", "rowSpacing", "depth", "border", "spacing", "kerning", "arcMode", "arcTop", "arcBottom", "arcMove", "arcMarked"].concat(Object.keys(PANELS.transform())))

function defaults() {
  return Object.assign({ hidden: false, group: null }, ...Object.values(PANELS).map(panel => panel()))
}

const KEYS = Object.keys(defaults())

let next = 1

export function createObject(values = {}, id = next) {
  next = Math.max(next, id + 1)
  const object = reactive({ ...defaults(), id })
  restore(object, values)
  return object
}

export const TRANSFORM_GROUPS = {
  scale: ["matchWidth", "scaleX", "scaleY", "linkScale", "scaleMarked", "scaleZ", "scaleOutline"],
  rotation: ["rotationX", "rotationY", "rotationZ"],
  translation: ["translateX", "translateY", "translateZ"]
}

export const TRANSFORM_LIMITS = { scale: [0.05, 4], rotation: [-180, 180], translation: [-200, 200] }

const TEXTURE_TABS = {
  premade: ["texture", "textureVariant"],
  tileable: ["tileable", "tileableVariant", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "disableFontOverlay"],
  gradient: ["stops", "smooth", "gradientAngle", "disableFontOverlay"]
}

const TYPE_KEYS = {
  faces: ["fade", "outerFade"],
  inner: ["internalFaces", "fadeInternal", "internalFade"],
  sides: ["sideFaces", "fadeSides", "sideFade"]
}

function panelKeys(object, name) {
  if (name === "texture") return TEXTURE_TABS[object.textureSource]
  return Object.keys(PANELS[name]()).filter(key => key !== "text")
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
  for (const key of TYPE_KEYS[name] ?? []) object[key] = TYPES[object.type][key]
}

export function isModified(object, name, context = {}, keys = panelKeys(object, name)) {
  const probe = { type: object.type, textureSource: object.textureSource }
  resetPanel(probe, name, context)
  return keys.some(key => JSON.stringify(probe[key]) !== JSON.stringify(object[key]))
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

export const LAYER = { source: "premade", file: null, blend: "overlay", colour: "#ffffff", colourBlend: "multiply", opacity: 100 }

export function overlayLayer(overlay, definition) {
  return { ...LAYER, overlay, ...structuredClone(definition?.default ?? {}) }
}

export const OVERLAY_KINDS = {
  overlays: "overlayMode",
  edgeOverlays: "edgeOverlayMode"
}

export function textureEntry(list, object) {
  const entry = list.textures[object.texture]
  if (!entry) return null
  return object.textureVariant ? { ...entry, ...entry.variants?.[object.textureVariant] } : entry
}

export function defaultOverlays(list, object, kind) {
  if (!list || object.textureSource !== "premade") return []
  const merged = textureEntry(list, object)
  if (!merged) return []
  return (merged[kind] ?? []).map(layer => {
    if (!list[kind][layer.overlay]) throw new Error(`${object.textureVariant ?? object.texture} has ${kind === "overlays" ? `a default overlay "${layer.overlay}" that this font does not have` : `a default edge overlay "${layer.overlay}" that does not exist`}`)
    return { ...overlayLayer(layer.overlay, list[kind][layer.overlay]), ...structuredClone(layer) }
  })
}

export function activeOverlays(list, object, kind) {
  return object[OVERLAY_KINDS[kind]] === "custom" ? object[kind] : defaultOverlays(list, object, kind)
}

export function setTexture(object, values) {
  let changed = false
  for (const [key, value] of Object.entries(values)) {
    if (object[key] === value) continue
    object[key] = value
    changed = true
  }
  if (!changed) return
  object.overlayMode = "default"
  object.edgeOverlayMode = "default"
}

export function defaultTexture(list, type) {
  const id = type === "bottom" ? list.secondary : list.primary
  if (list.textures[id]) return id
  const keys = Object.keys(list.textures)
  return keys[1] ?? keys[0] ?? null
}

export function defaultSpacing(type, font) {
  return (font?.characterSpacing ?? 0) + TYPES[type].spacing
}

export function defaultDepth(font) {
  return font?.depth ?? PANELS.geometry().depth
}

export function defaultBorder(type, font) {
  return font?.border ?? TYPES[type].border
}

export function typeDefaults(type) {
  const object = { ...defaults(), type }
  applyType(object, type)
  return object
}

export function applyType(object, type, font) {
  object.stops = stops(type)
  for (const key of Object.values(TYPE_KEYS).flat()) object[key] = TYPES[type][key]
  object.border = defaultBorder(type, font)
  object.spacing = defaultSpacing(type, font)
}

export function snapshot(object) {
  const { id, ...values } = JSON.parse(JSON.stringify(object))
  return values
}

export function restore(object, values) {
  for (const key of KEYS) {
    if (key in values) object[key] = structuredClone(values[key])
  }
}
