import { deflateSync, inflateSync } from "three/addons/libs/fflate.module.js"
import { hexOf, rgbOf } from "./colour.js"
import { DEFAULT_ORDER } from "./order.js"
import { FILE_VERSION, LAYERS, LINE, isCustomFont, sameValue, typeDefaults, upgradeLine } from "./settings.js"
import { CUSTOM_SHAPE, FALLBACK_SHAPE } from "./shapes.js"

// older titles keep the twist anchors on the line
const LINE_ONLY = new Set(["words", "matchWidth", "twistRibbonAnchor", "twistDoorAnchor"])
const PREFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const ID_CHARACTERS = Array.from("abcdefghijklmnopqrstuvwxyz0123456789-_.")
const LETTERS = "abcdefghijklmnopqrstuvwxyz"
const TEXT_SETS = [`${LETTERS}0123456789 '-`, `${LETTERS}${LETTERS.toUpperCase()}0123456789 '-`, `${DEFAULT_ORDER} ${LETTERS.toUpperCase()}`].map(set => Array.from(set))
const TEXT_FORMATS = TEXT_SETS.length + 1

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

function writeVarint(out, value) {
  while (value > 127) {
    out.push(value % 128 + 128)
    value = Math.floor(value / 128)
  }
  out.push(value)
}

function readByte(reader) {
  if (reader.at >= reader.bytes.length) throw new Error("the link ended early")
  return reader.bytes[reader.at++]
}

function readVarint(reader) {
  let value = 0
  for (let shift = 0; shift < 49; shift += 7) {
    const byte = readByte(reader)
    value += (byte & 127) * 2 ** shift
    if (byte < 128) return value
  }
  throw new Error("a number in the link is too long")
}

function readBytes(reader, length) {
  if (reader.at + length > reader.bytes.length) throw new Error("the link ended early")
  reader.at += length
  return reader.bytes.subarray(reader.at - length, reader.at)
}

function packedLength(set, count) {
  return count ? Math.ceil((BigInt(set.length) ** BigInt(count) - 1n).toString(2).length / 8) : 0
}

function writePacked(out, characters, set) {
  let number = 0n
  for (const character of characters) number = number * BigInt(set.length) + BigInt(set.indexOf(character))
  for (let at = packedLength(set, characters.length) - 1; at >= 0; at--) out.push(Number(number >> BigInt(at * 8) & 255n))
}

function readPacked(reader, set, count) {
  let number = 0n
  for (const byte of readBytes(reader, packedLength(set, count))) number = number * 256n + BigInt(byte)
  const size = BigInt(set.length)
  const characters = []
  for (let step = 0; step < count; step++) {
    characters.push(set[Number(number % size)])
    number /= size
  }
  if (number) throw new Error("the link has text this version does not know")
  return characters.reverse().join("")
}

function fitsSet(characters, set) {
  return characters.every(character => set.includes(character))
}

function writeText(out, value) {
  const characters = Array.from(value)
  const tier = TEXT_SETS.findIndex(set => fitsSet(characters, set))
  if (tier >= 0) {
    writeVarint(out, characters.length * TEXT_FORMATS + tier + 1)
    writePacked(out, characters, TEXT_SETS[tier])
    return
  }
  const bytes = encoder.encode(value)
  writeVarint(out, bytes.length * TEXT_FORMATS)
  for (const byte of bytes) out.push(byte)
}

function readText(reader) {
  const header = readVarint(reader)
  const length = Math.floor(header / TEXT_FORMATS)
  const tier = header % TEXT_FORMATS
  return tier ? readPacked(reader, TEXT_SETS[tier - 1], length) : decoder.decode(readBytes(reader, length))
}

function writeId(out, value) {
  const characters = Array.from(value)
  writeVarint(out, characters.length)
  writePacked(out, characters, ID_CHARACTERS)
}

function readId(reader) {
  return readPacked(reader, ID_CHARACTERS, readVarint(reader))
}

function writeNumber(out, value) {
  for (let places = 0; places < 7; places++) {
    const scale = 10 ** places
    const whole = Math.round(value * scale)
    if (whole / scale !== value || Math.abs(whole) >= 2 ** 44) continue
    writeVarint(out, (whole < 0 ? -whole * 2 - 1 : whole * 2) * 8 + places)
    return
  }
  writeVarint(out, 7)
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, value)
  for (const byte of bytes) out.push(byte)
}

function readNumber(reader) {
  const value = readVarint(reader)
  const places = value % 8
  if (places === 7) return new DataView(readBytes(reader, 8).slice().buffer).getFloat64(0)
  const zigzag = Math.floor(value / 8)
  return (zigzag % 2 ? -(zigzag + 1) / 2 : zigzag / 2) / 10 ** places
}

function isColour(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

function writeColour(out, value) {
  out.push(...rgbOf(value))
}

function readColour(reader) {
  return hexOf(Array.from(readBytes(reader, 3)))
}

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
  ["blur", NUMBER]
]

const IDS = new Map(KEYS.map(([key], index) => [key, index + 1]))
const DEFAULTS = typeDefaults("top")

function fittingType(key, value) {
  const type = KEYS[IDS.get(key) - 1]?.[1]
  return type && (value === null ? type !== BOOLEAN : type.fits(value)) ? type : null
}

