import { LIMITS } from "../lib/limits.js"
import { PREVIEW_NOTICE, isPreviewHost } from "../lib/previewSite.js"

export const USER_AGENT = "MinecraftTitleGenerator"
export const APP_ORIGINS = [/^https:\/\/mctitlegenerator\.com$/, /^https:\/\/dev\.ewanhowell\.com$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/]
const READS = ["GET", "HEAD"]
const EDGE_SECONDS = 1800

export class Refusal extends Error {
  constructor(status, message, headers = {}) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

export function reply(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })
}

export const INVALID = "This request isn't valid."

export function setting(env, name) {
  if (!env[name]) throw new Error(`${name} is not set`)
  return env[name]
}

function fromAnotherSite(request) {
  const origin = request.headers.get("Origin")
  return origin !== null && !READS.includes(request.method) && origin !== new URL(request.url).origin && !APP_ORIGINS.some(allowed => allowed.test(origin))
}

export function guarded(handler, refused = err => reply(err.status, { error: err.message }, err.headers)) {
  return async context => {
    try {
      if (fromAnotherSite(context.request)) throw new Refusal(403, "This request came from another website, so it was refused.")
      if (!READS.includes(context.request.method) && isPreviewHost(new URL(context.request.url).hostname)) throw new Refusal(403, `${PREVIEW_NOTICE} Use mctitlegenerator.com for that.`)
      return await handler(context)
    } catch (err) {
      if (err instanceof Refusal) return refused(err)
      throw err
    }
  }
}

export function idParam(params, missing) {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id < 1) throw new Refusal(404, missing)
  return id
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

export async function bodyBytes(request, limit, tooBig = "This request is too big.") {
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) throw new Refusal(413, tooBig)
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Refusal(413, tooBig)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}

export async function jsonBody(request, limit = LIMITS.body) {
  const text = new TextDecoder().decode(await bodyBytes(request, limit))
  try {
    const body = JSON.parse(text)
    if (body && typeof body === "object" && !Array.isArray(body)) return body
  } catch {}
  throw new Refusal(400, INVALID)
}

function served(response, cacheControl) {
  const copy = new Response(response.body, response)
  copy.headers.set("Cache-Control", cacheControl)
  return copy
}

export async function cachedAtEdge(context, build, { seconds = EDGE_SECONDS, key = context.request.url, browser = "no-store" } = {}) {
  const cache = globalThis.caches?.default
  const stored = new Request(key)
  const hit = await cache?.match(stored)
  if (hit) return served(hit, browser)
  const response = await build()
  if (!response.ok) return response
  if (cache) {
    const shared = response.clone()
    shared.headers.set("Cache-Control", `public, max-age=${seconds}`)
    const saving = cache.put(stored, shared)
    if (context.waitUntil) context.waitUntil(saving)
    else await saving
  }
  return served(response, browser)
}
