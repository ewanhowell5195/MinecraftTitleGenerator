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

export function stops(type) {
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

export const PANELS = {
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

export function objectDefaults() {
  return Object.assign({ hidden: false, group: null }, ...Object.values(PANELS).map(panel => panel()))
}

export const TILING_KEYS = Object.keys(tiling())

export const TYPE_KEYS = {
  creeper: ["creeperFace"],
  geometry: ["clipHoles", "depthAnchor"],
  faces: ["fade", "outerFade"],
  inner: ["internalFaces", "fadeInternal", "internalFade"],
  sides: ["sideFaces", "fadeSides", "sideFade"]
}

export const TYPED_KEYS = Object.values(TYPE_KEYS).flat()
const FACE_KEYS = TYPE_KEYS.inner.concat(TYPE_KEYS.sides)
const ALL_FACES = { internalFaces: true, sideFaces: true }
const UNFADED_FACES = { fadeInternal: false, fadeSides: false }

export function typed(type, font) {
  return { ...TYPES[type], ...(font?.allFaces && ALL_FACES), ...(font?.allFaces && font.allFaces !== "fade" && UNFADED_FACES) }
}

export function fontFaces(type, font) {
  const values = typed(type, font)
  return Object.fromEntries(FACE_KEYS.map(key => [key, values[key]]))
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
