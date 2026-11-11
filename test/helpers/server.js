import { createHmac, generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { finishSignIn, receiveSignIn, startSignIn } from "../../src/server/accounts.js"
import { createSubmission, editSubmission, receiveWebhook, submissionDetails } from "../../src/server/submissions.js"
import { fakeGitHub } from "./fakeGitHub.js"
import { assets } from "./site.js"

export const REPO = "owner/repo"
export const API = "https://github.test"
const SITE = "https://mctitlegenerator.com"
const realFetch = globalThis.fetch

let keys
let server

export function d1(sqlite) {
  function statement(sql, values = []) {
    return {
      bind: (...next) => statement(sql, next),
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
      execute() {
        return /RETURNING/.test(sql) ? { results: sqlite.prepare(sql).all(...values) } : { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }
      }
    }
  }
  return {
    prepare: sql => statement(sql),
    batch: async statements => {
      sqlite.exec("BEGIN")
      try {
        const results = statements.map(item => item.execute())
        sqlite.exec("COMMIT")
        return results
      } catch (err) {
        sqlite.exec("ROLLBACK")
        throw err
      }
    }
  }
}

export function database() {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(fs.readFileSync("schema.sql", "utf8"))
  return sqlite
}

export function serverEnv({ files, env = {}, ip } = {}) {
  keys ??= generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
  const db = database()
  const gh = fakeGitHub(keys.publicKey, { repo: REPO, api: API, files })
  const made = { db, gh, ip, waiting: [], emails: [], resend: { status: 200 }, profile: null, restore: () => (globalThis.fetch = realFetch) }
  made.env = { DB: d1(db), ASSETS: { fetch: url => assets(String(url)) }, SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "github-secret", GITHUB_APP_ID: "123", GITHUB_APP_KEY: keys.privateKey, GITHUB_WEBHOOK_SECRET: "hook-secret", GITHUB_REPOSITORY: REPO, GITHUB_API: API, RESEND_API_KEY: "resend-key", ...env }
  globalThis.fetch = async (url, options) => {
    const text = String(url)
    if (text.startsWith(API)) return gh.handle(text, options)
    if (text === "https://api.resend.com/emails") {
      if (made.resend.status !== 200) return new Response("refused", { status: made.resend.status })
      made.emails.push(JSON.parse(options.body))
      return new Response("{}")
    }
    const { profile } = made
    return new Response(JSON.stringify(options?.method === "POST" ? { access_token: "token" } : text.endsWith("/user/emails") ? profile.emails ?? [{ email: `${profile.login}@example.com`, primary: true, verified: true }] : profile), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  server = made
  return made
}

export function context(url, { method = "GET", body, cookie, params = {}, headers = {}, ip = server.ip } = {}) {
  const sent = typeof body === "string" || body instanceof FormData || body === undefined ? body : JSON.stringify(body)
  const request = new Request(`${SITE}${url}`, { method, body: sent, headers: { ...(ip && { "CF-Connecting-IP": ip }), ...(cookie && { Cookie: cookie }), ...headers } })
  return { request, env: server.env, params, waitUntil: promise => server.waiting.push(promise) }
}

export async function signIn(provider = "discord", person = { id: "1234", username: "someone", email: "someone@example.com", verified: true }) {
  server.profile = person
  const started = await startSignIn(context(`/api/account/login/${provider}?return=${encodeURIComponent(SITE)}`, { params: { provider } }))
  const state = new URL(started.headers.get("Location")).searchParams.get("state")
  const stateCookie = started.headers.getSetCookie().find(line => line.startsWith("signin_state=")).split(";")[0]
  const back = await receiveSignIn(context(`/api/account/login/${provider}/callback?${new URLSearchParams({ code: "abc", state })}`, { params: { provider } }))
  const { pathname, search } = new URL(back.headers.get("Location"))
  const done = await finishSignIn(context(`${pathname}${search}`, { cookie: stateCookie, params: { provider } }))
  return done.headers.getSetCookie().find(line => line.startsWith("session=")).split(";")[0]
}

export async function sendForm(cookie, data) {
  const response = await createSubmission(context("/api/submissions", { method: "POST", body: data, cookie }))
  return { status: response.status, ...await response.json() }
}

export async function editForm(cookie, id, data) {
  const response = await editSubmission(context(`/api/submissions/${id}`, { method: "PATCH", body: data, cookie, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

export async function details(id, cookie) {
  return (await (await submissionDetails(context(`/api/submissions/${id}`, { cookie, params: { id: String(id) } }))).json()).submission
}

export async function hook(event, payload, secret = "hook-secret") {
  const body = JSON.stringify({ repository: { full_name: REPO }, ...payload })
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  const response = await receiveWebhook(context("/api/github", { method: "POST", body, headers: { "X-GitHub-Event": event, "X-Hub-Signature-256": signature } }))
  await Promise.all(server.waiting)
  return response
}
