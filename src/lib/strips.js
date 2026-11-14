import { layerSlices } from "./flatSheet.js"

export function stripFolder(id) {
  return `strips/${id}`
}

export function stripUse(item) {
  return typeof item === "string" ? { id: item, offset: 0, layer: null } : { offset: 0, layer: null, ...item }
}

export function stripItem(id, offset = 0, layer = null) {
  return offset || layer ? { id, ...(offset && { offset }), ...(layer && { layer }) } : id
}

export function stripPlacements(strips, id, count) {
  const placed = new Map()
  for (const use of strips.map(stripUse).filter(item => item.id === id)) {
    if (count > 1 && use.layer && use.layer <= count) placed.set(use.layer, use.offset)
    else for (let layer = 1; layer <= count; layer++) placed.set(layer, use.offset)
  }
  return placed
}

export function placedStrips(strips, id, placed, count, wholeFits = true) {
  const offsets = Array.from(placed.values())
  const whole = placed.size === count && offsets.every(offset => offset === offsets[0]) && (count === 1 || wholeFits)
  const items = whole ? [stripItem(id, offsets[0])] : Array.from(placed).sort(([a], [b]) => a - b).map(([layer, offset]) => stripItem(id, offset, layer))
  const at = strips.findIndex(item => stripUse(item).id === id)
  const others = strips.filter(item => stripUse(item).id !== id)
  const index = at < 0 ? others.length : strips.slice(0, at).filter(item => stripUse(item).id !== id).length
  return others.slice(0, index).concat(items, others.slice(index))
}

export function layerSlice(layers, layer) {
  const from = layers[layer + 1] ?? 0
  return { from, size: layers[layer] - from }
}

export function stackedStrip(shape, layers, layer) {
  const front = shape.rows - shape.depth * 2
  const heights = layerSlices(layers, shape.depth).map(slice => slice.rows * 2 + front)
  const depth = (heights[layer] - front) / 2
  return { shape: { ...shape, depth, rows: heights[layer] }, offset: heights.slice(0, layer).reduce((sum, rows) => sum + rows, 0), total: heights.reduce((sum, rows) => sum + rows, 0) }
}

export function centredOffset(height, capHeight) {
  return height && capHeight ? Math.floor((height - capHeight) / 2) : 0
}

export function stripOffset(entry, capHeight) {
  return centredOffset(entry.stripHeight, capHeight) + (entry.stripOffset ?? 0)
}

export function stripTag(set, offset = set.offset ?? 0) {
  return { stripSet: set.id, stripDepth: set.depth, stripBaseline: set.baseline ?? set.depth, stripOffset: offset, stripHeight: set.height ?? null, stripLayer: set.layer ? set.layer - 1 : null }
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
  const depth = entry.stripSet ? entry.stripDepth : fontDepth
  if (entry.stretch && entry.stripSet && !entry.stripHeight) throw new Error(`the ${entry.stripSet} strips need a height for stretching textures`)
  if (entry.stripSet && entry.stripHeight) {
    const offset = entry.stretch ? 0 : stripOffset(entry, capHeight)
    const top = entry.stripHeight - offset
    const bottom = entry.stripDepth - entry.stripBaseline - offset
    const shape = { depth, top, bottom, rows: depth * 2 + top - bottom }
    const lines = range?.lines ?? { base: 0, top: capHeight }
    return entry.stretch ? { ...shape, scale: { from: lines.top - lines.base, to: entry.stripHeight, base: lines.base } } : shape
  }
  const bottom = entry.stripSet ? entry.stripDepth - entry.stripBaseline - stripOffset(entry, capHeight) : range.bottom
  return { depth, top: range.top, bottom, rows: depth * 2 + range.top - bottom }
}

export const MISSING = [[248, 0, 248], [0, 0, 0]]

export function stripHasRow(shape, y) {
  const at = stripY(shape, y)
  return at >= shape.bottom && at < shape.top
}

export function stripY({ scale }, y) {
  if (!scale) return y
  const at = y - (scale.base ?? 0)
  if (at < 0) return at
  if (at >= scale.from) return at - scale.from + scale.to
  return Math.floor(at * scale.to / scale.from)
}
