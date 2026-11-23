import { typeDefaults } from "../settings/defaults.js"
import { ID_CHARACTERS, fitsSet, isColour, readColour, readId, readNumber, readText, readVarint, writeColour, writeId, writeNumber, writeText, writeVarint } from "./linkBytes.js"
import { LAYERS } from "../settings/textureDefaults.js"
import { googleFontSource, isGoogleFont } from "../font/googleFonts.js"

function isStop(stop) {
  return stop !== null && typeof stop === "object" && Object.keys(stop).length === 2 && isColour(stop.colour) && Number.isFinite(stop.position)
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function renamed(value, names) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [names.get(key) ?? key, item]))
}

function writeObject(out, value) {
  const entries = Object.entries(value)
  writeVarint(out, entries.length)
  for (const [key, item] of entries) writeEntry(out, key, item)
}

function readObject(reader) {
  const entries = []
  for (let count = readVarint(reader); count > 0; count--) entries.push(readEntry(reader))
  return Object.fromEntries(entries)
}

function list(fits, write, read) {
  return {
    fits: value => Array.isArray(value) && value.every(fits),
    write(out, value) {
      writeVarint(out, value.length)
      for (const item of value) write(out, item)
    },
    read(reader) {
      const items = []
      for (let count = readVarint(reader); count > 0; count--) items.push(read(reader))
      return items
    }
  }
}

function choice(...options) {
  return {
    fits: value => options.includes(value),
    write: (out, value) => writeVarint(out, options.indexOf(value)),
    read(reader) {
      const index = readVarint(reader)
      if (index >= options.length) throw new Error("the link has a value this version does not know")
      return options[index]
    }
  }
}

const BOOLEAN = { fits: value => typeof value === "boolean" }
const TEXT = { fits: value => typeof value === "string", write: writeText, read: readText }
const ID = { fits: value => typeof value === "string" && fitsSet(Array.from(value), ID_CHARACTERS), opens: value => typeof value === "string", write: writeId, read: readId }
const NUMBER = { fits: Number.isFinite, write: writeNumber, read: readNumber }
const COLOUR = { fits: isColour, write: writeColour, read: readColour }
const OBJECTS = list(isObject, writeObject, readObject)
const STATE = {
  fits: value => isObject(value) && Object.entries(value).every(entry => entry.every(part => ID.fits(part))),
  write(out, value) {
    const entries = Object.entries(value)
    writeVarint(out, entries.length)
    for (const [name, item] of entries) {
      writeId(out, name)
      writeId(out, item)
    }
  },
  read(reader) {
    const entries = []
    for (let count = readVarint(reader); count > 0; count--) entries.push([readId(reader), readId(reader)])
    return Object.fromEntries(entries)
  }
}
const GOOGLE_FONT = {
  fits: isGoogleFont,
  write(out, value) {
    writeText(out, value.google)
    writeText(out, value.style)
  },
  read: reader => googleFontSource(readText(reader), readText(reader))
}
const COMPONENTS = { fits: isObject, write: (out, value) => writeText(out, JSON.stringify(value)), read: reader => JSON.parse(readText(reader)) }
const OVERLAY_KEYS = new Map([["fade", "overlayFade"]])
const OVERLAY_NAMES = new Map(Array.from(OVERLAY_KEYS, ([name, key]) => [key, name]))
const OVERLAYS = list(isObject, (out, value) => writeObject(out, renamed(value, OVERLAY_KEYS)), reader => renamed(readObject(reader), OVERLAY_NAMES))
const STOPS = list(isStop, (out, { colour, position }) => {
  writeColour(out, colour)
  writeNumber(out, position)
}, reader => ({ colour: readColour(reader), position: readNumber(reader) }))
const BLEND = choice("multiply", "color", "lighter", "screen", "overlay", "soft-light", "hue", "saturation", "difference", "source-over")
const ARC_MODE = choice("stretch", "move")
const TWIST_ANCHOR = choice("centre", "left", "right")
const OVERLAY_MODE = choice("default", "custom")
const FACE_FILL = choice("solid", "gradient")
const FACE_DIRECTION = choice("up", "along")
const GRADIENT_MIX = choice("oklab", "short", "long", "vivid")

