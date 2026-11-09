function plain(value) {
  return value === null || typeof value !== "object"
}

export function jsonText(value, indent = "") {
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (value.every(plain)) return `[${value.map(item => JSON.stringify(item)).join(", ")}]`
    return `[\n${value.map(item => inner + jsonText(item, inner)).join(",\n")}\n${indent}]`
  }
  if (plain(value)) return JSON.stringify(value)
  const entries = Object.entries(value).filter(([, item]) => item !== undefined)
  if (!entries.length) return "{}"
  return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${jsonText(item, inner)}`).join(",\n")}\n${indent}}`
}
