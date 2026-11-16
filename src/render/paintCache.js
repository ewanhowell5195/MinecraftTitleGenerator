export function createPaintCache() {
  const paintCache = new Map()
  let paintUsed = new Set()
  let paintKept = new Set()

  function sweepPaints() {
    for (const key of paintCache.keys()) if (!paintUsed.has(key) && !paintKept.has(key)) paintCache.delete(key)
    paintKept = paintUsed
    paintUsed = new Set()
  }

  function remembered(key, make, sharp) {
    paintUsed.add(key)
    if (paintCache.has(key)) return paintCache.get(key)
    const made = make()
    if (!sharp) paintCache.set(key, made)
    return made
  }

  return { sweepPaints, remembered }
}
