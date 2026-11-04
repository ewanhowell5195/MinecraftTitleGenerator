export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function round(value, places) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
