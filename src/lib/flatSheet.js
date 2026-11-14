import { sheetLayout } from "./font.js"

const FACE = [255, 255, 255]
const UP = [176, 176, 176]
const DOWN = [84, 84, 84]

export function stripLimits(tops, bottoms, capHeight) {
  return { topline: Math.min(capHeight, Math.max(...tops)), baseline: Math.max(0, Math.min(...bottoms)) }
}

function stripColumns(glyph, capHeight) {
  const solid = (row, column) => row >= 0 && row < glyph.height && glyph.mask[row * glyph.width + column] === 1
  const tops = []
  const bottoms = []
  for (let column = 0; column < glyph.width; column++) {
    for (let row = 0; row < glyph.height; row++) {
      if (!solid(row, column)) continue
      if (!solid(row + 1, column)) tops.push([column, glyph.bottom + row + 1])
      if (!solid(row - 1, column)) bottoms.push([column, glyph.bottom + row])
    }
  }
  const { topline, baseline } = stripLimits(tops.map(([, level]) => level), bottoms.map(([, level]) => level), capHeight)
  return { up: new Set(tops.filter(([, level]) => level >= topline).map(([column]) => column)), down: new Set(bottoms.filter(([, level]) => level <= baseline).map(([column]) => column)) }
}

export function layerShade(layers, layer) {
  return layers?.[layer] ?? 1
}

export function layerMask(glyph, layer) {
  return glyph.depths ? glyph.mask.map((solid, at) => solid && glyph.depths[at] <= layer ? 1 : 0) : glyph.mask
}

export function layerLeft(glyph, layer) {
  if (layer === null || !glyph.depths) return 0
  const mask = layerMask(glyph, layer)
  for (let column = 0; column < glyph.width; column++) {
    for (let row = 0; row < glyph.height; row++) {
      if (mask[row * glyph.width + column]) return column
    }
  }
  return 0
}

export function layerSlices(layers, depth) {
  return layers.map((value, layer) => {
    const low = Math.round((layers[layer + 1] ?? 0) * depth)
    const high = Math.round(value * depth)
    if (high > low || depth < 1) return { from: low, rows: high - low }
    return { from: Math.min(low, depth - 1), rows: 1 }
  })
}

function sheetSize(layout, depth) {
  let width = 0
  let height = 0
  for (const [glyph, at] of layout) {
    width = Math.max(width, at.x + glyph.width)
    height = Math.max(height, at.down + depth)
  }
  return { width, height }
}

export function flatLayers(cells, capHeight, depth, layers, density = 1, wideStrips = false) {
  if (!layers || layers.length < 2) return flatPixels(cells, capHeight, depth, density, wideStrips)
  const slices = layerSlices(layers, depth)
  const bands = layers.map((_, layer) => flatPixels(cells.map(glyph => ({ ...glyph, mask: layerMask(glyph, layer) })), capHeight, slices[layer].rows, density, wideStrips, layerShade(layers, layer)))
  const data = new Uint8ClampedArray(bands.reduce((sum, band) => sum + band.data.length, 0))
  let at = 0
  for (const band of bands) {
    data.set(band.data, at)
    at += band.data.length
  }
  return { data, layout: sheetLayout(cells, capHeight, depth), width: bands[0].width, height: bands.reduce((sum, band) => sum + band.height, 0) }
}

export function bandLayouts(cells, capHeight, depth, layers) {
  let offset = 0
  return layerSlices(layers, depth).map(slice => {
    const layout = sheetLayout(cells, capHeight, slice.rows)
    const band = { ...slice, layout, offset }
    offset += sheetSize(layout, slice.rows).height
    return band
  })
}

