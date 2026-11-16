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
  return layers?.length > 1 ? 1 - layer / layers.length : 1
}

export function independentLayers(font) {
  return font?.layerDepth === "independent"
}

export function layerMask(glyph, layer, independent = false) {
  return glyph.depths ? glyph.mask.map((solid, at) => solid && (independent ? glyph.depths[at] === layer : glyph.depths[at] <= layer) ? 1 : 0) : glyph.mask
}

export function layerGlyph(glyph, layer, independent = false) {
  return { ...glyph, mask: layerMask(glyph, layer, independent), caster: glyph.depths && layer > 0 ? layerMask(glyph, layer - 1) : null, clips: undefined }
}

export function layerCell(glyph, layer, independent = false) {
  const mask = layerMask(glyph, layer, independent)
  let low = glyph.height
  let high = -1
  let left = glyph.width
  let right = -1
  for (let row = 0; row < glyph.height; row++) {
    for (let column = 0; column < glyph.width; column++) {
      if (!mask[row * glyph.width + column]) continue
      low = Math.min(low, row)
      high = row
      left = Math.min(left, column)
      right = Math.max(right, column)
    }
  }
  if (high < low) return { ...glyph, source: glyph, mask: new Uint8Array(0), depths: null, width: 0, height: 0, left: 0, bottom: glyph.top }
  const width = right - left + 1
  const height = high - low + 1
  function crop(values) {
    const out = new values.constructor(width * height)
    for (let row = 0; row < height; row++) out.set(values.subarray((low + row) * glyph.width + left, (low + row) * glyph.width + left + width), row * width)
    return out
  }
  return { ...glyph, source: glyph, mask: crop(mask), depths: glyph.depths ? crop(glyph.depths) : null, width, height, left, bottom: glyph.bottom + low, top: glyph.bottom + high + 1 }
}

export function layerRange(cells, layer, independent = false) {
  const shown = cells.filter(cell => cell.width).map(cell => layerCell(cell, layer, independent)).filter(cell => cell.height)
  return { top: Math.max(...shown.map(cell => cell.top)), bottom: Math.min(...shown.map(cell => cell.bottom)) }
}

export function layerLeft(glyph, layer, independent = false) {
  if (layer === null || !glyph.depths) return 0
  const mask = layerMask(glyph, layer, independent)
  for (let column = 0; column < glyph.width; column++) {
    for (let row = 0; row < glyph.height; row++) {
      if (mask[row * glyph.width + column]) return column
    }
  }
  return 0
}