function opens(key, value) {
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

export function writeLines(lines) {
  const out = []
  OBJECTS.write(out, lines)
  return new Uint8Array(out)
}

export function readLines(bytes) {
  const reader = { bytes, at: 0 }
  const lines = OBJECTS.read(reader)
  if (reader.at !== bytes.length) throw new Error("the link has extra data on the end")
  return lines
}

function toBase64Url(bytes) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function fromBase64Url(text) {
  return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0))
}

function layerUploads(layer) {
  return LAYERS.flatMap(key => layer[key] ?? []).filter(overlay => overlay.source === "file" && overlay.file).length + (layer.textureSource === "custom" && layer.customTexture ? 1 : 0)
}

function countUploads(entry) {
  const own = LAYERS.flatMap(key => entry[key] ?? []).filter(layer => layer.source === "file" && layer.file).length + (entry.textureSource === "custom" && (entry.customTexture || (entry.words ?? []).some(word => word.customTexture)) ? 1 : 0) + (isCustomFont(entry.font) || entry.shape === CUSTOM_SHAPE ? 1 : 0)
  const layered = (entry.layerSettings ?? []).reduce((total, layer) => total + layerUploads(layer), own)
  return (entry.words ?? []).reduce((total, word) => total + countUploads(word), layered)
}

function layerWithoutUploads(layer) {
  const stripped = Object.fromEntries(Object.entries(layer).filter(([key]) => !UPLOAD_KEYS.includes(key)))
  if (layer.textureSource === "custom") delete stripped.textureSource
  for (const key of LAYERS) {
    if (layer[key]) stripped[key] = layer[key].filter(overlay => overlay.source !== "file").map(({ file, ...overlay }) => overlay)
  }
  return stripped
}

export const UPLOAD_KEYS = ["customTexture", "customTextureMode", "customFont"]

function withoutUploads(entry) {
  const stripped = Object.fromEntries(Object.entries(entry).filter(([key]) => !UPLOAD_KEYS.includes(key)))
  if (entry.textureSource === "custom") delete stripped.textureSource
  if (isCustomFont(entry.font)) delete stripped.font
  if (entry.shape === CUSTOM_SHAPE) {
    stripped.shape = FALLBACK_SHAPE
    delete stripped.texture
    delete stripped.textureVariant
  }
  for (const key of LAYERS) {
    if (entry[key]) stripped[key] = entry[key].filter(layer => layer.source !== "file").map(({ file, ...layer }) => layer)
  }
  if (entry.layerSettings) stripped.layerSettings = entry.layerSettings.map(layerWithoutUploads)
  if (entry.words) stripped.words = entry.words.map(withoutUploads)
  return stripped
}

function lineKey(key) {
  return LINE.has(key) || LINE_ONLY.has(key)
}

export function hoisted(line) {
  if (!line.words?.length) return line
  const [first, ...rest] = line.words
  const shared = Object.keys(first).filter(key => !lineKey(key) && rest.every(word => key in word && sameValue(word[key], first[key])))
  if (!shared.length) return line
  return { ...line, ...Object.fromEntries(shared.map(key => [key, first[key]])), words: line.words.map(word => Object.fromEntries(Object.entries(word).filter(([key]) => !shared.includes(key)))) }
}

export function lowered(line) {
  if (!line.words) return line
  const shared = Object.entries(line).filter(([key]) => !lineKey(key))
  if (!shared.length) return line
  return { ...Object.fromEntries(Object.entries(line).filter(([key]) => lineKey(key))), words: line.words.map(word => ({ ...Object.fromEntries(shared), ...word })) }
}

export function encodeTitle({ version, lines }) {
  if (version * 2 + 1 >= PREFIXES.length) throw new Error(`links can't hold version ${version}`)
  const bytes = writeLines(lines.map(line => hoisted(withoutUploads(line))))
  const packed = deflateSync(bytes, { level: 9 })
  const compressed = packed.length < bytes.length
  return { code: `${PREFIXES[version * 2 + (compressed ? 1 : 0)]}${toBase64Url(compressed ? packed : bytes)}`, skipped: lines.reduce((total, line) => total + countUploads(line), 0) }
}

export function decodeTitle(code) {
  try {
    const prefix = PREFIXES.indexOf(code[0])
    if (prefix < 0) throw new Error("the link has no version")
    const bytes = fromBase64Url(code.slice(1))
    return { version: prefix >> 1, lines: readLines(prefix % 2 ? inflateSync(bytes) : bytes).map(lowered) }
  } catch {
    throw new Error("it is incomplete or damaged")
  }
}

export function openableTitle(code) {
  const title = decodeTitle(code)
  const unknown = unknownSetting(title.lines, undefined, opens)
  if (unknown) throw new Error(`it has a setting that can't be read: ${unknown}`)
  return title
}

const bodies = new Map()

function upgradedBody(code) {
  const body = code.slice(1)
  if (PREFIXES.indexOf(code[0]) >> 1 >= FILE_VERSION) return body
  try {
    const { version, lines } = decodeTitle(code)
    const upgraded = lines.map(line => upgradeLine(line, version))
    return sameValue(upgraded, lines) ? body : encodeTitle({ version: FILE_VERSION, lines: upgraded }).code.slice(1)
  } catch {
    return body
  }
}

export function titleBody(code) {
  if (!bodies.has(code)) bodies.set(code, upgradedBody(code))
  return bodies.get(code)
}
