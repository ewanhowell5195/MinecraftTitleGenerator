
export const FILE_VERSION = 7
const OLD_WAVE = { level: 45, randomness: 60 }
export const DEFAULT_FONT = "minecraft-ten"

export const TYPES = {
  top: { name: "Top Text", creeperFace: true, clipHoles: true, depthAnchor: "back", stops: [["#FFCF76", 0], ["#DA371E", 100]], fade: false, outerFade: 0, internalFaces: false, fadeInternal: true, internalFade: 0, sideFaces: false, fadeSides: true, sideFade: 0, border: 2, spacing: 0 },
  bottom: { name: "Update Text", creeperFace: false, clipHoles: true, depthAnchor: "front", stops: [["#FFCF76", 0], ["#DA371E", 100]], fade: true, outerFade: 50, internalFaces: true, fadeInternal: true, internalFade: 75, sideFaces: false, fadeSides: true, sideFade: 75, border: 2, spacing: 0 },
  small: { name: "Edition Text", creeperFace: false, clipHoles: false, depthAnchor: "middle", stops: [["#E0E0E0", 0], ["#8A8A8A", 100]], fade: false, outerFade: 0, internalFaces: true, fadeInternal: false, internalFade: 75, sideFaces: true, fadeSides: false, sideFade: 75, border: 3, spacing: 2 }
}

const BLENDS = {
  "source-over": "Normal",
  overlay: "Overlay",
  "soft-light": "Soft Light",
  multiply: "Multiply",
  screen: "Screen",
  lighter: "Add",
  color: "Colour",
  hue: "Hue",
  saturation: "Saturation",
  difference: "Difference"
}

export const BLEND_OPTIONS = Object.entries(BLENDS).map(([value, label]) => ({ value, label }))

export function faceStops() {
  return [{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }]
}

function stops(type) {
  return TYPES[type].stops.map(([colour, position]) => ({ colour, position }))
}

function tiling() {
  return {
    tileableScale: 2,
    tileableXOffset: 0,
    tileableYOffset: 0,
    tileableRandomRotations: false,
    tileableRandomMirroring: false,
    tileableTileEdges: false,
    tileablePerCharacter: false
  }
}

const PANELS = {
  text: () => ({
    text: "Minecraft",
    spaceBefore: true
  }),
  terminators: () => ({
    terminators: false
  }),
  creeper: () => ({
    creeperFace: true
  }),
  font: () => ({
    font: DEFAULT_FONT,
    customFont: null
  }),
  shape: () => ({
    shape: null,
    shapeVersion: null,
    blockState: null,
    itemComponents: null
  }),
  placement: () => ({
    type: "top",
    row: 0,
    rowSpacing: 0
  }),
  geometry: () => ({
    depth: 22,
    depthAnchor: "back",
    border: 2,
    clipHoles: true,
    layerWords: false
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
    arcCentre: 50,
    arcMarked: true,
    arcGradient: false
  }),
  twist: () => ({
    twistRibbon: 0,
    twistRibbonCentre: 50,
    twistRibbonMirror: false,
    twistDoor: 0,
    twistDoorCentre: 50,
    twistDoorSame: false,
    twistDoorRoll: true
  }),
  transform: () => ({
    matchWidth: null,
    matchBottom: false,
    matchScaleY: false,
    matchScale: 1,
    matchOffset: 0,
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
    wordArcCentre: 50,
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
    tileable: "checkerboard",
    tileableVariant: null,
    tileableSource: "premade",
    minecraftTexture: "cobblestone",
    minecraftVersion: null,
    customTexture: null,
    customTextureMode: "standard",
    stops: stops("top"),
    smooth: true,
    gradientAngle: 0,
    ...tiling()
  }),
  tiling,
  overlays: () => ({
    overlayMode: "default",
    overlays: [],
    disableFontOverlay: false
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
    internalBrightness: 35,
    internalFill: "solid",
    internalStops: faceStops(),
    internalSmooth: true,
    internalDirection: "up"
  }),
  sides: () => ({
    sideFaces: false,
    fadeSides: true,
    sideFade: 75,
    customSide: false,
    sideColour: "#000000",
    sideBrightness: 35,
    sideFill: "solid",
    sideStops: faceStops(),
    sideSmooth: true,
    sideDirection: "up"
  }),
  layers: () => ({
    separateTexture: false,
    separateColour: false,
    separateOverlays: false,
    layerSettings: []
  }),
  faces: () => ({
    fade: false,
    outerFade: 50,
    customEdge: false,
    edgeColour: "#000000",
    edgeBrightness: 35,
    edgeFill: "solid",
    edgeStops: faceStops(),
    edgeSmooth: true
  })
}

