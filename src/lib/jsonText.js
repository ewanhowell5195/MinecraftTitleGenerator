const INDENT = "  "
const FLAT_ITEMS = new Set(["overlays", "lines"])

function plain(value) {
  return value === null || typeof value !== "object"
}

function entriesOf(value) {
  return Object.entries(value).filter(([, item]) => item !== undefined)
}

function oneLine(value) {
  if (plain(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(oneLine).join(", ")}]`
  const entries = entriesOf(value)
  return entries.length ? `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${oneLine(item)}`).join(", ")} }` : "{}"
}

function layout(value, indent, key) {
  if (plain(value)) return JSON.stringify(value)
  const inner = indent + INDENT
  if (Array.isArray(value)) {
    if (value.every(plain)) return oneLine(value)
    return `[\n${value.map(item => inner + (FLAT_ITEMS.has(key) ? oneLine(item) : layout(item, inner, null))).join(",\n")}\n${indent}]`
  }
  const entries = entriesOf(value)
  if (!entries.length) return "{}"
  return `{\n${entries.map(([name, item]) => `${inner}${JSON.stringify(name)}: ${layout(item, inner, name)}`).join(",\n")}\n${indent}}`
}

export function jsonText(value) {
  return layout(value, "", null)
}
