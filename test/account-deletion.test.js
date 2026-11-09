import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHmac, generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { PNG } from "pngjs"
import { fakeGitHub } from "./fakeGitHub.js"

const { finishSignIn, receiveSignIn, startSignIn } = await import("../src/server/accounts.js")
const { deleteAccount } = await import("../src/server/accountDeletion.js")
const { submitPreset, votePreset } = await import("../src/server/presets.js")
const { addSaved } = await import("../src/server/saved.js")
const { addComment, createSubmission, receiveWebhook } = await import("../src/server/submissions.js")
const { encodeTitle } = await import("../src/lib/linkformat.js")
const { FILE_VERSION } = await import("../src/lib/settings.js")

const REPO = "owner/repo"
const API = "https://github.test"
const TEXTURES = "public/font/minecraft-ten/textures.json"
const FLAT = PNG.sync.read(fs.readFileSync("public/font/minecraft-ten/textures/flat.png"))
const realFetch = globalThis.fetch

function d1(sqlite) {
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

let db
let env
let gh
let profile

function context(url, { method = "GET", body, cookie, params = {}, headers = {}, ip = "1.1.1.1" } = {}) {
  const sent = typeof body === "string" || body instanceof FormData || body === undefined ? body : JSON.stringify(body)
  const request = new Request(`https://mctitlegenerator.com${url}`, { method, body: sent, headers: { "CF-Connecting-IP": ip, ...(cookie && { Cookie: cookie }), ...headers } })
  return { request, env, params, waitUntil: () => {} }
}

async function signIn(id, username) {
  profile = { id, username }
  const started = await startSignIn(context(`/api/account/login/discord?return=${encodeURIComponent("https://mctitlegenerator.com")}`, { params: { provider: "discord" } }))
  const state = new URL(started.headers.get("Location")).searchParams.get("state")
  const stateCookie = started.headers.getSetCookie().find(line => line.startsWith("signin_state=")).split(";")[0]
  const back = await receiveSignIn(context(`/api/account/login/discord/callback?${new URLSearchParams({ code: "abc", state })}`, { params: { provider: "discord" } }))
  const { pathname, search } = new URL(back.headers.get("Location"))
  const done = await finishSignIn(context(`${pathname}${search}`, { cookie: stateCookie, params: { provider: "discord" } }))
  return done.headers.getSetCookie().find(line => line.startsWith("session=")).split(";")[0]
}

function code(text) {
  return encodeTitle({ version: FILE_VERSION, lines: [{ text }] }).code
}

async function share(cookie, text) {
  return (await (await submitPreset(context("/api/presets", { method: "POST", body: { code: code(text) }, cookie }))).json()).preset
}

async function vote(cookie, id, value) {
  return votePreset(context(`/api/presets/${id}/vote`, { method: "POST", body: { value }, cookie, params: { id: String(id) } }))
}

async function submit(cookie) {
  const image = new PNG({ width: FLAT.width, height: FLAT.height })
  image.data.fill(200)
  const data = new FormData()
  for (const [key, value] of Object.entries({ kind: "texture", target: "minecraft-ten", name: "Gold Bricks", credit: "Someone", notes: "", agree: "true", details: JSON.stringify({ border: "#000000" }) })) data.set(key, value)
  data.set("file", new Blob([PNG.sync.write(image)], { type: "image/png" }), "texture.png")
  return (await (await createSubmission(context("/api/submissions", { method: "POST", body: data, cookie }))).json()).id
}

async function remove(cookie, mode) {
  return deleteAccount(context("/api/account/delete", { method: "POST", body: { mode }, cookie }))
}

async function hook(event, payload) {
  const body = JSON.stringify({ repository: { full_name: REPO }, ...payload })
  const signature = `sha256=${createHmac("sha256", "hook-secret").update(body).digest("hex")}`
  return receiveWebhook(context("/api/github", { method: "POST", body, headers: { "X-GitHub-Event": event, "X-Hub-Signature-256": signature } }))
}

function count(sql, ...values) {
  return db.prepare(sql).get(...values).total
}

async function setUp() {
  db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('discord', '3', 'reviewer', 0, 1)").run()
  const owner = await signIn("1", "leaving")
  const other = await signIn("2", "staying")
  const shared = await share(owner, "mine")
  await addSaved(context("/api/saved", { method: "POST", body: { presets: [{ name: "private", code: code("private") }] }, cookie: owner }))
  const theirs = await share(other, "theirs")
  await vote(owner, theirs.id, 1)
  const submission = await submit(owner)
  await addComment(context(`/api/submissions/${submission}/comments`, { method: "POST", body: { body: "my note" }, cookie: owner, params: { id: String(submission) } }))
  return { owner, other, shared, theirs, submission }
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(fs.readFileSync("schema.sql", "utf8"))
  db = sqlite
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
  gh = fakeGitHub(publicKey, { repo: REPO, api: API, files: [TEXTURES] })
  env = { DB: d1(sqlite), ASSETS: { fetch: url => assets(String(url)) }, IP_SALT: "salt", SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_APP_ID: "123", GITHUB_APP_KEY: privateKey, GITHUB_WEBHOOK_SECRET: "hook-secret", GITHUB_REPOSITORY: REPO, GITHUB_API: API }
  globalThis.fetch = async (url, options) => {
    const text = String(url)
    if (text.startsWith(API)) return gh.handle(text, options)
    return new Response(JSON.stringify(options?.method === "POST" ? { access_token: "token" } : profile), { status: 200, headers: { "Content-Type": "application/json" } })
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function assets(url) {
  const file = path.join("public", decodeURIComponent(new URL(url).pathname))
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response("missing", { status: 404 })
}

describe("deleting an account", () => {
  test("needs a sign-in and a choice", async () => {
    assert.equal((await remove(null, "remove")).status, 401)
    const cookie = await signIn("1", "someone")
    assert.equal((await remove(cookie, "everything")).status, 400)
  })

  test("removing deletes everything of theirs, recounts their votes and withdraws open submissions", async () => {
    const { owner, theirs, submission } = await setUp()
    assert.equal(count("SELECT votes AS total FROM presets WHERE id = ?", theirs.id), 1)
    const response = await remove(owner, "remove")
    assert.equal(response.status, 200)
    assert.match(response.headers.get("Set-Cookie"), /^session=; .*Max-Age=0/)
    assert.equal(count("SELECT COUNT(*) AS total FROM presets WHERE id != ?", theirs.id), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM preset_votes"), 0)
    assert.equal(count("SELECT votes AS total FROM presets WHERE id = ?", theirs.id), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM submissions"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM submission_comments"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM notifications"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM users WHERE name = 'leaving'"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM users WHERE name = 'staying'"), 1)
    assert.equal(count("SELECT COUNT(*) AS total FROM account_submissions"), 1)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.ok(gh.refs.has(`heads/submission/${submission}`))
    assert.doesNotMatch(gh.pulls.get(1).body, /leaving/)
    assert.match(gh.pulls.get(1).body, /^Sent from the website\.$/m)
  })

  test("anonymising keeps shared presets and submissions without the account", async () => {
    const { owner, shared, submission } = await setUp()
    const response = await remove(owner, "anonymise")
    assert.equal(response.status, 200)
    assert.deepEqual({ ...db.prepare("SELECT user_id, shared FROM presets WHERE id = ?").get(shared.id) }, { user_id: null, shared: 1 })
    assert.equal(count("SELECT COUNT(*) AS total FROM presets WHERE shared = 0"), 0)
    assert.deepEqual({ ...db.prepare("SELECT user_id, status FROM submissions WHERE id = ?").get(submission) }, { user_id: null, status: "open" })
    assert.deepEqual({ ...db.prepare("SELECT user_id, author, body FROM submission_comments").get() }, { user_id: null, author: "", body: "my note" })
    assert.deepEqual(db.prepare("SELECT kind, author FROM notifications").all().map(row => [row.kind, row.author]), [["submitted", ""], ["comment", ""]])
    assert.equal(gh.pulls.get(1).state, "open")
    assert.doesNotMatch(gh.pulls.get(1).body, /leaving/)
    assert.equal(count("SELECT COUNT(*) AS total FROM users WHERE name = 'leaving'"), 0)
    const comment = { action: "created", issue: { number: 1, pull_request: {} }, comment: { body: "nice", author_association: "OWNER", html_url: "https://github.com/c", user: { login: "ewan", type: "User" } } }
    assert.equal((await hook("issue_comment", comment)).status, 200)
    assert.equal(count("SELECT COUNT(*) AS total FROM notifications WHERE kind = 'comment' AND author = 'ewan'"), 1)
  })
})