export const LINE = new Set(["font", "customFont", "terminators", "type", "row", "rowSpacing", "depth", "depthAnchor", "border", "clipHoles", "layerWords", "spacing", "kerning", "arcMode", "arcTop", "arcBottom", "arcMove", "arcCentre", "arcMarked", "twistRibbon", "twistRibbonCentre", "twistRibbonMirror", "twistDoor", "twistDoorCentre", "twistDoorSame", "twistDoorRoll"].concat(Object.keys(PANELS.transform())))

export const LAYER_GROUPS = {
  texture: Object.keys(PANELS.texture()),
  overlays: Object.keys(PANELS.overlays()).concat(Object.keys(PANELS.edgeOverlays())),
  colour: Object.keys(PANELS.colour()).concat(Object.keys(PANELS.outline()), Object.keys(PANELS.faces()), Object.keys(PANELS.inner()), Object.keys(PANELS.sides()))
}

export const SEPARATE_KEYS = { texture: "separateTexture", overlays: "separateOverlays", colour: "separateColour" }

export const LAYER_KEYS = Object.values(LAYER_GROUPS).flat()

export function copied(value) {
  if (ArrayBuffer.isView(value)) return value.slice()
  if (Array.isArray(value)) return value.map(copied)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copied(item)]))
  return value
}

export function layerValues(object) {
  return Object.fromEntries(LAYER_KEYS.map(key => [key, copied(object[key])]))
}

export function isSeparate(object, group) {
  return !!object?.[SEPARATE_KEYS[group]]
}

function separatedKeys(object, group = null) {
  const groups = group ? [group] : Object.keys(LAYER_GROUPS)
  return new Set(groups.filter(name => isSeparate(object, name)).flatMap(name => LAYER_GROUPS[name]))
}

const VIEWED = Symbol("viewed")

function viewed(object) {
  return object[VIEWED] ?? object
}

export function layerView(object, layer, group = null) {
  const keys = separatedKeys(object, group)
  const settings = layer && keys.size ? object.layerSettings[layer - 1] : null
  if (!settings) return object
  return new Proxy(object, {
    get: (target, key) => key === VIEWED ? target : keys.has(key) ? target.layerSettings[layer - 1][key] : target[key],
    set: (target, key, value) => {
      if (keys.has(key)) target.layerSettings[layer - 1][key] = value
      else target[key] = value
      return true
    }
  })
}

export function overlayFits(data, layer, used) {
  if (layer === null) return !data.layered || used.length > 1
  return (!data.layered || used.some(other => other < layer)) && (!data.layers || data.layers.includes(layer))
}

export function separateLayers(object, group, on, count, fits = null) {
  const keys = LAYER_GROUPS[group]
  const kept = (value, key, layer) => fits && key === "overlays" && Array.isArray(value) ? value.filter(item => fits(layer, item)) : value
  if (on) {
    object.layerSettings = Array.from({ length: count - 1 }, (_, index) => ({ ...object.layerSettings[index], ...Object.fromEntries(keys.map(key => [key, kept(copied(object[key]), key, index + 1)])) }))
    for (const key of keys) object[key] = kept(object[key], key, 0)
  } else object.layerSettings = object.layerSettings.map(layer => Object.fromEntries(Object.entries(layer).filter(([key]) => !keys.includes(key))))
  object[SEPARATE_KEYS[group]] = on
  if (!Object.keys(LAYER_GROUPS).some(name => isSeparate(object, name))) object.layerSettings = []
}

