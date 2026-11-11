import { USER_AGENT, bodyBytes, setting } from "./http.js"

const API = "https://api.github.com"
const REPOSITORY = "ewanhowell5195/MinecraftTitleGenerator"
const TOKEN_MARGIN = 120000
const WEBHOOK_BYTES = 5000000
const RSA_ALGORITHM = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]

let cached = null

export class GitHubError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function repository(env) {
  return env.GITHUB_REPOSITORY ?? REPOSITORY
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64(bytes) {
  let text = ""
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return btoa(text)
}

function fromBase64(text) {
  return Uint8Array.from(atob(text.replace(/\s/g, "")), character => character.charCodeAt(0))
}

function derLength(length) {
  if (length < 0x80) return [length]
  const bytes = []
  for (let rest = length; rest; rest >>= 8) bytes.unshift(rest & 0xff)
  return [0x80 | bytes.length].concat(bytes)
}

function der(tag, bytes) {
  return [tag].concat(derLength(bytes.length), Array.from(bytes))
}

function pkcs8(pem) {
  const body = fromBase64(pem.replace(/-----[^-]+-----/g, "").replace(/\\n/g, ""))
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return body
  return new Uint8Array(der(0x30, [0x02, 0x01, 0x00].concat(RSA_ALGORITHM, der(0x04, body))))
}

async function appJwt(env) {
  const key = await crypto.subtle.importKey("pkcs8", pkcs8(setting(env, "GITHUB_APP_KEY")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
  const now = Math.floor(Date.now() / 1000)
  const encode = value => base64Url(new TextEncoder().encode(JSON.stringify(value)))
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: setting(env, "GITHUB_APP_ID") })}`
  return `${unsigned}.${base64Url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)))}`
}

async function send(env, path, token, { method = "GET", body, accept = "application/vnd.github+json" } = {}) {
  const response = await fetch(`${env.GITHUB_API ?? API}${path}`, {
    method,
    headers: { Accept: accept, Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28", ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) throw new GitHubError(response.status, `GitHub ${method} ${path} failed: ${response.status} ${await response.text()}`)
  return response
}

async function installationToken(env) {
  if (cached && cached.env === env && cached.expires - Date.now() > TOKEN_MARGIN) return cached.token
  const jwt = await appJwt(env)
  const { id } = await (await send(env, `/repos/${repository(env)}/installation`, jwt)).json()
  const { token, expires_at } = await (await send(env, `/app/installations/${id}/access_tokens`, jwt, { method: "POST", body: {} })).json()
  cached = { env, token, expires: Date.parse(expires_at) }
  return token
}

export async function github(env, path, { raw = false, ...options } = {}) {
  const response = await send(env, path.startsWith("/") ? path : `/repos/${repository(env)}/${path}`, await installationToken(env), raw ? { ...options, accept: "application/vnd.github.raw+json" } : options)
  if (raw) return new Uint8Array(await response.arrayBuffer())
  return response.status === 204 ? null : response.json()
}

export async function verifiedWebhook(env, request) {
  const body = new TextDecoder().decode(await bodyBytes(request, WEBHOOK_BYTES))
  const signature = request.headers.get("X-Hub-Signature-256") ?? ""
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(setting(env, "GITHUB_WEBHOOK_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
  const hex = signature.startsWith("sha256=") ? signature.slice(7) : ""
  if (!/^[0-9a-f]{64}$/.test(hex)) return null
  const bytes = Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16))
  return await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body)) ? JSON.parse(body) : null
}