// Links store keys and options by position, so only ever add to the end of these lists.
const KEYS = [
  ["text", TEXT],
  ["texture", ID],
  ["overlay", ID],
  ["colour", COLOUR],
  ["spaceBefore", BOOLEAN],
  ["blend", BLEND],
  ["overlayMode", OVERLAY_MODE],
  ["opacity", NUMBER],
  ["overlays", OVERLAYS],
  ["font", ID],
  ["type", choice("top", "bottom", "small")],
  ["depth", NUMBER],
  ["internalFaces", BOOLEAN],
  ["textureSource", choice("premade", "tileable", "gradient")],
  ["border", NUMBER],
  ["translateY", NUMBER],
  ["sideFaces", BOOLEAN],
  ["textureVariant", ID],
  ["colourBlend", BLEND],
  ["customEdge", BOOLEAN],
  ["words", OBJECTS],
  ["seed", NUMBER],
  ["randomness", NUMBER],
  ["hue", NUMBER],
  ["edgeColour", COLOUR],
  ["stops", STOPS],
  ["edgeOverlayMode", OVERLAY_MODE],
  ["scaleX", NUMBER],
  ["scaleY", NUMBER],
  ["spacing", NUMBER],
  ["internalBrightness", NUMBER],
  ["customInternal", BOOLEAN],
  ["edgeOverlays", OVERLAYS],
  ["scaleZ", NUMBER],
  ["sideBrightness", NUMBER],
  ["wordTranslateX", NUMBER],
  ["row", NUMBER],
  ["internalColour", COLOUR],
  ["saturation", NUMBER],
  ["colourOpacity", NUMBER],
  ["contrast", NUMBER],
  ["spread", NUMBER],
  ["gap", NUMBER],
  ["width", NUMBER],
  ["amplitude", NUMBER],
  ["angle", NUMBER],
  ["length", NUMBER],
  ["level", NUMBER],
  ["offset", NUMBER],
  ["customBorder", BOOLEAN],
  ["linkScale", NUMBER],
  ["wordScaleY", NUMBER],
  ["thickness", NUMBER],
  ["matchWidth", NUMBER],
  ["customSide", BOOLEAN],
  ["sideColour", COLOUR],
  ["creeperFace", BOOLEAN],
  ["translateZ", NUMBER],
  ["arcBottom", NUMBER],
  ["borderColour", COLOUR],
  ["translateX", NUMBER],
  ["arcTop", NUMBER],
  ["outerFade", NUMBER],
  ["wordScaleX", NUMBER],
  ["brightness", NUMBER],
  ["arcGradient", BOOLEAN],
  ["wordDepth", NUMBER],
  ["wordRotationZ", NUMBER],
  ["wordTranslateZ", NUMBER],
  ["rotationX", NUMBER],
  ["fadeInternal", BOOLEAN],
  ["fadeSides", BOOLEAN],
  ["wordRotationY", NUMBER],
  ["edgeBrightness", NUMBER],
  ["gradientAngle", NUMBER],
  ["internalFade", NUMBER],
  ["terminators", BOOLEAN],
  ["scaleMarked", BOOLEAN],
  ["wordScaleOutline", BOOLEAN],
  ["wordRotationX", NUMBER],
  ["wordTranslateY", NUMBER],
  ["edgeFill", FACE_FILL],
  ["edgeStops", STOPS],
  ["internalFill", FACE_FILL],
  ["internalStops", STOPS],
  ["clipHoles", BOOLEAN],
  ["tileableSource", choice("premade", "minecraft")],
  ["minecraftTexture", ID],
  ["minecraftVersion", ID],
  ["smooth", BOOLEAN],
  ["rotationZ", NUMBER],
  ["hidden", BOOLEAN],
  ["kerning", BOOLEAN],
  ["wordArcMode", ARC_MODE],
  ["twistRibbon", NUMBER],
  ["matchBottom", BOOLEAN],
  ["matchScaleY", BOOLEAN],
  ["depthAnchor", choice("front", "middle", "back")],
  ["tileableScale", NUMBER],
  ["arcMode", ARC_MODE],
  ["arcMove", NUMBER],
  ["arcMarked", BOOLEAN],
  ["wordLinkScale", NUMBER],
  ["wordScaleMarked", BOOLEAN],
  ["internalSmooth", BOOLEAN],
  ["twistRibbonAnchor", TWIST_ANCHOR],
  ["overlayFade", NUMBER],
  ["tileable", ID],
  ["tileableVariant", ID],
  ["source", choice("premade", "file")],
  ["rotationY", NUMBER],
  ["rowSpacing", NUMBER],
  ["fade", BOOLEAN],
  ["sideFade", NUMBER],
  ["scaleOutline", BOOLEAN],
  ["wordBorder", NUMBER],
  ["wordArcTop", NUMBER],
  ["wordArcBottom", NUMBER],
  ["wordArcMove", NUMBER],
  ["wordArcMarked", BOOLEAN],
  ["wordScaleZ", NUMBER],
  ["tileableXOffset", NUMBER],
  ["tileableYOffset", NUMBER],
  ["tileableRandomRotations", BOOLEAN],
  ["tileableRandomMirroring", BOOLEAN],
  ["tileableTileEdges", BOOLEAN],
  ["disableFontOverlay", BOOLEAN],
  ["inset", NUMBER],
  ["radius", NUMBER],
  ["size", NUMBER],
  ["tileablePerCharacter", BOOLEAN],
  ["layerWords", BOOLEAN],
  ["edgeSmooth", BOOLEAN],
  ["internalDirection", FACE_DIRECTION],
  ["sideFill", FACE_FILL],
  ["sideStops", STOPS],
  ["sideSmooth", BOOLEAN],
  ["sideDirection", FACE_DIRECTION],
  ["twistRibbonMirror", BOOLEAN],
  ["twistDoor", NUMBER],
  ["twistDoorAnchor", TWIST_ANCHOR],
  ["twistDoorSame", BOOLEAN],
  ["matchOffset", NUMBER],
  ["matchScale", NUMBER],
  ["twistRibbonCentre", NUMBER],
  ["twistDoorCentre", NUMBER],
  ["arcCentre", NUMBER],
  ["wordArcCentre", NUMBER],
  ["shape", ID],
  ["shapeVersion", ID],
  ["twistDoorRoll", BOOLEAN],
  ["amount", NUMBER],
  ["separateTexture", BOOLEAN],
  ["layerSettings", OBJECTS],
  ["blockState", STATE],
  ["itemComponents", COMPONENTS],
  ["sideWrap", BOOLEAN],
  ["edgeWrap", BOOLEAN],
  ["separateOverlays", BOOLEAN],
  ["separateColour", BOOLEAN],
  ["separateFaces", BOOLEAN],
  ["distance", NUMBER],
  ["blur", NUMBER],
  ["colours", list(isColour, writeColour, readColour)],
  ["tint", COLOUR],
  ["tintBlend", BLEND],
  ["direction", NUMBER],
  ["pitch", NUMBER],
  ["yaw", NUMBER],
  ["tilt", NUMBER],
  ["fov", NUMBER],
  ["fixedDistance", BOOLEAN],
  ["pixelation", NUMBER],
  ["waveShape", choice("sine", "square", "triangle")],
  ["horizontalOffset", NUMBER],
  ["customCoverX", NUMBER],
  ["customCoverY", NUMBER],
  ["customCoverAlign", choice("title", "camera")],
  ["customCoverSpan", BOOLEAN],
  ["customStripPerCharacter", BOOLEAN],
  ["customFont", GOOGLE_FONT],
  ["twistDoorDepth", NUMBER],
  ["twistFan", NUMBER],
  ["twistFanCentre", NUMBER],
  ["twistFanRoll", BOOLEAN],
  ["twistFanHeight", NUMBER],
  ["wordTwistRibbon", NUMBER],
  ["wordTwistRibbonCentre", NUMBER],
  ["wordTwistRibbonMirror", BOOLEAN],
  ["wordTwistDoor", NUMBER],
  ["wordTwistDoorCentre", NUMBER],
  ["wordTwistDoorSame", BOOLEAN],
  ["wordTwistDoorRoll", BOOLEAN],
  ["wordTwistDoorDepth", NUMBER],
  ["wordTwistFan", NUMBER],
  ["wordTwistFanCentre", NUMBER],
  ["wordTwistFanRoll", BOOLEAN],
  ["wordTwistFanHeight", NUMBER],
  ["fadeCurves", BOOLEAN],
  ["curveAngle", NUMBER],
  ["curveHeight", NUMBER],
  ["outerFadeOpacity", NUMBER],
  ["internalFadeOpacity", NUMBER],
  ["sideFadeOpacity", NUMBER],
  ["mix", GRADIENT_MIX],
  ["internalMix", GRADIENT_MIX],
  ["sideMix", GRADIENT_MIX],
  ["edgeMix", GRADIENT_MIX]
]

