const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const DEPTHS = [1, 2, 4, 8, 16]

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function chunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found = { header: null, palette: null, alpha: null, data: [] }
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at)
    const type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8))
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (type === "IHDR") found.header = { width: view.getUint32(at + 8), height: view.getUint32(at + 12), depth: body[8], colour: body[9], interlace: body[12] }
    else if (type === "PLTE") found.palette = body
    else if (type === "tRNS") found.alpha = body
    else if (type === "IDAT") found.data.push(body)
    else if (type === "IEND") break
    at += length + 12
  }
  return found
}

function unfilter(raw, stride, height, step) {
  const lines = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    if (filter > 4) throw new Error(`the PNG has an unknown filter ${filter} on row ${y}`)
    const from = y * (stride + 1) + 1
    const at = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= step ? lines[at + x - step] : 0
      const b = y ? lines[at - stride + x] : 0
      const c = x >= step && y ? lines[at - stride + x - step] : 0
      const predicted = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]
      lines[at + x] = (raw[from + x] + predicted) & 255
    }
  }
  return lines
}

export async function decodePng(bytes) {
  const { header, palette, alpha, data } = chunks(bytes)
  if (!header) throw new Error("the PNG has no header")
  const { width, height, depth, colour, interlace } = header
  const channels = CHANNELS[colour]
  if (!channels || !DEPTHS.includes(depth) || interlace) throw new Error(`PNGs with colour type ${colour}, bit depth ${depth} and interlace ${interlace} can't be read`)
  if (colour === 3 && !palette) throw new Error("the PNG has a palette colour type but no palette")
  const joined = new Uint8Array(data.reduce((total, part) => total + part.length, 0))
  let filled = 0
  for (const part of data) {
    joined.set(part, filled)
    filled += part.length
  }
  const stride = Math.ceil(width * channels * depth / 8)
  const lines = unfilter(await inflate(joined), stride, height, Math.max(1, channels * depth / 8))
  const top = (1 << Math.min(depth, 8)) - 1
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const line = lines.subarray(y * stride, (y + 1) * stride)
    const raw = index => depth === 16 ? line[index * 2] : depth === 8 ? line[index] : line[index * depth >> 3] >> 8 - depth - (index * depth & 7) & top
    const level = index => depth >= 8 ? raw(index) : Math.round(raw(index) * 255 / top)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if (colour === 3) {
        const entry = raw(x)
        pixels.set(palette.subarray(entry * 3, entry * 3 + 3), at)
        pixels[at + 3] = alpha?.[entry] ?? 255
      } else if (colour === 0 || colour === 4) {
        pixels.fill(level(x * channels), at, at + 3)
        pixels[at + 3] = colour === 4 ? level(x * 2 + 1) : 255
      } else {
        for (let c = 0; c < 3; c++) pixels[at + c] = level(x * channels + c)
        pixels[at + 3] = colour === 6 ? level(x * 4 + 3) : 255
      }
    }
  }
  return { width, height, data: pixels }
}
