import { ref } from "vue"
import { matchSolved } from "./match.js"
import { lines, runtime, scene, titleFileName, titleObjects, validSelection } from "./scene.js"
import { FILE_VERSION, TEXTURE_TABS, TILING_KEYS, createObject, defaultBorder, defaultDepth, defaultSpacing, defaultTexture, fontFaces, isCustomFont, sameValue, typeDefaults } from "./settings.js"
import { CUSTOM_SHAPE, isMinecraftShape } from "./shapes.js"
import { submitStats } from "./stats.js"
import { titleLines, titleValues, trimmed } from "./titleFacts.js"
import { downloadBlob } from "./ui.js"

const FORMAT = "minecraft-title"
export const EXTENSION = "mctitle"

const UNUSED = Object.entries(TEXTURE_TABS).map(([source, keys]) => [object => object.textureSource !== source, keys.filter(key => !TILING_KEYS.includes(key))]).concat([
  [object => object.shape !== null, ["text", "spaceBefore", "terminators", "creeperFace", "font", "spacing", "kerning"]],
  [object => object.shape !== null && object.shape !== CUSTOM_SHAPE, ["customFont"]],
  [object => !isMinecraftShape(object.shape), ["shapeVersion", "blockState", "itemComponents"]],
  [object => object.textureSource !== "tileable" && !(object.textureSource === "custom" && object.customTextureMode === "tileable"), TILING_KEYS],
  [object => !isCustomFont(object.font) && object.shape !== CUSTOM_SHAPE, ["customFont"]],
  [object => object.tileableSource !== "minecraft", ["minecraftTexture", "minecraftVersion"]],
  [object => object.tileableSource === "minecraft", ["tileable", "tileableVariant"]],
  [object => object.textureSource !== "gradient", ["arcGradient"]],
  [object => object.textureSource === "premade", ["disableFontOverlay"]],
  [object => object.matchWidth === null, ["matchBottom"]],
  [object => object.overlayMode !== "custom", ["overlays"]],
  [object => object.edgeOverlayMode !== "custom", ["edgeOverlays"]],
  [object => !object.fade, ["outerFade"]],
  [object => !object.customEdge, ["edgeColour", "edgeFill", "edgeStops", "edgeSmooth"]],
  [object => object.edgeFill !== "gradient", ["edgeStops", "edgeSmooth"]],
  [object => object.edgeFill === "gradient", ["edgeColour"]],
  [object => !object.customBorder, ["borderColour"]],
  [object => !object.internalFaces, ["fadeInternal", "internalFade", "customInternal", "internalColour", "internalBrightness", "internalFill", "internalStops", "internalSmooth", "internalDirection"]],
  [object => !object.fadeInternal, ["internalFade"]],
  [object => !object.customInternal, ["internalColour", "internalFill", "internalStops", "internalSmooth", "internalDirection"]],
  [object => object.internalFill !== "gradient", ["internalStops", "internalSmooth", "internalDirection"]],
  [object => object.internalFill === "gradient", ["internalColour"]],
  [object => !object.sideFaces, ["fadeSides", "sideFade", "customSide", "sideColour", "sideBrightness", "sideFill", "sideStops", "sideSmooth", "sideDirection"]],
  [object => !object.fadeSides, ["sideFade"]],
  [object => !object.customSide, ["sideColour", "sideFill", "sideStops", "sideSmooth", "sideDirection"]],
  [object => object.sideFill !== "gradient", ["sideStops", "sideSmooth", "sideDirection"]],
  [object => object.sideFill === "gradient", ["sideColour"]],
  [object => object.arcMode !== "move", ["arcMove"]],
  [object => object.arcMode === "move", ["arcTop", "arcBottom", "arcMarked"]],
  [object => object.wordArcMode !== "move", ["wordArcMove"]],
  [object => object.wordArcMode === "move", ["wordArcTop", "wordArcBottom", "wordArcMarked"]],
  [object => !object.twistRibbon, ["twistRibbonCentre", "twistRibbonMirror"]],
  [object => !object.twistDoor, ["twistDoorCentre", "twistDoorSame", "twistDoorRoll"]],
  [object => matchSolved(object), ["matchScale", "matchOffset"]],
  [object => object.matchWidth === null, ["matchScaleY"]]
])

export const fileError = ref(null)

function trim(object) {
  return trimmed(object, new Set(UNUSED.filter(([skip]) => skip(object)).flatMap(([, keys]) => keys)))
}

export function titleData() {
  return { format: FORMAT, version: FILE_VERSION, lines: titleLines(lines(), trim) }
}

export function saveTitle() {
  if (!scene.objects.length) return
  submitStats()
  downloadBlob(`${titleFileName()}.${EXTENSION}`, new Blob([JSON.stringify(titleData(), null, 2)], { type: "application/json" }))
  fileError.value = null
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readTitle(text) {
  const data = parse(text)
  if (data?.format !== FORMAT) throw new Error("this isn't a Minecraft title file")
  return titleValues(data)
}

export function isDefaultTitle() {
  if (scene.objects.length !== 1) return false
  const object = scene.objects[0]
  const { list, font } = runtime[object.id] ?? {}
  if (!list || !font) return false
  const reference = { ...typeDefaults("top"), texture: defaultTexture(list, "top"), spacing: defaultSpacing("top", font), depth: defaultDepth(font), border: defaultBorder("top", font), ...fontFaces("top", font) }
  return sameValue(trim(object), trim(reference))
}

function showObjects(objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
  fileError.value = null
}

export function resetTitle() {
  showObjects([createObject()])
}

export function readTitleObjects(data) {
  return titleObjects(titleValues(data))
}

export function openTitleData(data) {
  showObjects(readTitleObjects(data))
}

export async function openTitle(file, allow = () => true) {
  try {
    const values = readTitle(await file.text())
    if (!allow()) return
    showObjects(titleObjects(values))
  } catch (err) {
    fileError.value = `Couldn't open ${file.name}: ${err.message}`
  }
}
