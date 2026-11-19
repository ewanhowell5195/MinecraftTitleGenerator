import { fontTextures } from "../texture/assets.js"
import { cameraChanges, setCamera } from "../settings/camera.js"
import { TILING_KEYS, defaultBorder, defaultDepth, defaultSpacing, fontFaces, typeDefaults } from "../settings/defaults.js"
import { loadFont, loadFontList } from "../font/font.js"
import { matchSolved } from "./match.js"
import { fileError } from "./notices.js"
import { createObject } from "../settings/objects.js"
import { lines, presetSource, runtime, scene, titleFileName, titleObjects, validSelection } from "./scene.js"
import { TEXTURE_TABS, isCustomFont } from "../settings/settings.js"
import { defaultTexture } from "../settings/textureDefaults.js"
import { sameValue } from "../core/values.js"
import { CUSTOM_SHAPE, isMinecraftShape } from "../geometry/shapes.js"
import { submitStats } from "./stats.js"
import { titleLines, titleValues, trimmed } from "../link/titleLines.js"
import { downloadBlob } from "../core/files.js"
import { FILE_VERSION } from "../settings/upgrades.js"
import { resetTabs, titleLoads } from "./view.js"

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
  [object => object.customTextureMode !== "cover", ["customCoverAlign", "customCoverX", "customCoverY", "customCoverSpan"]],
  [object => object.customCoverAlign !== "camera", ["customCoverSpan"]],
  [object => object.customTextureMode !== "strip", ["customStripPerCharacter"]],
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


function trim(object) {
  return trimmed(object, new Set(UNUSED.filter(([skip]) => skip(object)).flatMap(([, keys]) => keys)))
}

function sameSettings(a, b) {
  return Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).every(key => sameValue(a[key], b[key]))
}

export function titleData() {
  const camera = cameraChanges(scene.camera)
  return { format: FORMAT, version: FILE_VERSION, lines: titleLines(lines(), trim), ...(Object.keys(camera).length && { camera }) }
}

export function saveTitle() {
  if (!scene.objects.length) return
  submitStats()
  const data = { ...titleData(), ...(scene.preset && { preset: scene.preset }) }
  downloadBlob(`${titleFileName()}.${EXTENSION}`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
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
  return { values: titleValues(data), camera: data.camera, preset: presetSource(data.preset) }
}

function titleReference(list, font) {
  return { ...typeDefaults("top"), texture: defaultTexture(list, "top"), spacing: defaultSpacing("top", font), depth: defaultDepth(font), border: defaultBorder("top", font), ...fontFaces("top", font) }
}

function defaultCamera() {
  return !Object.keys(cameraChanges(scene.camera)).length
}

export function isDefaultTitle() {
  if (scene.objects.length !== 1 || !defaultCamera()) return false
  const object = scene.objects[0]
  const { list, font } = runtime[object.id] ?? {}
  if (!list || !font) return false
  return sameSettings(trim(object), trim(titleReference(list, font)))
}

export async function untouchedTitle() {
  if (scene.objects.length !== 1 || !defaultCamera()) return false
  if (isDefaultTitle()) return true
  const object = scene.objects[0]
  if (object.shape !== null || isCustomFont(object.font)) return false
  const fonts = await loadFontList()
  const entry = fonts.find(item => item.id === object.font)
  if (!entry) return false
  const font = await loadFont(entry, fonts)
  return sameSettings(trim(object), trim(titleReference(await fontTextures(font.sheetFolder, font.strips), font)))
}

function showObjects(objects, camera, preset = null) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  setCamera(scene.camera, camera)
  scene.preset = preset
  Object.assign(scene, validSelection(objects, null, null))
  fileError.value = null
  titleLoads.value++
}

export function resetTitle() {
  resetTabs()
  showObjects([createObject()])
}

export function readTitleObjects(data) {
  return titleObjects(titleValues(data))
}

export function openTitleData(data) {
  showObjects(readTitleObjects(data), data.camera)
}

export async function openTitle(file, allow = () => true) {
  try {
    const { values, camera, preset } = readTitle(await file.text())
    if (!await allow()) return
    showObjects(titleObjects(values), camera, preset)
  } catch (err) {
    fileError.value = `Couldn't open ${file.name}: ${err.message}`
  }
}
