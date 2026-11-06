import { LIMITS } from "../lib/limits.js"

export class Refusal extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function reply(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })
}

export function guarded(handler) {
  return async context => {
    try {
      return await handler(context)
    } catch (err) {
      if (err instanceof Refusal) return reply(err.status, { error: err.message })
      throw err
    }
  }
}

export function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")
}

export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashed(text) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
}

export function escaped(text) {
  return text.replace(/[&<>"]/g, character => `&#${character.charCodeAt(0)};`)
}

export function textField(body, key, label, limit) {
  const value = body[key] ?? ""
  if (typeof value !== "string") throw new Refusal(400, `The ${label} has to be text.`)
  const trimmed = value.trim()
  if (Array.from(trimmed).length > limit) throw new Refusal(400, `The ${label} can be up to ${limit} characters.`)
  return trimmed
}

export async function jsonBody(request, limit = LIMITS.body) {
  const text = await request.text()
  if (text.length > limit) throw new Refusal(413, "This request is too big.")
  try {
    const body = JSON.parse(text)
    if (body && typeof body === "object" && !Array.isArray(body)) return body
  } catch {}
  throw new Refusal(400, "This request isn't valid.")
}
