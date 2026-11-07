export function stripFolder(id) {
  return `strips/${id}`
}

function shared(data, set) {
  const tag = { folder: stripFolder(set.id), stripSet: set.id, stripDepth: set.depth, stripBaseline: set.baseline ?? set.depth }
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
  for (const set of sets) {
    for (const [id, data] of Object.entries(set.textures)) textures[id] ??= shared(data, set)
  }
  return { ...own, textures }
}

export function stripRows(entry, range, fontDepth) {
  const depth = entry.stripSet ? entry.stripDepth : fontDepth
  const bottom = entry.stripSet ? entry.stripDepth - entry.stripBaseline : range.bottom
  return { depth, top: range.top, bottom, rows: depth * 2 + range.top - bottom }
}
