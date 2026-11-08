import { OVERLAY_KINDS } from "./settings.js"

const LAYERS = Object.keys(OVERLAY_KINDS)

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

function writeText(out, value) {
  const bytes = encoder.encode(value)
  writeVarint(out, bytes.length)
  for (const byte of bytes) out.push(byte)
}

function readText(reader) {
  return decoder.decode(readBytes(reader, readVarint(reader)))
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
  for (const start of [1, 3, 5]) out.push(parseInt(value.slice(start, start + 2), 16))
}

function readColour(reader) {
  return `#${Array.from(readBytes(reader, 3), byte => byte.toString(16).padStart(2, "0")).join("")}`
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
const NUMBER = { fits: Number.isFinite, write: writeNumber, read: readNumber }
const COLOUR = { fits: isColour, write: writeColour, read: readColour }
const OBJECTS = list(isObject, writeObject, readObject)
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
  ["texture", TEXT],
  ["type", choice("top", "bottom", "small")],
  ["words", OBJECTS],
  ["matchWidth", NUMBER],
  ["font", choice("minecraft-ten", "minecraft-ten-v2", "minecraft-ten-cyrillic", "minecraft-five-bold", "minecraft-five-bold-cyrillic", "minecraft-five-bold-block", "minecraft-ten-outline", "minecraft-dungeons", "minecraft-gui", "minecraft-seven", "minecraft-five", "minecraft-sga", "block-serif", "minecraft-legends", "minecraft-ten-serif", "minecraft-ten-rounded")],
  ["hue", NUMBER],
  ["saturation", NUMBER],
  ["brightness", NUMBER],
  ["contrast", NUMBER],
  ["colour", COLOUR],
  ["blend", BLEND],
  ["colourOpacity", NUMBER],
  ["customBorder", BOOLEAN],
  ["borderColour", COLOUR],
  ["customEdge", BOOLEAN],
  ["edgeColour", COLOUR],
  ["edgeBrightness", NUMBER],
  ["textureSource", choice("premade", "tileable", "gradient")],
  ["textureVariant", TEXT],
  ["tileable", TEXT],
  ["tileableVariant", TEXT],
  ["tileableScale", NUMBER],
  ["stops", STOPS],
  ["smooth", BOOLEAN],
  ["gradientAngle", NUMBER],
  ["overlayMode", OVERLAY_MODE],
  ["overlays", OVERLAYS],
  ["edgeOverlayMode", OVERLAY_MODE],
  ["edgeOverlays", OVERLAYS],
  ["overlay", TEXT],
  ["source", choice("premade", "file")],
  ["colourBlend", BLEND],
  ["opacity", NUMBER],
  ["seed", NUMBER],
  ["spacing", NUMBER],
  ["border", NUMBER],
  ["depth", NUMBER],
  ["scaleX", NUMBER],
  ["scaleY", NUMBER],
  ["linkScale", NUMBER],
  ["rotationX", NUMBER],
  ["rotationY", NUMBER],
  ["rotationZ", NUMBER],
  ["translateX", NUMBER],
  ["translateY", NUMBER],
  ["translateZ", NUMBER],
  ["row", NUMBER],
  ["rowSpacing", NUMBER],
  ["spaceBefore", BOOLEAN],
  ["hidden", BOOLEAN],
  ["fade", BOOLEAN],
  ["outerFade", NUMBER],
  ["internalFaces", BOOLEAN],
  ["fadeInternal", BOOLEAN],
  ["internalFade", NUMBER],
  ["customInternal", BOOLEAN],
  ["internalColour", COLOUR],
  ["internalBrightness", NUMBER],
  ["sideFaces", BOOLEAN],
  ["fadeSides", BOOLEAN],
  ["sideFade", NUMBER],
  ["customSide", BOOLEAN],
  ["sideColour", COLOUR],
  ["sideBrightness", NUMBER],
  ["arcMode", ARC_MODE],
  ["arcTop", NUMBER],
  ["arcBottom", NUMBER],
  ["arcMove", NUMBER],
  ["arcMarked", BOOLEAN],
  ["arcGradient", BOOLEAN],
  ["clipHoles", BOOLEAN],
  ["terminators", BOOLEAN],
  ["kerning", BOOLEAN],
  ["scaleZ", NUMBER],
  ["scaleMarked", BOOLEAN],
  ["scaleOutline", BOOLEAN],
  ["wordDepth", NUMBER],
  ["wordBorder", NUMBER],
  ["wordArcMode", ARC_MODE],
  ["wordArcTop", NUMBER],
  ["wordArcBottom", NUMBER],
  ["wordArcMove", NUMBER],
  ["wordArcMarked", BOOLEAN],
  ["wordScaleX", NUMBER],
  ["wordScaleY", NUMBER],
  ["wordLinkScale", NUMBER],
  ["wordScaleZ", NUMBER],
  ["wordScaleMarked", BOOLEAN],
  ["wordScaleOutline", BOOLEAN],
  ["wordRotationX", NUMBER],
  ["wordRotationY", NUMBER],
  ["wordRotationZ", NUMBER],
  ["wordTranslateX", NUMBER],
  ["wordTranslateY", NUMBER],
  ["wordTranslateZ", NUMBER],
  ["tileableXOffset", NUMBER],
  ["tileableYOffset", NUMBER],
  ["tileableRandomRotations", BOOLEAN],
  ["tileableRandomMirroring", BOOLEAN],
  ["tileableTileEdges", BOOLEAN],
  ["disableFontOverlay", BOOLEAN],
  ["amplitude", NUMBER],
  ["angle", NUMBER],
  ["gap", NUMBER],
  ["inset", NUMBER],
  ["length", NUMBER],
  ["level", NUMBER],
  ["offset", NUMBER],
  ["radius", NUMBER],
  ["randomness", NUMBER],
  ["size", NUMBER],
  ["spread", NUMBER],
  ["thickness", NUMBER],
  ["width", NUMBER],
  ["tileableSource", choice("premade", "minecraft")],
  ["minecraftTexture", TEXT],
  ["minecraftVersion", TEXT],
  ["tileablePerCharacter", BOOLEAN],
  ["layerWords", BOOLEAN],
  ["edgeFill", FACE_FILL],
  ["edgeStops", STOPS],
  ["edgeSmooth", BOOLEAN],
  ["internalFill", FACE_FILL],
  ["internalStops", STOPS],
  ["internalSmooth", BOOLEAN],
  ["internalDirection", FACE_DIRECTION],
  ["sideFill", FACE_FILL],
  ["sideStops", STOPS],
  ["sideSmooth", BOOLEAN],
  ["sideDirection", FACE_DIRECTION],
  ["twistRibbon", NUMBER],
  ["twistRibbonAnchor", TWIST_ANCHOR],
  ["twistRibbonMirror", BOOLEAN],
  ["twistDoor", NUMBER],
  ["twistDoorAnchor", TWIST_ANCHOR],
  ["twistDoorSame", BOOLEAN],
  ["matchBottom", BOOLEAN],
  ["matchOffset", NUMBER],
  ["matchScale", NUMBER],
  ["matchScaleY", BOOLEAN],
  ["overlayFade", NUMBER]
]

