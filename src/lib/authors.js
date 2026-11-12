export const AUTHOR_LIMITS = { name: 40, names: 10 }

const JOINED = /\s*(?:,\s*&|,|&)\s*/

function same(a, b) {
  return a.toLowerCase() === b.toLowerCase()
}

export function authorList(value) {
  const names = Array.isArray(value) ? value : typeof value === "string" ? value.split(JOINED) : []
  const kept = []
  for (const name of names) {
    const text = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : ""
    if (text && !kept.some(item => same(item, text))) kept.push(text)
  }
  return kept
}

export function authorText(value) {
  const names = authorList(value)
  return names.length < 3 ? names.join(" & ") : `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}`
}
