export function random(seed) {
  let state = seed + 0x6d2b79f5 * 31 >>> 0
  return () => {
    state = state + 0x6d2b79f5 >>> 0
    let value = Math.imul(state ^ state >>> 15, state | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export function hashed(...values) {
  let hash = 0x811c9dc5
  for (const value of values) {
    hash = Math.imul(hash ^ (value | 0), 0x01000193)
    hash ^= hash >>> 13
    hash = Math.imul(hash, 0x5bd1e995)
    hash ^= hash >>> 15
  }
  return hash >>> 0
}
