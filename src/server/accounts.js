import { LIMITS } from "../lib/limits.js"
import { ACCOUNT_CHANNEL, PROVIDERS, SIGN_IN_RETURN } from "../lib/providers.js"
import { APP_ORIGINS, Refusal, USER_AGENT, escaped, guarded, hashed, hex, randomToken, reply, setting } from "./http.js"

const SESSION_COOKIE = "session"
const SESSION_PATH = "/api"
const SESSION_SECONDS = 90 * 86400
const STATE_COOKIE = "signin_state"
const STATE_PATH = "/api/account/login"
const STATE_SECONDS = 600
const HANDOFF_SECONDS = 60
// must match the one redirect URL registered with each provider
const CALLBACK_ORIGIN = "https://mctitlegenerator.com"

const ENDPOINTS = {
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    profile: "https://discord.com/api/v10/users/@me",
    scope: "identify email",
    person: user => ({ id: user.id, name: user.username, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`, email: user.email })
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    profile: "https://api.github.com/user",
    emails: "https://api.github.com/user/emails",
    scope: "user:email",
    person: user => ({ id: String(user.id), name: user.login, avatar: `https://avatars.githubusercontent.com/u/${user.id}?s=64` })
  }
}

const KEEPS_EMAIL = "(users.admin = 1 OR EXISTS (SELECT 1 FROM submissions WHERE submissions.user_id = users.id) OR EXISTS (SELECT 1 FROM notifications WHERE notifications.user_id = users.id AND notifications.emailed = 0))"

function providerOf(env, params) {
  const provider = PROVIDERS.find(({ id }) => id === params.provider)
  if (!provider) throw new Refusal(404, "That isn't a way to sign in.")
  const prefix = provider.id.toUpperCase()
  return { ...provider, ...ENDPOINTS[provider.id], clientId: setting(env, `${prefix}_CLIENT_ID`), secret: setting(env, `${prefix}_CLIENT_SECRET`) }
}

function callbackUrl(provider) {
  return `${CALLBACK_ORIGIN}${STATE_PATH}/${provider.id}/callback`
}

function returnOrigin(request) {
  const url = new URL(request.url)
  const origin = url.searchParams.get("return") ?? url.origin
  if (!APP_ORIGINS.some(allowed => allowed.test(origin))) throw new Refusal(400, "You can't sign in from this address.")
  return origin
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", ...headers } })
}

function cookieValue(request, name) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, value] = part.trim().split("=")
    if (key === name) return value
  }
  return null
}

function cookie(name, value, seconds, path) {
  return `${name}=${value}; Path=${path}; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`
}

function sessionKey(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(setting(env, "SESSION_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

async function signed(env, purpose, seconds, data) {
  const payload = encodeURIComponent(JSON.stringify({ ...data, purpose, expires: Date.now() + seconds * 1000 }))
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(env), new TextEncoder().encode(payload))
  return `${payload}.${hex(signature)}`
}

function bytesOf(hexText) {
  return Uint8Array.from(hexText.match(/../g) ?? [], pair => parseInt(pair, 16))
}

async function verified(env, purpose, value) {
  if (!value) return null
  const split = value.lastIndexOf(".")
  const payload = value.slice(0, split)
  const valid = split > 0 && await crypto.subtle.verify("HMAC", await sessionKey(env), bytesOf(value.slice(split + 1)), new TextEncoder().encode(payload))
  if (!valid) return null
  const data = JSON.parse(decodeURIComponent(payload))
  return data.purpose === purpose && data.expires > Date.now() ? data : null
}

function page(status, heading, message, script = "") {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escaped(heading)}</title></head><body style="padding: 40px 20px; font-family: sans-serif; text-align: center"><h1 style="font-size: 20px">${escaped(heading)}</h1><p>${escaped(message)}</p><a href="/app/">Back to the generator</a>${script}</body></html>`
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

function leaveScript(before = "") {
  return `<script>${before}const back=sessionStorage.getItem("${SIGN_IN_RETURN}");sessionStorage.removeItem("${SIGN_IN_RETURN}");if(back)location.replace(back);else window.close()</script>`
}

function showingRefusals(handler) {
  return guarded(handler, err => page(err.status, "Couldn't sign in", err.message))
}

async function providerJson(provider, url, options) {
  const response = await fetch(url, { ...options, headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...options.headers } })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || body.error) throw new Refusal(502, `${provider.label} couldn't sign you in: ${body?.error_description ?? body?.error ?? response.status}`)
  return body
}

async function fetchPerson(provider, code) {
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(provider), client_id: provider.clientId, client_secret: provider.secret })
  const { access_token: token } = await providerJson(provider, provider.token, { method: "POST", body: form })
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  const person = provider.person(await providerJson(provider, provider.profile, auth))
  const email = provider.emails ? (await providerJson(provider, provider.emails, auth)).find(entry => entry.primary)?.email : person.email
  return { id: person.id, name: Array.from(person.name).slice(0, LIMITS.name).join(""), avatar: person.avatar, email: email ?? "" }
}

