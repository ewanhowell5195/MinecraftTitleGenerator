export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function lowest(values) {
  return values.reduce((least, value) => value < least ? value : least, Infinity)
}

export function highest(values) {
  return values.reduce((most, value) => value > most ? value : most, -Infinity)
}

export function round(value, places) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function mostCommon(values) {
  const tally = new Map()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  return Array.from(tally).sort((a, b) => b[1] - a[1])[0]?.[0]
}

export function remember(cache, key, make, limit) {
  if (cache.has(key)) return cache.get(key)
  const value = make()
  cache.set(key, value)
  if (cache.size > limit) cache.delete(cache.keys().next().value)
  return value
}
