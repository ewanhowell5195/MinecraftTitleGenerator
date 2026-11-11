export function stripFolder(id) {
  return `strips/${id}`
}

export function stripUse(item) {
  return typeof item === "string" ? { id: item, offset: 0 } : { offset: 0, ...item }
}

export function centredOffset(height, capHeight) {
  return height && capHeight ? Math.floor((height - capHeight) / 2) : 0
}

export function stripOffset(entry, capHeight) {
  return centredOffset(entry.stripHeight, capHeight) + (entry.stripOffset ?? 0)
}

export function stripTag(set, offset = set.offset ?? 0) {
  return { stripSet: set.id, stripDepth: set.depth, stripBaseline: set.baseline ?? set.depth, stripOffset: offset, stripHeight: set.height ?? null }
}

function shared(data, set) {
  const tag = { folder: stripFolder(set.id), ...stripTag(set) }
  const entry = { ...data, ...tag }
  if (data.variants) entry.variants = Object.fromEntries(Object.entries(data.variants).map(([id, variant]) => [id, { ...variant, ...tag }]))
  return entry
}

function attach(id, local, sets) {
  const set = sets.find(item => item.id === local.strip)
  if (!set) throw new Error(`${id} attaches to the strips ${local.strip}, which this font does not list`)
  if (!set.textures[id]) throw new Error(`${id} attaches to the strips ${local.strip}, which have no ${id}`)
  const { variants, strip, ...rest } = local
  const entry = shared(set.textures[id], set)
  return { ...entry, ...rest, variants: { ...entry.variants, ...Object.fromEntries(Object.entries(variants ?? {}).map(([name, variant]) => [name, { ...variant, folder: null, stripSet: null }])) } }
}

export function mergeStrips(own, sets) {
  const textures = Object.fromEntries(Object.entries(own.textures).map(([id, entry]) => [id, entry.strip ? attach(id, entry, sets) : entry]))
  const taken = new Set(Object.entries(textures).flatMap(([id, entry]) => [id].concat(Object.keys(entry.variants ?? {}))))
  for (const set of sets) {
    for (const [id, data] of Object.entries(set.textures)) {
      const ids = [id].concat(Object.keys(data.variants ?? {}))
      if (ids.some(name => taken.has(name))) continue
      textures[id] = shared(data, set)
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
    return entry.stretch ? { ...shape, scale: { from: capHeight, to: entry.stripHeight } } : shape
  }
  const bottom = entry.stripSet ? entry.stripDepth - entry.stripBaseline - stripOffset(entry, capHeight) : range.bottom
  return { depth, top: range.top, bottom, rows: depth * 2 + range.top - bottom }
}

export function stripY({ scale }, y) {
  if (!scale || y < 0) return y
  if (y >= scale.from) return y - scale.from + scale.to
  return Math.floor(y * scale.to / scale.from)
}
