import { unzlibSync, zlibSync } from "three/addons/libs/fflate.module.js"
import { SUBMISSION_LIMITS } from "../submissions.js"

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function chunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const list = []
  let at = 8
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    if (at + 12 + length > bytes.length) throw new Error("the PNG is cut short")
    list.push({ type, data: bytes.subarray(at + 8, at + 8 + length) })
    at += 12 + length
    if (type === "IEND") break
  }
  return list
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function unfilter(raw, height, stride, step) {
  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= step ? out[row + x - step] : 0
      const b = y ? out[row - stride + x] : 0
      const c = y && x >= step ? out[row - stride + x - step] : 0
      const value = line[x]
      if (filter === 0) out[row + x] = value
      else if (filter === 1) out[row + x] = value + a
      else if (filter === 2) out[row + x] = value + b
      else if (filter === 3) out[row + x] = value + ((a + b) >> 1)
      else if (filter === 4) out[row + x] = value + paeth(a, b, c)
      else throw new Error(`the PNG has an unknown filter ${filter}`)
    }
  }
  return out
}

function inflated(joined, size) {
  const overflow = "the PNG has more pixels than its size allows"
  let raw
  try {
    raw = unzlibSync(joined, { out: new Uint8Array(size + 1) })
  } catch (err) {
    if (err instanceof RangeError) throw new Error(overflow)
    throw err
  }
  if (raw.length > size) throw new Error(overflow)
  if (raw.length < size) throw new Error("the PNG's pixels are cut short")
  return raw
}

export function decodePng(bytes) {
  if (bytes.length < 8 || SIGNATURE.some((value, index) => bytes[index] !== value)) throw new Error("it isn't a PNG")
  const list = chunks(bytes)
  const header = list.find(chunk => chunk.type === "IHDR")?.data
  if (!header) throw new Error("the PNG has no header")
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const width = view.getUint32(0)
  const height = view.getUint32(4)
  if (width > SUBMISSION_LIMITS.side || height > SUBMISSION_LIMITS.side) throw new Error(`the PNG is ${width}x${height}, and it can be up to ${SUBMISSION_LIMITS.side} pixels on each side`)
  const [depth, colour, , , interlace] = header.subarray(8, 13)
  const channels = CHANNELS[colour]
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) throw new Error(`the PNG uses colour type ${colour} at ${depth} bits, which can't be read`)
  if (interlace) throw new Error("the PNG is interlaced, which can't be read")
  const palette = list.find(chunk => chunk.type === "PLTE")?.data
  const alphas = list.find(chunk => chunk.type === "tRNS")?.data
  const joined = new Uint8Array(list.filter(chunk => chunk.type === "IDAT").reduce((total, chunk) => total + chunk.data.length, 0))
  let offset = 0
  for (const chunk of list.filter(item => item.type === "IDAT")) {
    joined.set(chunk.data, offset)
    offset += chunk.data.length
  }
  const bits = depth * channels
  const stride = Math.ceil(width * bits / 8)
  const raw = inflated(joined, height * (stride + 1))
  const rows = unfilter(raw, height, stride, Math.max(1, bits >> 3))
  const data = new Uint8ClampedArray(width * height * 4)
  const max = (1 << Math.min(depth, 8)) - 1
  const key = alphas && (colour === 0 || colour === 2) ? Array.from({ length: alphas.length / 2 }, (_, index) => (alphas[index * 2] << 8 | alphas[index * 2 + 1]) >> (depth === 16 ? 8 : 0)) : null

  function sample(row, x, channel) {
    if (depth === 16) return rows[row + (x * channels + channel) * 2]
    if (depth === 8) return rows[row + x * channels + channel]
    const bit = x * depth
    return rows[row + (bit >> 3)] >> (8 - depth - (bit & 7)) & max
  }

  for (let y = 0; y < height; y++) {
    const row = y * stride
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if (colour === 3) {
        const index = sample(row, x, 0)
        data[at] = palette?.[index * 3] ?? 0
        data[at + 1] = palette?.[index * 3 + 1] ?? 0
        data[at + 2] = palette?.[index * 3 + 2] ?? 0
        data[at + 3] = alphas?.[index] ?? 255
        continue
      }
      const scale = depth < 8 ? 255 / max : 1
      const grey = colour === 0 || colour === 4
      const raw = grey ? [sample(row, x, 0)] : [0, 1, 2].map(channel => sample(row, x, channel))
      data[at] = raw[0] * scale
      data[at + 1] = (raw[1] ?? raw[0]) * scale
      data[at + 2] = (raw[2] ?? raw[0]) * scale
      if (colour === 4) data[at + 3] = sample(row, x, 1)
      else if (colour === 6) data[at + 3] = sample(row, x, 3)
      else data[at + 3] = key && raw.every((value, channel) => value === key[channel]) ? 0 : 255
    }
  }
  return { width, height, data }
}

function crc(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0)
  }
  return (value ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const bytes = new Uint8Array(12 + data.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, data.length)
  bytes.set(Array.from(type, char => char.charCodeAt(0)), 4)
  bytes.set(data, 8)
  view.setUint32(8 + data.length, crc(bytes.subarray(4, 8 + data.length)))
  return bytes
}

export function encodePng({ width, height, data }) {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8)
  const stride = width * 4
  const rows = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  const parts = [Uint8Array.from(SIGNATURE), chunk("IHDR", header), chunk("IDAT", zlibSync(rows)), chunk("IEND", new Uint8Array(0))]
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}
