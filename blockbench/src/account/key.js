const STORAGE = "minecraft_title_generator_key"

let key = localStorage.getItem(STORAGE)
let pending = null

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
}

export function keyHeaders() {
  const used = pending ?? key
  return used ? { Authorization: `Bearer ${used}` } : {}
}

export async function startKey() {
  pending = hex(crypto.getRandomValues(new Uint8Array(32)))
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pending))))
}

export function keepKey() {
  key = pending
  pending = null
  localStorage.setItem(STORAGE, key)
}

export function dropKey() {
  pending = null
}

export function forgetKey() {
  if (pending) return
  key = null
  localStorage.removeItem(STORAGE)
}