export function layerSlices(layers, depth, independent = false) {
  if (independent) return layers.map(value => ({ from: 0, rows: Math.max(1, Math.round(value * depth)) }))
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

export function flatLayers(cells, capHeight, depth, layers, density = 1, wideStrips = false, independent = false) {
  if (!layers || layers.length < 2) return flatPixels(cells, capHeight, depth, density, wideStrips)
  const slices = layerSlices(layers, depth, independent)
  const bands = layers.map((_, layer) => flatPixels(cells.map(glyph => layerCell(glyph, layer, independent)), capHeight, slices[layer].rows, density, wideStrips, layerShade(layers, layer), true))
  const width = Math.max(...bands.map(band => band.width))
  const line = width * density * 4
  const data = new Uint8ClampedArray(line * bands.reduce((sum, band) => sum + band.height, 0) * density)
  let at = 0
  for (const band of bands) {
    const own = band.width * density * 4
    for (let row = 0; row < band.height * density; row++) data.set(band.data.subarray(row * own, (row + 1) * own), (at + row) * line)
    at += band.height * density
  }
  return { data, layout: sheetLayout(cells, capHeight, depth), width, height: bands.reduce((sum, band) => sum + band.height, 0) }
}

export function bandLayouts(cells, capHeight, depth, layers, independent = false) {
  let offset = 0
  return layerSlices(layers, depth, independent).map((slice, layer) => {
    const fitted = sheetLayout(cells.map(glyph => layerCell(glyph, layer, independent)), capHeight, slice.rows, true)
    const layout = new Map(Array.from(fitted, ([cell, at]) => [cell.source, { ...at, x: at.x - cell.left, left: cell.left, columns: cell.width, top: at.top - cell.source.top + cell.top, rise: at.top - at.up - slice.rows + cell.top }]))
    const size = sheetSize(fitted, slice.rows)
    const band = { ...slice, layout, offset, width: size.width }
    offset += size.height
    return band
  })
}

export function expandBands(source, width, cells, capHeight, depth, layers, independent = false) {
  const full = sheetLayout(cells, capHeight, depth)
  const size = sheetSize(full, depth)
  const bands = bandLayouts(cells, capHeight, depth, layers, independent)
  const compact = Math.max(...bands.map(band => band.width))
  const density = width / compact
  if (!Number.isInteger(density)) throw new Error(`an image ${width}px wide doesn't fit this font's ${compact} unit wide layer bands`)
  const last = bands.at(-1)
  const units = last.offset + sheetSize(last.layout, last.rows).height
  if (source.length !== width * units * density * 4) throw new Error(`an image ${source.length / 4 / width}px tall doesn't hold this font's ${layers.length} layer bands, which are ${units * density}px tall`)
  const wide = size.width * density
  const out = new Uint8ClampedArray(wide * size.height * density * layers.length * 4)

  function row(from, to, fromX, toX, columns) {
    const start = (from * width + fromX * density) * 4
    out.set(source.subarray(start, start + columns * density * 4), (to * wide + toX * density) * 4)
  }

  function rows(from, to, fromX, toX, columns, count) {
    for (let j = 0; j < count * density; j++) row(from * density + j, to * density + j, fromX, toX, columns)
  }

  function strip(from, to, fromX, toX, columns, slice, place) {
    if (!slice.rows) return
    const first = from * density
    const end = (from + slice.rows) * density - 1
    for (let j = 0; j < depth * density; j++) {
      const inside = j - place * density
      row(inside < 0 ? first : Math.min(end, first + inside), to * density + j, fromX, toX, columns)
    }
  }

  for (const [index, band] of bands.entries()) {
    const base = index * size.height
    for (const [glyph, at] of full) {
      const own = band.layout.get(glyph)
      if (!own.columns) continue
      const fromX = own.x + own.left
      const toX = at.x + own.left
      rows(band.offset + own.up + band.rows, base + at.top + glyph.top - own.rise, fromX, toX, own.columns, own.down - own.up - band.rows)
      strip(band.offset + own.up, base + at.up, fromX, toX, own.columns, band, band.from)
      strip(band.offset + own.down, base + at.down, fromX, toX, own.columns, band, depth - band.from - band.rows)
    }
  }
  return { data: out, width: wide, height: size.height * density * layers.length }
}

export function blankStrip(cells, capHeight, depth, layers, width, independent = false) {
  const top = Math.max(capHeight, ...cells.map(cell => cell.top))
  const bottom = Math.min(0, ...cells.map(cell => cell.bottom))
  const bands = layers && layers.length > 1 ? layerSlices(layers, depth, independent).map((slice, layer) => ({ rows: slice.rows, shade: layerShade(layers, layer), ...layerRange(cells, layer, independent) })) : [{ rows: depth, shade: 1, top, bottom }]
  let colours = []
  for (const band of bands) {
    const [face, up, down] = [FACE, UP, DOWN].map(colour => colour.map(value => Math.round(value * band.shade)).concat(255))
    colours = colours.concat(Array(band.rows).fill(up), Array(band.top - band.bottom).fill(face), Array(band.rows).fill(down))
  }
  const data = new Uint8ClampedArray(width * colours.length * 4)
  colours.forEach((colour, row) => {
    for (let x = 0; x < width; x++) data.set(colour, (row * width + x) * 4)
  })
  return { data, width, height: colours.length }
}

export function flatPixels(cells, capHeight, depth, density = 1, wideStrips = false, shade = 1, fit = false) {
  const layout = sheetLayout(cells, capHeight, depth, fit)
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