function shownUser(user) {
  return user && { id: user.id, name: user.name, provider: user.provider, avatar: user.avatar }
}

export const USER_ROW = "(SELECT id FROM users WHERE provider = ? AND provider_id = ?)"

export async function signedInUser({ request, env }) {
  const session = await verified(env, "session", cookieValue(request, SESSION_COOKIE))
  return session && { id: session.id, name: session.name, provider: session.provider, avatar: session.avatar ?? null, email: session.email, issued: session.issued ?? 0, providerId: session.id.slice(session.provider.length + 1) }
}

export function accountKey(env, purpose, user) {
  return hashed(`${setting(env, "SESSION_SECRET")}:${purpose}:${user.id}`)
}

async function deletedSince(env, user) {
  const row = await env.DB.prepare("SELECT deleted_at AS deletedAt FROM deleted_accounts WHERE account_hash = ?").bind(await accountKey(env, "deleted", user)).first()
  return !!row && user.issued <= row.deletedAt
}

export async function activeUser(context) {
  const user = await signedInUser(context)
  if (user && await deletedSince(context.env, user)) throw new Refusal(401, "This account has been deleted. Sign in again to make a new one.", { "Set-Cookie": clearedSession() })
  return user
}

export async function requireUser(context, message, find = signedInUser) {
  const user = await find(context)
  if (!user) throw new Refusal(401, message)
  return user
}

export async function forgetSessions(env, user) {
  const now = Date.now()
  return [
    env.DB.prepare("INSERT INTO deleted_accounts (account_hash, deleted_at) VALUES (?, ?) ON CONFLICT (account_hash) DO UPDATE SET deleted_at = excluded.deleted_at").bind(await accountKey(env, "deleted", user), now),
    env.DB.prepare("DELETE FROM deleted_accounts WHERE deleted_at < ?").bind(now - SESSION_SECONDS * 1000)
  ]
}

export function rememberUser(env, user) {
  return env.DB.prepare(`UPDATE users SET name = ?, email = CASE WHEN ${KEEPS_EMAIL} THEN NULLIF(?, '') END WHERE provider = ? AND provider_id = ?`).bind(user.name, user.email ?? "", user.provider, user.providerId)
}

export function forgetEmail(env, userId) {
  return env.DB.prepare(`UPDATE users SET email = NULL WHERE id = ? AND NOT ${KEEPS_EMAIL}`).bind(userId)
}

export function forgetSpareEmails(env) {
  return env.DB.prepare(`UPDATE users SET email = NULL WHERE email IS NOT NULL AND NOT ${KEEPS_EMAIL}`)
}

export function saveUser(env, user) {
  return env.DB.prepare("INSERT INTO users (provider, provider_id, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (provider, provider_id) DO UPDATE SET name = excluded.name WHERE name != excluded.name").bind(user.provider, user.providerId, user.name, Date.now())
}

export async function isAdmin(env, user) {
  if (!user) return false
  return !!(await env.DB.prepare("SELECT admin FROM users WHERE provider = ? AND provider_id = ?").bind(user.provider, user.providerId).first())?.admin
}

export function forgetUnusedUser(env, user) {
  return env.DB.prepare("DELETE FROM users WHERE provider = ? AND provider_id = ? AND admin = 0 AND NOT EXISTS (SELECT 1 FROM presets WHERE presets.user_id = users.id) AND NOT EXISTS (SELECT 1 FROM submissions WHERE submissions.user_id = users.id) AND NOT EXISTS (SELECT 1 FROM notifications WHERE notifications.user_id = users.id)").bind(user.provider, user.providerId)
}

