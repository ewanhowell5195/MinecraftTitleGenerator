export function sameValue(a, b) {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export function plainCopy(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(item => item === undefined || typeof item === "function" ? null : plainCopy(item))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== "function").map(([key, item]) => [key, plainCopy(item)]))
  return value
}
