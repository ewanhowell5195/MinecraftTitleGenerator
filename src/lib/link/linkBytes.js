import { hexOf, rgbOf } from "../core/colour.js"
import { DEFAULT_ORDER } from "../font/order.js"

export const ID_CHARACTERS = Array.from("abcdefghijklmnopqrstuvwxyz0123456789-_.")
const LETTERS = "abcdefghijklmnopqrstuvwxyz"
const TEXT_SETS = [`${LETTERS}0123456789 '-`, `${LETTERS}${LETTERS.toUpperCase()}0123456789 '-`, `${DEFAULT_ORDER} ${LETTERS.toUpperCase()}`].map(set => Array.from(set))
const TEXT_FORMATS = TEXT_SETS.length + 1

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function writeVarint(out, value) {
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

export function readVarint(reader) {
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

export function fitsSet(characters, set) {
  return characters.every(character => set.includes(character))
}

export function writeText(out, value) {
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

export function readText(reader) {
  const header = readVarint(reader)
  const length = Math.floor(header / TEXT_FORMATS)
  const tier = header % TEXT_FORMATS
  return tier ? readPacked(reader, TEXT_SETS[tier - 1], length) : decoder.decode(readBytes(reader, length))
}

export function writeId(out, value) {
  const characters = Array.from(value)
  writeVarint(out, characters.length)
  writePacked(out, characters, ID_CHARACTERS)
}

export function readId(reader) {
  return readPacked(reader, ID_CHARACTERS, readVarint(reader))
}

export function writeNumber(out, value) {
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

export function readNumber(reader) {
  const value = readVarint(reader)
  const places = value % 8
  if (places === 7) return new DataView(readBytes(reader, 8).slice().buffer).getFloat64(0)
  const zigzag = Math.floor(value / 8)
  return (zigzag % 2 ? -(zigzag + 1) / 2 : zigzag / 2) / 10 ** places
}

export function isColour(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

export function writeColour(out, value) {
  out.push(...rgbOf(value))
}

export function readColour(reader) {
  return hexOf(Array.from(readBytes(reader, 3)))
}