export const startSignIn = showingRefusals(async ({ request, env, params }) => {
  const provider = providerOf(env, params)
  const origin = returnOrigin(request)
  const nonce = randomToken()
  const url = new URL(provider.authorize)
  url.search = new URLSearchParams({ client_id: provider.clientId, response_type: "code", redirect_uri: callbackUrl(provider), scope: provider.scope, state: await signed(env, "state", STATE_SECONDS, { origin, nonce }) })
  return redirect(url.href, { "Set-Cookie": cookie(STATE_COOKIE, nonce, STATE_SECONDS, STATE_PATH) })
})

export const receiveSignIn = showingRefusals(async ({ request, env, params }) => {
  const provider = providerOf(env, params)
  const url = new URL(request.url)
  const state = await verified(env, "state", url.searchParams.get("state"))
  if (!state) throw new Refusal(400, "This sign-in has expired. Close this window and try again.")
  const finish = `${state.origin}${STATE_PATH}/${provider.id}/finish`
  const problem = url.searchParams.get("error")
  if (problem === "access_denied") return redirect(`${finish}?cancelled=1`)
  if (problem) throw new Refusal(502, `${provider.label} couldn't sign you in: ${url.searchParams.get("error_description") ?? problem}`)
  const code = url.searchParams.get("code")
  if (!code) throw new Refusal(400, "This sign-in has expired. Close this window and try again.")
  const person = await fetchPerson(provider, code)
  return redirect(`${finish}?${new URLSearchParams({ handoff: await signed(env, "handoff", HANDOFF_SECONDS, { ...person, nonce: state.nonce }) })}`)
})

export const finishSignIn = showingRefusals(async ({ request, env, params }) => {
  const provider = providerOf(env, params)
  const url = new URL(request.url)
  if (url.searchParams.get("cancelled")) return page(200, "Sign-in cancelled", "You can close this window.", leaveScript())
  const handoff = await verified(env, "handoff", url.searchParams.get("handoff"))
  if (!handoff || handoff.nonce !== cookieValue(request, STATE_COOKIE)) throw new Refusal(400, "This sign-in has expired. Close this window and try again.")
  const id = `${provider.id}:${handoff.id}`
  const session = await signed(env, "session", SESSION_SECONDS, { id, name: handoff.name, provider: provider.id, avatar: handoff.avatar, email: handoff.email, issued: Date.now() })
  await rememberUser(env, { name: handoff.name, email: handoff.email, provider: provider.id, providerId: handoff.id }).run()
  const response = page(200, "You're signed in", "You can close this window.", leaveScript(`new BroadcastChannel("${ACCOUNT_CHANNEL}").postMessage("changed");`))
  response.headers.append("Set-Cookie", cookie(SESSION_COOKIE, session, SESSION_SECONDS, SESSION_PATH))
  response.headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0, STATE_PATH))
  return response
})

async function submissionCounts(env, user, admin) {
  const row = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM notifications WHERE seen = 0 AND user_id = ${USER_ROW}) AS unread, (SELECT COUNT(*) FROM notifications WHERE user_id = ${USER_ROW}) AS notifications, (SELECT COUNT(*) FROM submissions WHERE user_id = ${USER_ROW}) AS submissions, (SELECT COUNT(*) FROM submissions WHERE status = 'open' AND ?) AS waiting`).bind(user.provider, user.providerId, user.provider, user.providerId, user.provider, user.providerId, admin ? 1 : 0).first()
  return { unread: row?.unread ?? 0, notifications: row?.notifications ?? 0, submissions: row?.submissions ?? 0, waiting: row?.waiting ?? 0 }
}

export const accountDetails = guarded(async context => {
  const providers = PROVIDERS.map(({ id }) => id).filter(id => context.env[`${id.toUpperCase()}_CLIENT_ID`])
  const user = await signedInUser(context)
  if (user && await deletedSince(context.env, user)) return reply(200, { user: null, providers }, { "Set-Cookie": clearedSession() })
  const admin = !!user && await isAdmin(context.env, user)
  return reply(200, { user: user && { ...shownUser(user), ...await submissionCounts(context.env, user, admin), admin }, providers })
})

export function clearedSession() {
  return cookie(SESSION_COOKIE, "", 0, SESSION_PATH)
}

export const signOut = guarded(async () => reply(200, { user: null }, { "Set-Cookie": clearedSession() }))