export function expandBands(source, width, cells, capHeight, depth, layers) {
  const full = sheetLayout(cells, capHeight, depth)
  const size = sheetSize(full, depth)
  const density = width / size.width
  if (!Number.isInteger(density)) throw new Error(`an image ${width}px wide doesn't fit this font's ${size.width} unit wide sheet`)
  const bands = bandLayouts(cells, capHeight, depth, layers)
  const last = bands.at(-1)
  const units = last.offset + sheetSize(last.layout, last.rows).height
  if (source.length !== width * units * density * 4) throw new Error(`an image ${source.length / 4 / width}px tall doesn't hold this font's ${layers.length} layer bands, which are ${units * density}px tall`)
  const out = new Uint8ClampedArray(width * size.height * density * layers.length * 4)

  function row(from, to, x, columns) {
    const start = (from * width + x * density) * 4
    out.set(source.subarray(start, start + columns * density * 4), (to * width + x * density) * 4)
  }

  function rows(from, to, x, columns, count) {
    for (let j = 0; j < count * density; j++) row(from * density + j, to * density + j, x, columns)
  }

  function strip(from, to, x, columns, slice, place) {
    if (!slice.rows) return
    const first = from * density
    const end = (from + slice.rows) * density - 1
    for (let j = 0; j < depth * density; j++) {
      const inside = j - place * density
      row(inside < 0 ? first : Math.min(end, first + inside), to * density + j, x, columns)
    }
  }

  for (const [index, band] of bands.entries()) {
    const base = index * size.height
    for (const [glyph, at] of full) {
      const own = band.layout.get(glyph)
      rows(band.offset + own.up + band.rows, base + at.up + depth, at.x, glyph.width, own.down - own.up - band.rows)
      strip(band.offset + own.up, base + at.up, at.x, glyph.width, band, band.from)
      strip(band.offset + own.down, base + at.down, at.x, glyph.width, band, depth - band.from - band.rows)
    }
  }
  return { data: out, height: size.height * density * layers.length }
}

export function blankStrip(cells, capHeight, depth, layers, width) {
  const top = Math.max(capHeight, ...cells.map(cell => cell.top))
  const bottom = Math.min(0, ...cells.map(cell => cell.bottom))
  const bands = layers && layers.length > 1 ? layerSlices(layers, depth).map((slice, layer) => ({ rows: slice.rows, shade: layerShade(layers, layer) })) : [{ rows: depth, shade: 1 }]
  let colours = []
  for (const { rows, shade } of bands) {
    const [face, up, down] = [FACE, UP, DOWN].map(colour => colour.map(value => Math.round(value * shade)).concat(255))
    colours = colours.concat(Array(rows).fill(up), Array(top - bottom).fill(face), Array(rows).fill(down))
  }
  const data = new Uint8ClampedArray(width * colours.length * 4)
  colours.forEach((colour, row) => {
    for (let x = 0; x < width; x++) data.set(colour, (row * width + x) * 4)
  })
  return { data, width, height: colours.length }
}

export function flatPixels(cells, capHeight, depth, density = 1, wideStrips = false, shade = 1) {
  const layout = sheetLayout(cells, capHeight, depth)
  const { width, height } = sheetSize(layout, depth)
  const data = new Uint8ClampedArray(width * density * height * density * 4)
  const [face, up, down] = [FACE, UP, DOWN].map(colour => colour.map(value => Math.round(value * shade)))

  function paint(x, y, colour) {
    for (let j = 0; j < density; j++) {
      for (let i = 0; i < density; i++) {
        const at = ((y * density + j) * width * density + x * density + i) * 4
        data.set(colour, at)
        data[at + 3] = 255
      }
    }
  }

  for (const [glyph, at] of layout) {
    const solid = (row, column) => glyph.mask[row * glyph.width + column] === 1
    for (let r = 0; r < glyph.height; r++) {
      for (let c = 0; c < glyph.width; c++) if (solid(glyph.height - 1 - r, c)) paint(at.x + c, at.top + r, face)
    }
    const columns = stripColumns(glyph, capHeight)
    for (let c = 0; c < glyph.width; c++) {
      for (let r = 0; r < depth; r++) {
        if (wideStrips || columns.up.has(c)) paint(at.x + c, at.up + r, up)
        if (wideStrips || columns.down.has(c)) paint(at.x + c, at.down + r, down)
      }
    }
  }

  return { data, layout, width, height }
}