export function layerTarget(object, layer) {
  const own = layer ? object.layerSettings?.[layer - 1] : null
  if (!own) return object
  return { ...object, ...Object.fromEntries(Array.from(separatedKeys(object)).filter(key => key in own).map(key => [key, own[key]])) }
}

export function objectDefaults() {
  return Object.assign({ hidden: false, group: null }, ...Object.values(PANELS).map(panel => panel()))
}

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

export const TILING_KEYS = Object.keys(tiling())

export const TEXTURE_TABS = {
  premade: ["texture", "textureVariant"],
  tileable: ["tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion"].concat(TILING_KEYS),
  gradient: ["stops", "smooth", "gradientAngle"],
  custom: ["customTexture", "customTextureMode"]
}

const TYPE_KEYS = {
  creeper: ["creeperFace"],
  geometry: ["clipHoles", "depthAnchor"],
  faces: ["fade", "outerFade"],
  inner: ["internalFaces", "fadeInternal", "internalFade"],
  sides: ["sideFaces", "fadeSides", "sideFade"]
}

const TYPED_KEYS = Object.values(TYPE_KEYS).flat()
const FACE_KEYS = TYPE_KEYS.inner.concat(TYPE_KEYS.sides)
const ALL_FACES = { internalFaces: true, sideFaces: true }
const UNFADED_FACES = { fadeInternal: false, fadeSides: false }

function typed(type, font) {
  return { ...TYPES[type], ...(font?.allFaces && ALL_FACES), ...(font?.allFaces && font.allFaces !== "fade" && UNFADED_FACES) }
}

export function fontFaces(type, font) {
  const values = typed(type, font)
  return Object.fromEntries(FACE_KEYS.map(key => [key, values[key]]))
}

export function applyFontFaces(object, faces) {
  const base = viewed(object)
  const layers = isSeparate(base, "colour") ? base.layerSettings.length + 1 : 1
  for (let layer = 0; layer < layers; layer++) Object.assign(layerView(base, layer, "colour"), faces)
}

function panelKeys(object, name) {
  if (name === "texture") return TEXTURE_TABS[object.textureSource]
  if (name === "overlays" && object.textureSource === "premade") return ["overlayMode", "overlays"]
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
  for (const key of TYPE_KEYS[name] ?? []) object[key] = typed(object.type, context.font)[key]
  if (FACE_PANELS.includes(name)) Object.assign(object, textureFaces(context.list, object, name, context.layer ?? 0))
}

