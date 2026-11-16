import assert from "node:assert/strict"
import { encodeTitle } from "../../src/lib/link/linkformat.js"
import { FILE_VERSION } from "../../src/lib/settings/upgrades.js"
import { finishSignIn, receiveSignIn, startSignIn } from "../../src/server/accounts.js"
import { deletePreset, listPresets, renamePreset, submissionUsage, submitPreset } from "../../src/server/presets.js"
import { countDownload, votePreset } from "../../src/server/presetScores.js"
import { d1, database } from "./server.js"
import { assets } from "./site.js"

const realFetch = globalThis.fetch

export let db
export let env
export let calls

export function freshServer() {
  db = database()
  env = { DB: d1(db), ASSETS: { fetch: url => assets(String(url)) }, IP_SALT: "salt", SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "github-secret" }
}

export function restoreFetch() {
  globalThis.fetch = realFetch
}

export function code(lines, version = FILE_VERSION) {
  return encodeTitle({ version, lines }).code
}

export function context(path, { ip = "1.1.1.1", body, params = {}, method = "GET" } = {}) {
  const request = new Request(`https://example.test${path}`, { method, headers: { "CF-Connecting-IP": ip }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { request, env, params }
}

export async function post(body, ip) {
  const response = await submitPreset(context("/api/presets", { method: "POST", body, ip }))
  return { status: response.status, ...await response.json() }
}

export async function list(query = "", ip) {
  const response = await listPresets(context(`/api/presets${query}`, { ip }))
  return { status: response.status, ...await response.json() }
}

export async function vote(id, value, ip) {
  const response = await votePreset(context(`/api/presets/${id}/vote`, { method: "POST", body: { value }, ip, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

export async function voteAll(id, values) {
  for (const [index, value] of values.entries()) await vote(id, value, `voter ${index}`)
}

export async function usageOf(ip) {
  const response = await submissionUsage(context("/api/presets/usage", { ip }))
  return { status: response.status, ...await response.json() }
}

export async function download(id, ip) {
  const response = await countDownload(context(`/api/presets/${id}/download`, { method: "POST", ip, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

export async function share(text, extra = {}, ip = `${Math.random()}`) {
  return (await post({ code: code([{ text }]), name: `${text} title`, ...extra }, ip)).preset
}

export function withCookie(path, cookie, options = {}) {
  const made = context(path, options)
  made.request = new Request(made.request, { headers: { "CF-Connecting-IP": options.ip ?? "1.1.1.1", Cookie: cookie } })
  return made
}

export function stubProvider(profile, token = { access_token: "token" }) {
  calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    const body = options?.method === "POST" ? token : String(url).endsWith("/user/emails") ? [] : profile
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  }
}

export function cookiePair(response, name) {
  return response.headers.getSetCookie().find(line => line.startsWith(`${name}=`)).split(";")[0]
}

export async function begin(provider = "discord", origin = "https://mctitlegenerator.com") {
  const response = await startSignIn(context(`/api/account/login/${provider}?return=${encodeURIComponent(origin)}`, { params: { provider } }))
  return { response, state: new URL(response.headers.get("Location")).searchParams.get("state"), cookie: cookiePair(response, "signin_state") }
}

export function atProvider(provider, query) {
  return receiveSignIn(context(`/api/account/login/${provider}/callback?${new URLSearchParams(query)}`, { params: { provider } }))
}

export function finishing(location, cookie, provider = "discord") {
  const { pathname, search } = new URL(location)
  return finishSignIn(withCookie(`${pathname}${search}`, cookie, { params: { provider } }))
}

export async function signIn(provider = "discord", profile = { id: "1234", username: "someone", global_name: "Fake Name" }) {
  stubProvider(profile)
  const { state, cookie } = await begin(provider)
  const back = await atProvider(provider, { code: "abc", state })
  const response = await finishing(back.headers.get("Location"), cookie, provider)
  assert.equal(response.status, 200)
  return cookiePair(response, "session")
}

export async function shareAs(cookie, text, extra = {}, ip = "1.1.1.1") {
  const response = await submitPreset(withCookie("/api/presets", cookie, { method: "POST", body: { code: code([{ text }]), ...extra }, ip }))
  return { status: response.status, ...await response.json() }
}

export async function rename(cookie, id, name) {
  const made = withCookie(`/api/presets/${id}`, cookie, { method: "PATCH", body: { name }, params: { id: String(id) } })
  const response = await renamePreset(made)
  return { status: response.status, ...await response.json() }
}

export async function remove(cookie, id) {
  return (await deletePreset(withCookie(`/api/presets/${id}`, cookie, { method: "DELETE", params: { id: String(id) } }))).status
}

export async function usageAs(cookie, ip = "1.1.1.1") {
  return (await submissionUsage(withCookie("/api/presets/usage", cookie, { ip }))).json()
}

export function rowsEverywhere() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(table => table.name)
  return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total]).filter(([, total]) => total))
}
