import { sheetLayout } from "./sheet.js"

const CUSTOM_SHAPE_UNITS = { width: 256, height: 64 }

export function silhouetteBounds({ width, height, data }) {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

function solidBounds(image) {
  const bounds = silhouetteBounds(image)
  if (!bounds) throw new Error("the PNG has no solid pixels to make the shape from")
  return bounds
}

function scaleFor(bounds) {
  return Math.max(1, Math.ceil(bounds.width / CUSTOM_SHAPE_UNITS.width), Math.ceil(bounds.height / CUSTOM_SHAPE_UNITS.height))
}

export function silhouetteScale(image) {
  return scaleFor(solidBounds(image))
}

function sampled(image, scale, bounds = solidBounds(image)) {
  const width = Math.ceil(bounds.width / scale)
  const height = Math.ceil(bounds.height / scale)
  const lift = height * scale - bounds.height
  const source = (x, y) => ((bounds.top + y) * image.width + bounds.left + x) * 4
  const solid = (x, y) => image.data[source(x, y) + 3] >= 128
  const shape = { image, scale, bounds, width, height, lift, source, solid }
  return { ...shape, mask: unitMask(shape) }
}

export function silhouetteSample(image) {
  const bounds = solidBounds(image)
  return sampled(image, scaleFor(bounds), bounds)
}

function blockPixels(row, column, scale, lift) {
  const pixels = []
  for (let y = row * scale - lift; y < (row + 1) * scale - lift; y++) {
    for (let x = column * scale; x < (column + 1) * scale; x++) pixels.push([x, y])
  }
  return pixels
}

function unitMask({ scale, bounds, width, height, lift, solid }) {
  const mask = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const inside = blockPixels(row, column, scale, lift).filter(([x, y]) => x < bounds.width && y >= 0 && y < bounds.height)
      const filled = inside.filter(([x, y]) => solid(x, y)).length
      mask[row * width + column] = inside.length && filled * 2 >= inside.length ? 1 : 0
    }
  }
  return mask
}

export function inkBox({ width, height, mask }) {
  const box = { left: width, top: height, right: -1, bottom: -1 }
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      if (!mask[row * width + column]) continue
      box.left = Math.min(box.left, column)
      box.right = Math.max(box.right, column)
      box.top = Math.min(box.top, row)
      box.bottom = Math.max(box.bottom, row)
    }
  }
  return box
}

export function cubesMatch({ bounds, scale, lift, width, mask, solid }) {
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      if (solid(x, y) !== !!mask[Math.floor((y + lift) / scale) * width + Math.floor(x / scale)]) return false
    }
  }
  return true
}

export function sampleGlyph({ width, height, mask }) {
  return { width, height, top: height, bottom: 0, mask }
}

export function silhouetteGlyph(image, scale = 1) {
  return sampleGlyph(sampled(image, scale))
}

export function silhouettePixels(cells, capHeight, depth, image, scale = 1) {
  return samplePixels(cells, capHeight, depth, sampled(image, scale))
}

export function samplePixels(cells, capHeight, depth, shape) {
  const { image, scale, bounds, lift, source, solid, mask } = shape
  const layout = sheetLayout(cells, capHeight, depth)
  let units = 0
  let rows = 0
  for (const [glyph, at] of layout) {
    units = Math.max(units, at.x + glyph.width)
    rows = Math.max(rows, at.down + depth)
  }
  const width = units * scale
  const height = rows * scale
  const data = new Uint8ClampedArray(width * height * 4)
  const ink = inkBox(shape)
  const left = ink.left * scale
  const top = ink.top * scale - lift
  const across = x => x >= left && x < (ink.right + 1) * scale
  const down = y => y >= top && y < (ink.bottom + 1) * scale - lift
  const copy = (x, y, toX, toY) => data.set(image.data.subarray(source(x, y), source(x, y) + 4), (toY * width + toX) * 4)
  for (const [, at] of layout) {
    for (let x = 0; x < bounds.width; x++) {
      if (!across(x)) continue
      const filled = Array.from({ length: bounds.height }, (row, y) => y).filter(y => down(y) && solid(x, y))
      if (!filled.length) continue
      for (const y of filled) copy(x, y, at.x * scale + x - left, at.top * scale + y - top)
      for (let row = 0; row < depth * scale; row++) {
        copy(x, filled[0], at.x * scale + x - left, at.up * scale + row)
        copy(x, filled.at(-1), at.x * scale + x - left, at.down * scale + row)
      }
    }
    for (let row = 0; row < shape.height; row++) {
      for (let column = 0; column < shape.width; column++) {
        if (!mask[row * shape.width + column]) continue
        const block = blockPixels(row, column, scale, lift)
        const within = ([x, y]) => x < bounds.width && y >= 0 && y < bounds.height && solid(x, y)
        const opaque = block.filter(within)
        if (opaque.length === block.length) continue
        for (const [x, y] of block) {
          if (within([x, y])) continue
          const [nx, ny] = opaque.reduce((best, pixel) => (pixel[0] - x) ** 2 + (pixel[1] - y) ** 2 < (best[0] - x) ** 2 + (best[1] - y) ** 2 ? pixel : best)
          const at4 = ((at.top * scale + y - top) * width + at.x * scale + x - left) * 4
          data.set(image.data.subarray(source(nx, ny), source(nx, ny) + 3), at4)
          data[at4 + 3] = 255
        }
      }
    }
  }
  return { data, width, height }
}