const IDS = new Map(KEYS.map(([key], index) => [key, index + 1]))
const DEFAULTS = typeDefaults("top")

function fittingType(key, value) {
  const type = KEYS[IDS.get(key) - 1]?.[1]
  return type && (value === null ? type !== BOOLEAN : type.fits(value)) ? type : null
}

export function opens(key, value) {
  const type = KEYS[IDS.get(key) - 1]?.[1]
  if (value === null) return type === NUMBER || !!type && DEFAULTS[key] === null
  return !!type && (type.opens ?? type.fits)(value)
}

function writeEntry(out, key, value) {
  const type = fittingType(key, value)
  if (!type) {
    writeVarint(out, 0)
    writeText(out, key)
    writeText(out, JSON.stringify(value))
    return
  }
  writeVarint(out, IDS.get(key) * 2 + (value === null || value === true ? 1 : 0))
  if (value !== null && type !== BOOLEAN) type.write(out, value)
}

function readEntry(reader) {
  const header = readVarint(reader)
  if (!header) return [readText(reader), JSON.parse(readText(reader))]
  const [key, type] = KEYS[Math.floor(header / 2) - 1] ?? []
  if (!key) throw new Error("the link has a setting this version does not know")
  const flagged = header % 2 === 1
  if (type === BOOLEAN) return [key, flagged]
  return [key, flagged ? null : type.read(reader)]
}

const NESTED = new Set(["words", "layerSettings"].concat(LAYERS))

export function unknownSetting(items, names = new Map(), accepts = fittingType) {
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      if (!accepts(names.get(key) ?? key, value)) return key
      const nested = NESTED.has(key) && value ? unknownSetting(value, key === "words" || key === "layerSettings" ? new Map() : OVERLAY_KEYS, accepts) : null
      if (nested) return nested
    }
  }
  return null
}

export function writeLines(lines, camera = null) {
  const out = []
  OBJECTS.write(out, lines)
  if (camera) writeObject(out, camera)
  return new Uint8Array(out)
}

export function readTitleBytes(bytes) {
  const reader = { bytes, at: 0 }
  const lines = OBJECTS.read(reader)
  const camera = reader.at < bytes.length ? readObject(reader) : null
  if (reader.at !== bytes.length || camera && !Object.keys(camera).length) throw new Error("the link has extra data on the end")
  return { lines, camera }
}
