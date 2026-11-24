import { shallowRef } from "vue"

const counts = shallowRef(new Map())

export async function loadCounts(...request) {
  const response = await fetch(...request)
  if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
  counts.value = new Map((await response.json()).map(entry => [entry.id, entry.count]))
}

export function popular(entries, id, label, pinned = []) {
  function rank(entry) {
    const at = pinned.indexOf(id(entry))
    return at === -1 ? pinned.length : at
  }
  return entries.slice().sort((a, b) => rank(a) - rank(b) || (counts.value.get(id(b)) ?? 0) - (counts.value.get(id(a)) ?? 0) || label(a).localeCompare(label(b)))
}

export function byUsage(entries, id) {
  return entries.slice().sort((a, b) => (counts.value.get(id(b)) ?? 0) - (counts.value.get(id(a)) ?? 0))
}

export function usage(ids) {
  return ids.reduce((total, id) => total + (counts.value.get(id) ?? 0), 0)
}