const IDS = new Map(KEYS.map(([key], index) => [key, index + 1]))

function writeEntry(out, key, value) {
  const id = IDS.get(key)
  const type = KEYS[id - 1]?.[1]
  if (!type || !(value === null ? type !== BOOLEAN : type.fits(value))) {
    writeVarint(out, 0)
    writeText(out, key)
    writeText(out, JSON.stringify(value))
    return
  }
  writeVarint(out, id * 2 + (value === null || value === true ? 1 : 0))
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

const NESTED = new Set(["words", "overlays", "edgeOverlays"])

export function unknownSetting(items, names = new Map()) {
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      const type = KEYS[IDS.get(names.get(key) ?? key) - 1]?.[1]
      if (!type || !(value === null ? type !== BOOLEAN : type.fits(value))) return key
      const nested = NESTED.has(key) && value ? unknownSetting(value, key === "words" ? new Map() : OVERLAY_KEYS) : null
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

function countUploads(entry) {
  const own = LAYERS.flatMap(key => entry[key] ?? []).filter(layer => layer.source === "file" && layer.file).length
  return (entry.words ?? []).reduce((total, word) => total + countUploads(word), own)
}

function withoutUploads(entry) {
  const stripped = { ...entry }
  for (const key of LAYERS) {
    if (entry[key]) stripped[key] = entry[key].filter(layer => layer.source !== "file").map(({ file, ...layer }) => layer)
  }
  if (entry.words) stripped.words = entry.words.map(withoutUploads)
  return stripped
}

export function encodeTitle({ version, lines }) {
  return { code: `${version.toString(36)}${toBase64Url(writeLines(lines.map(withoutUploads)))}`, skipped: lines.reduce((total, line) => total + countUploads(line), 0) }
}

export function titleBody(code) {
  return code.slice(1)
}

export function decodeTitle(code) {
  try {
    const version = parseInt(code[0], 36)
    if (!Number.isInteger(version)) throw new Error("the link has no version")
    return { version, lines: readLines(fromBase64Url(code.slice(1))) }
  } catch {
    throw new Error("it is incomplete or damaged")
  }
}
