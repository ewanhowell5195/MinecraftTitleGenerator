const LIMIT = 6
const region = new Int32Array(32)
const around = new Int32Array(4)

function neighbours(p, width, height) {
  const x = p % width
  let count = 0
  if (x > 0) around[count++] = p - 1
  if (x < width - 1) around[count++] = p + 1
  if (p >= width) around[count++] = p - width
  if (p < width * (height - 1)) around[count++] = p + width
  return count
}

function same(pixels, p, solid) {
  return (pixels[p] !== 0) === solid
}

// rows run bottom to top, as gl.readPixels returns them
function enclosed(pixels, p, x, y, width, height) {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return false
  const a = pixels[p]
  const b = pixels[p - 1]
  const c = pixels[p + 1]
  const d = pixels[p - width]
  const e = pixels[p + width]
  const f = pixels[p + width - 1]
  return (a | b | c | d | e | f) === 0 || (a & b & c & d & e & f) >>> 24 === 255
}

function inRegion(q, found) {
  for (let i = 0; i < found; i++) {
    if (region[i] === q) return true
  }
  return false
}

function grow(pixels, start, width, height, solid) {
  region[0] = start
  let found = 1
  for (let read = 0; read < found; read++) {
    if (read === LIMIT) return 0
    const count = neighbours(region[read], width, height)
    for (let n = 0; n < count; n++) {
      const q = around[n]
      if (same(pixels, q, solid) && !inRegion(q, found)) region[found++] = q
    }
  }
  return found < LIMIT ? found : 0
}

function fill(data, p, width, height) {
  const sum = [0, 0, 0, 0]
  let solid = 0
  const count = neighbours(p, width, height)
  for (let n = 0; n < count; n++) {
    const q = around[n] * 4
    if (data[q + 3] === 0) continue
    solid++
    for (let c = 0; c < 4; c++) sum[c] += data[q + c]
  }
  if (!solid) return
  for (let c = 0; c < 4; c++) data[p * 4 + c] = sum[c] / solid
}

function cleanRow(data, pixels, y, width, height) {
  let changed = false
  for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x
    if (enclosed(pixels, p, x, y, width, height)) continue
    const solid = pixels[p] !== 0
    const size = grow(pixels, p, width, height, solid)
    if (size) changed = true
    for (let k = 0; k < size; k++) {
      if (solid) pixels[region[k]] = 0
      else fill(data, region[k], width, height)
    }
  }
  return changed
}

export async function clean(data, width, height, step) {
  const pixels = new Uint32Array(data.buffer, 0, width * height)
  let changed = false
  for (let y = 0; y < height; y++) {
    await step(y / height)
    if (cleanRow(data, pixels, y, width, height)) changed = true
  }
  return changed
}

export function writeFlipped(ctx, data, width, height) {
  const image = new ImageData(width, height)
  for (let y = 0; y < height; y++) image.data.set(data.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4)
  ctx.putImageData(image, 0, 0)
}