export function sameValue(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
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
export const CUSTOM_FONT_KINDS = ["json", "ascii", "outline", "silhouette"]

export function isCustomFont(id) {
  return typeof id === "string" && id.startsWith(CUSTOM_FONT)
}

export const LAYER = { source: "premade", file: null, blend: "overlay", colours: null, tint: null, tintBlend: "multiply", opacity: 100 }

export function overlayLayer(overlay, definition) {
  return { ...LAYER, overlay, ...structuredClone(definition?.default ?? {}) }
}

export const OVERLAY_KINDS = {
  overlays: "overlayMode",
  edgeOverlays: "edgeOverlayMode"
}

export const LAYERS = Object.keys(OVERLAY_KINDS)

export function textureEntry(list, object) {
  const entry = list.textures[object.texture]
  if (!entry) return null
  return object.textureVariant ? { ...entry, ...entry.variants?.[object.textureVariant] } : entry
}

export const FACE_PANELS = ["faces", "inner", "sides"]

export const TEXTURE_DEFAULTS = LAYERS.concat(FACE_PANELS)

export function perLayerDefault(value, key) {
  if (!Array.isArray(value)) return false
  return LAYERS.includes(key) ? value.length > 0 && value.every(Array.isArray) : true
}

export function layerDefault(value, key, layer = 0) {
  return perLayerDefault(value, key) ? value[layer] : value
}

function textureDefault(list, object, key, layer) {
  if (!list || object.textureSource !== "premade") return undefined
  return layerDefault(textureEntry(list, object)?.[key], key, layer)
}

function defaultsLayers(list, object) {
  const merged = list && object.textureSource === "premade" ? textureEntry(list, object) : null
  return Math.max(1, ...TEXTURE_DEFAULTS.map(key => perLayerDefault(merged?.[key], key) ? merged[key].length : 1))
}

export function defaultOverlays(list, object, kind, layer = 0) {
  return (textureDefault(list, object, kind, layer) ?? []).map(entry => {
    if (!list[kind][entry.overlay]) throw new Error(`${object.textureVariant ?? object.texture} has ${kind === "overlays" ? `a default overlay "${entry.overlay}" that this font does not have` : `a default edge overlay "${entry.overlay}" that does not exist`}`)
    return { ...overlayLayer(entry.overlay, list[kind][entry.overlay]), ...structuredClone(entry) }
  })
}

export function activeOverlays(list, object, kind, layer = 0) {
  return object[OVERLAY_KINDS[kind]] === "custom" ? object[kind] : defaultOverlays(list, object, kind, layer)
}

export const FACE_COLOURS = {
  faces: { custom: "customEdge", colour: "edgeColour" },
  inner: { custom: "customInternal", colour: "internalColour" },
  sides: { custom: "customSide", colour: "sideColour" }
}

export function textureFaces(list, object, name, layer = 0) {
  const colour = textureDefault(list, object, name, layer)
  if (colour == null) return {}
  if (typeof colour !== "string" || !/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`${object.textureVariant ?? object.texture} gives ${name} the colour ${JSON.stringify(colour)}, which isn't a #rrggbb colour`)
  const { custom, colour: key } = FACE_COLOURS[name]
  return { [custom]: true, [key]: colour }
}

export function untouchedTileable(object) {
  const values = PANELS.texture()
  return ["tileable", "tileableVariant", "tileableSource", "minecraftVersion"].every(key => object[key] === values[key])
}

function textureDefaults(list, object, count) {
  return Array.from({ length: count }, (_, layer) => {
    const target = layerTarget(object, layer)
    return {
      overlays: Object.fromEntries(LAYERS.map(kind => [kind, defaultOverlays(list, target, kind, layer)])),
      faces: Object.fromEntries(FACE_PANELS.map(name => [name, textureFaces(list, target, name, layer)]))
    }
  })
}

export function separateForDefaults(object, list, layers = defaultsLayers(list, object)) {
  const merged = list && object.textureSource === "premade" ? textureEntry(list, object) : null
  const base = viewed(object)
  for (const group of ["overlays", "colour"]) {
    const keys = group === "overlays" ? LAYERS : FACE_PANELS
    if (!isSeparate(base, group) && keys.some(key => perLayerDefault(merged?.[key], key))) separateLayers(base, group, true, layers)
  }
}

export function setTexture(object, values, { before = null, after = before } = {}) {
  const base = viewed(object)
  const count = Math.max(base.layerSettings?.length ?? 0, defaultsLayers(before, object) - 1) + 1
  const old = textureDefaults(before, base, count)
  let changed = false
  for (const [key, value] of Object.entries(values)) {
    if (object[key] === value) continue
    object[key] = value
    changed = true
  }
  if (!changed) return
  if (!after) {
    for (const kind of LAYERS) object[OVERLAY_KINDS[kind]] = "default"
    return
  }
  const layers = Math.max(count, defaultsLayers(after, object))
  separateForDefaults(object, after, layers)
  const fresh = textureDefaults(after, base, layers)
  if (isSeparate(base, "texture")) {
    if (!isSeparate(base, "overlays")) separateLayers(base, "overlays", true, layers)
    const faces = old.concat(fresh).some(defaults => FACE_PANELS.some(name => Object.keys(defaults.faces[name]).length))
    if (faces && !isSeparate(base, "colour")) separateLayers(base, "colour", true, layers)
  }
  for (let layer = 0; layer < layers; layer++) {
    const overlays = layerView(base, isSeparate(base, "overlays") ? layer : 0, "overlays")
    for (const kind of LAYERS) {
      if (!before || !sameValue(old[layer]?.overlays[kind] ?? [], fresh[layer].overlays[kind])) overlays[OVERLAY_KINDS[kind]] = "default"
    }
    if (layer && !isSeparate(base, "colour")) continue
    const colours = layerView(base, layer, "colour")
    for (const name of FACE_PANELS) {
      const now = fresh[layer].faces[name]
      if (before && sameValue(old[layer]?.faces[name] ?? {}, now)) continue
      const values = { ...PANELS[name](), ...now }
      for (const key of Object.keys(values)) if (!TYPED_KEYS.includes(key)) colours[key] = structuredClone(values[key])
    }
  }
}

export function defaultTexture(list, type) {
  for (const id of [type === "bottom" ? list.secondary : null, list.primary, "flat"]) if (id && list.textures[id]) return id
  return Object.keys(list.textures)[0] ?? null
}

export function pinnedTextures(list) {
  return ["flat", defaultTexture(list, "top"), defaultTexture(list, "bottom")]
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
  const object = { ...objectDefaults(), type }
  applyType(object, type)
  return object
}

export function applyType(object, type, font) {
  object.stops = stops(type)
  const values = typed(type, font)
  for (const key of TYPED_KEYS) object[key] = values[key]
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

function restartTilesPerCharacter(entry) {
  return entry.textureSource === "tileable" ? { tileablePerCharacter: true, ...entry } : entry
}

function restartLineTiles(line) {
  const restarted = restartTilesPerCharacter(line)
  return Array.isArray(line.words) ? { ...restarted, words: line.words.map(restartTilesPerCharacter) } : restarted
}

function separateMatchScale(line) {
  if (line.matchWidth === undefined || line.matchWidth === null) return line
  const { scaleX, linkScale, ...upgraded } = line
  if (scaleX !== undefined) upgraded.matchScale = scaleX
  if (linkScale === undefined || linkScale === null) return upgraded
  return { ...upgraded, matchScaleY: true, scaleY: linkScale }
}

function widenBlockSerif(line) {
  if (line.font !== "block-serif") return line
  return { ...line, spacing: (line.spacing ?? typeDefaults(line.type ?? "top").spacing) + 2 }
}

function anchorDepthAtFront(line) {
  if ((line.type ?? "top") === "bottom" || "depthAnchor" in line) return line
  const deepened = "depth" in line || "wordDepth" in line || Array.isArray(line.words) && line.words.some(word => "wordDepth" in word)
  return deepened ? { ...line, depthAnchor: "front" } : line
}

function turnDoorsInPlace(line) {
  return line.twistDoor && !("twistDoorRoll" in line) ? { ...line, twistDoorRoll: false } : line
}

function oldWave(layer) {
  if (layer.overlay === "wave") return { randomness: OLD_WAVE.randomness, ...layer }
  if (layer.overlay === "wave_inverted") return { randomness: OLD_WAVE.randomness, ...layer, overlay: "wave", angle: 180, level: 100 - (layer.level ?? OLD_WAVE.level) }
  return layer
}

function turnInvertedWaves(value) {
  if (Array.isArray(value)) return value.map(turnInvertedWaves)
  if (!value || typeof value !== "object") return value
  return oldWave(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, turnInvertedWaves(item)])))
}

const UPGRADES = [[2, restartLineTiles], [3, separateMatchScale], [4, widenBlockSerif], [5, anchorDepthAtFront], [6, turnDoorsInPlace], [7, turnInvertedWaves]]

export function upgradeLine(line, version) {
  return UPGRADES.reduce((upgraded, [to, upgrade]) => version < to ? upgrade(upgraded) : upgraded, line)
}
