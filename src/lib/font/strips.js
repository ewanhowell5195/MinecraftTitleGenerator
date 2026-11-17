import { layerRange, layerSlices } from "./flatSheet.js"

export function stripFolder(id) {
  return `strips/${id}`
}

export function stripUse(item) {
  return typeof item === "string" ? { id: item, layer: null } : { layer: null, ...item }
}

export const DEFAULT_STRIPS = "default"

export function withDefaultStrips(strips = []) {
  return strips.some(item => stripUse(item).id === DEFAULT_STRIPS) ? strips : [DEFAULT_STRIPS].concat(strips)
}

export function stripItem(id, layer = null) {
  return layer ? { id, layer } : id
}

export function stripPlacements(strips, id, count) {
  const placed = new Set()
  for (const use of strips.map(stripUse).filter(item => item.id === id)) {
    if (count > 1 && use.layer && use.layer <= count) placed.add(use.layer)
    else for (let layer = 1; layer <= count; layer++) placed.add(layer)
  }
  return placed
}

export function placedStrips(strips, id, placed, count) {
  const items = placed.size === count ? [id] : Array.from(placed).sort((a, b) => a - b).map(layer => stripItem(id, layer))
  const at = strips.findIndex(item => stripUse(item).id === id)
  const others = strips.filter(item => stripUse(item).id !== id)
  const index = at < 0 ? others.length : strips.slice(0, at).filter(item => stripUse(item).id !== id).length
  return others.slice(0, index).concat(items, others.slice(index))
}

export function layerSlice(layers, layer, independent = false) {
  if (independent) return { from: 0, size: layers[layer] }
  const from = layers[layer + 1] ?? 0
  return { from, size: layers[layer] - from }
}

export function stackedStrip(shape, layers, layer, cells, independent = false) {
  const slices = layerSlices(layers, shape.depth, independent)
  const ranges = slices.map((_, index) => layerRange(cells, index, independent))
  const heights = slices.map((slice, index) => slice.rows * 2 + ranges[index].top - ranges[index].bottom)
  return { shape: { ...shape, depth: slices[layer].rows, ...ranges[layer], rows: heights[layer] }, offset: heights.slice(0, layer).reduce((sum, rows) => sum + rows, 0), total: heights.reduce((sum, rows) => sum + rows, 0) }
}

export const STRIP_ANCHORS = ["top", "center", "base"]

export function anchorShift({ anchor = "center", snap, stripHeight }, capHeight) {
  if (!stripHeight || !capHeight || anchor === "base") return 0
  if (anchor === "top") return stripHeight - capHeight
  const grid = Math.max(1, Math.round(snap ?? 1))
  return Math.ceil((stripHeight - capHeight) / 2 / grid - 0.5) * grid
}

export function stripTag(set) {
  return { stripSet: set.id, stripDepth: set.depth, stripBaseline: set.baseline ?? set.depth, stripHeight: set.height ?? null, stripLayer: set.layer ? set.layer - 1 : null }
}

export function bandEntry(entry, band) {
  const own = entry.stripBands?.[band]
  return own ? { ...entry, ...own } : entry
}

export function stripCovers(entry, layer, count = 1) {
  if (entry.stripBands) return layer === null ? Object.keys(entry.stripBands).length >= count : String(layer) in entry.stripBands
  return entry.stripLayer == null || entry.stripLayer === layer
}

function placed(id, sets) {
  const found = sets.filter(item => item.id === id)
  const whole = found.find(item => !item.layer)
  if (whole || found.length < 2) return { set: whole ?? found[0], bands: null }
  return { set: found[0], bands: Object.fromEntries(found.map(item => [item.layer - 1, stripTag(item)])) }
}

function shared(data, set, bands = null) {
  const tag = { folder: stripFolder(set.id), ...stripTag(set), ...(bands && { stripLayer: null, stripBands: bands }) }
  const entry = { ...data, ...tag }
  if (data.variants) entry.variants = Object.fromEntries(Object.entries(data.variants).map(([id, variant]) => [id, { ...variant, ...tag }]))
  return entry
}

function attach(id, local, sets) {
  const { set, bands } = placed(local.strip, sets)
  if (!set) throw new Error(`${id} attaches to the strips ${local.strip}, which this font does not list`)
  if (!set.textures[id]) throw new Error(`${id} attaches to the strips ${local.strip}, which have no ${id}`)
  const { variants, strip, ...rest } = local
  const entry = shared(set.textures[id], set, bands)
  return { ...entry, ...rest, variants: { ...entry.variants, ...Object.fromEntries(Object.entries(variants ?? {}).map(([name, variant]) => [name, { ...variant, folder: null, stripSet: null }])) } }
}

export function mergeStrips(own, sets) {
  const textures = Object.fromEntries(Object.entries(own.textures).map(([id, entry]) => [id, entry.strip ? attach(id, entry, sets) : entry]))
  const taken = new Set(Object.entries(textures).flatMap(([id, entry]) => [id].concat(Object.keys(entry.variants ?? {}))))
  for (const setId of new Set(sets.map(item => item.id))) {
    const { set, bands } = placed(setId, sets)
    for (const [id, data] of Object.entries(set.textures)) {
      const ids = [id].concat(Object.keys(data.variants ?? {}))
      if (ids.some(name => taken.has(name))) continue
      textures[id] = shared(data, set, bands)
      for (const name of ids) taken.add(name)
    }
  }
  return { ...own, textures }
}

export function stripRows(entry, range, fontDepth, capHeight = null) {
  if (!entry.stripSet) return { depth: fontDepth, top: range.top, bottom: range.bottom, rows: fontDepth * 2 + range.top - range.bottom }
  if (!entry.stripHeight) throw new Error(`the ${entry.stripSet} strips need a height`)
  const depth = entry.stripDepth
  const shift = entry.stretch ? 0 : anchorShift(entry, capHeight)
  const top = entry.stripHeight - shift
  const bottom = entry.stripDepth - entry.stripBaseline - shift
  const shape = { depth, top, bottom, rows: depth * 2 + top - bottom }
  const lines = range?.lines ?? { base: 0, top: capHeight }
  return entry.stretch ? { ...shape, scale: { from: lines.top - lines.base, to: entry.stripHeight, base: lines.base } } : shape
}

export function safeRows({ scale, top, bottom }) {
  if (!scale) return { low: bottom, high: top }
  const base = scale.base ?? 0
  return { low: base + Math.ceil(bottom * scale.from / scale.to), high: base + scale.from }
}

export function stripY({ scale, top, bottom }, y) {
  const at = scale ? Math.floor((y - (scale.base ?? 0)) * scale.to / scale.from) : y
  return Math.min(Math.max(at, bottom), top - 1)
}
