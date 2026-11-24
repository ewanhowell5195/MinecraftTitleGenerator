import { cameraChanges } from "../settings/camera.js"
import { TILING_KEYS } from "../settings/defaults.js"
import { isSeparate } from "../settings/layers.js"
import { TEXTURE_TABS, isCustomFont } from "../settings/settings.js"
import { FILE_VERSION } from "../settings/upgrades.js"
import { CUSTOM_SHAPE, isMinecraftShape } from "../geometry/shapes.js"
import { titleLines, titleValues, trimmed } from "../link/titleLines.js"
import { matchSolved } from "./match.js"

const FORMAT = "minecraft-title"
export const EXTENSION = "mctitle"

function usesSource(object, matches) {
  const looks = isSeparate(object, "texture") ? [object].concat(object.layerSettings) : [object]
  return looks.some(look => matches(look.textureSource))
}

const UNUSED = Object.entries(TEXTURE_TABS).map(([source, keys]) => [object => object.textureSource !== source, keys.filter(key => !TILING_KEYS.includes(key))]).concat([
  [object => object.shape !== null, ["text", "spaceBefore", "terminators", "creeperFace", "font", "spacing", "kerning"]],
  [object => object.shape !== null && object.shape !== CUSTOM_SHAPE, ["customFont"]],
  [object => !isMinecraftShape(object.shape), ["shapeVersion", "blockState", "itemComponents"]],
  [object => object.textureSource !== "tileable" && !(object.textureSource === "custom" && object.customTextureMode === "tileable"), TILING_KEYS],
  [object => !isCustomFont(object.font) && object.shape !== CUSTOM_SHAPE, ["customFont"]],
  [object => object.tileableSource !== "minecraft", ["minecraftTexture", "minecraftVersion"]],
  [object => object.tileableSource === "minecraft", ["tileable", "tileableVariant"]],
  [object => !usesSource(object, source => source === "gradient"), ["arcGradient"]],
  [object => object.customTextureMode !== "cover", ["customCoverAlign", "customCoverX", "customCoverY", "customCoverSpan"]],
  [object => object.customCoverAlign !== "camera", ["customCoverSpan"]],
  [object => object.customTextureMode !== "strip", ["customStripPerCharacter"]],
  [object => !usesSource(object, source => source !== "premade"), ["disableFontOverlay"]],
  [object => object.matchWidth === null, ["matchBottom"]],
  [object => object.overlayMode !== "custom", ["overlays"]],
  [object => object.edgeOverlayMode !== "custom", ["edgeOverlays"]],
  [object => !object.fade, ["outerFade", "outerFadeOpacity"]],
  [object => !object.customEdge, ["edgeColour", "edgeFill", "edgeStops", "edgeSmooth", "edgeMix"]],
  [object => object.edgeFill !== "gradient", ["edgeStops", "edgeSmooth", "edgeMix"]],
  [object => !object.edgeSmooth, ["edgeMix"]],
  [object => object.edgeFill === "gradient", ["edgeColour"]],
  [object => !object.customBorder, ["borderColour"]],
  [object => !object.internalFaces, ["fadeInternal", "internalFade", "internalFadeOpacity", "customInternal", "internalColour", "internalBrightness", "internalFill", "internalStops", "internalSmooth", "internalMix", "internalDirection"]],
  [object => !object.fadeInternal, ["internalFade", "internalFadeOpacity"]],
  [object => !object.customInternal, ["internalColour", "internalFill", "internalStops", "internalSmooth", "internalMix", "internalDirection"]],
  [object => object.internalFill !== "gradient", ["internalStops", "internalSmooth", "internalMix", "internalDirection"]],
  [object => !object.internalSmooth, ["internalMix"]],
  [object => object.internalFill === "gradient", ["internalColour"]],
  [object => !object.sideFaces, ["fadeSides", "sideFade", "sideFadeOpacity", "customSide", "sideColour", "sideBrightness", "sideFill", "sideStops", "sideSmooth", "sideMix", "sideDirection"]],
  [object => !object.fadeSides, ["sideFade", "sideFadeOpacity"]],
  [object => !object.customSide, ["sideColour", "sideFill", "sideStops", "sideSmooth", "sideMix", "sideDirection"]],
  [object => object.sideFill !== "gradient", ["sideStops", "sideSmooth", "sideMix", "sideDirection"]],
  [object => !object.sideSmooth, ["sideMix"]],
  [object => !object.smooth, ["mix"]],
  [object => object.sideFill === "gradient", ["sideColour"]],
  [object => object.arcMode !== "move", ["arcMove"]],
  [object => object.arcMode === "move", ["arcTop", "arcBottom", "arcMarked"]],
  [object => object.wordArcMode !== "move", ["wordArcMove"]],
  [object => object.wordArcMode === "move", ["wordArcTop", "wordArcBottom", "wordArcMarked"]],
  [object => !object.twistRibbon, ["twistRibbonCentre", "twistRibbonMirror"]],
  [object => !object.twistDoor, ["twistDoorCentre", "twistDoorSame", "twistDoorRoll"]],
  [object => !object.twistDoor || !object.twistDoorRoll, ["twistDoorDepth"]],
  [object => !object.twistFan, ["twistFanCentre", "twistFanRoll"]],
  [object => !object.twistFan || !object.twistFanRoll, ["twistFanHeight"]],
  [object => !object.wordTwistRibbon, ["wordTwistRibbonCentre", "wordTwistRibbonMirror"]],
  [object => !object.wordTwistDoor, ["wordTwistDoorCentre", "wordTwistDoorSame", "wordTwistDoorRoll"]],
  [object => !object.wordTwistDoor || !object.wordTwistDoorRoll, ["wordTwistDoorDepth"]],
  [object => !object.wordTwistFan, ["wordTwistFanCentre", "wordTwistFanRoll"]],
  [object => !object.wordTwistFan || !object.wordTwistFanRoll, ["wordTwistFanHeight"]],
  [(object, title) => matchSolved(object, title), ["matchScale", "matchOffset"]],
  [object => object.matchWidth === null, ["matchScaleY"]]
])

export function trimUnused(object, title) {
  return trimmed(object, new Set(UNUSED.filter(([skip]) => skip(object, title)).flatMap(([, keys]) => keys)))
}

export function fileData(lines, titleCamera, values) {
  const camera = cameraChanges(titleCamera)
  return { format: FORMAT, version: FILE_VERSION, lines: titleLines(lines, values), ...(Object.keys(camera).length && { camera }) }
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function readTitle(text) {
  const data = parse(text)
  if (data?.format !== FORMAT) throw new Error("this isn't a Minecraft title file")
  return { values: titleValues(data), camera: data.camera, preset: data.preset }
}
