import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHmac, generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { PNG } from "pngjs"
import { fakeGitHub } from "./fakeGitHub.js"

const { accountDetails, finishSignIn, receiveSignIn, startSignIn } = await import("../src/server/accounts.js")
const { createSubmission, editSubmission, listNotifications, listSubmissions, markNotificationsSeen, receiveWebhook, submissionDetails, submissionFile, withdrawSubmission } = await import("../src/server/submissions.js")
const { jsonText } = await import("../src/lib/jsonText.js")

const REPO = "owner/repo"
const API = "https://github.test"
const TEXTURES = "public/font/minecraft-ten/textures.json"
const FLAT = { width: 570, height: 444 }
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

function png(width, height) {
  const image = new PNG({ width, height })
  image.data.fill(200)
  return PNG.sync.write(image)
}

function assets(url) {
  const file = path.join("public", decodeURIComponent(new URL(url).pathname))
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response("missing", { status: 404 })
}

let env
let gh
let waiting
let profile

function context(url, { method = "GET", body, cookie, params = {}, headers = {} } = {}) {
  const request = new Request(`https://mctitlegenerator.com${url}`, { method, body, headers: { ...(cookie && { Cookie: cookie }), ...headers } })
  return { request, env, params, waitUntil: promise => waiting.push(promise) }
}

async function signIn(provider = "discord", person = { id: "1234", username: "someone" }) {
  profile = person
  const started = await startSignIn(context(`/api/account/login/${provider}?return=${encodeURIComponent("https://mctitlegenerator.com")}`, { params: { provider } }))
  const state = new URL(started.headers.get("Location")).searchParams.get("state")
  const stateCookie = started.headers.getSetCookie().find(line => line.startsWith("signin_state=")).split(";")[0]
  const back = await receiveSignIn(context(`/api/account/login/${provider}/callback?${new URLSearchParams({ code: "abc", state })}`, { params: { provider } }))
  const { pathname, search } = new URL(back.headers.get("Location"))
  const done = await finishSignIn(context(`${pathname}${search}`, { cookie: stateCookie, params: { provider } }))
  return done.headers.getSetCookie().find(line => line.startsWith("session=")).split(";")[0]
}

function form(fields = {}, image = png(FLAT.width, FLAT.height)) {
  const data = new FormData()
  const { font = "minecraft-ten", border = "#3D1F0A", ...rest } = fields
  const values = { kind: "texture", target: font, name: "Gold Bricks", credit: "Someone", notes: "", agree: "true", details: JSON.stringify({ border }), ...rest }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  if (image) data.set("file", new Blob([image], { type: "image/png" }), "texture.png")
  return data
}

async function send(cookie, fields, image) {
  const response = await createSubmission(context("/api/submissions", { method: "POST", body: form(fields, image), cookie }))
  return { status: response.status, ...await response.json() }
}

async function edit(cookie, id, fields, image = null) {
  const response = await editSubmission(context(`/api/submissions/${id}`, { method: "PATCH", body: form(fields, image), cookie, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

async function details(id, cookie) {
  return (await (await submissionDetails(context(`/api/submissions/${id}`, { cookie, params: { id: String(id) } }))).json()).submission
}

function branchList(id) {
  return JSON.parse(gh.filesAt(`submission/${id}`) && Buffer.from(gh.blobs.get(gh.filesAt(`submission/${id}`).get(TEXTURES))).toString())
}

async function hook(event, payload, secret = "hook-secret") {
  const body = JSON.stringify({ repository: { full_name: REPO }, ...payload })
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  const response = await receiveWebhook(context("/api/github", { method: "POST", body, headers: { "X-GitHub-Event": event, "X-Hub-Signature-256": signature } }))
  await Promise.all(waiting)
  return response
}

function closed(number, merged, id) {
  return { action: "closed", sender: { login: "ewan" }, pull_request: { number, merged, html_url: `https://github.com/${REPO}/pull/${number}`, head: { ref: `submission/${id}` } } }
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(fs.readFileSync("schema.sql", "utf8"))
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
  gh = fakeGitHub(publicKey, { repo: REPO, api: API, files: [TEXTURES] })
  waiting = []
  env = { DB: d1(sqlite), ASSETS: { fetch: url => assets(String(url)) }, SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "github-secret", GITHUB_APP_ID: "123", GITHUB_APP_KEY: privateKey, GITHUB_WEBHOOK_SECRET: "hook-secret", GITHUB_REPOSITORY: REPO, GITHUB_API: API }
  globalThis.fetch = async (url, options) => {
    const text = String(url)
    if (text.startsWith(API)) return gh.handle(text, options)
    return new Response(JSON.stringify(options?.method === "POST" ? { access_token: "token" } : profile), { status: 200, headers: { "Content-Type": "application/json" } })
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("sending a submission", () => {
  test("needs an account", async () => {
    assert.equal((await send(null)).status, 401)
  })

  test("opens a pull request with the texture and its textures.json entry on top of main", async () => {
    const cookie = await signIn()
    const { status, id, pull } = await send(cookie, { notes: "made with love" })
    assert.equal(status, 201)
    assert.equal(pull, 1)
    const branch = gh.refs.get(`heads/submission/${id}`)
    assert.deepEqual(gh.commits.get(branch).parents, [gh.main()])
    assert.equal(gh.commits.get(branch).message, "add Gold Bricks texture to Minecraft Ten")
    const main = JSON.parse(fs.readFileSync(TEXTURES, "utf8"))
    const text = Buffer.from(gh.blobs.get(gh.filesAt(`submission/${id}`).get(TEXTURES))).toString()
    assert.equal(text, `${jsonText({ ...main, textures: { ...main.textures, gold_bricks: { author: "Someone", border: "#3d1f0a" } } })}\n`)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/gold_bricks.png"))
    const opened = gh.pulls.get(1)
    assert.equal(opened.head, `submission/${id}`)
    assert.equal(opened.title, "Gold Bricks texture for Minecraft Ten")
    assert.match(opened.body, new RegExp(`https://mctitlegenerator.com/submissions/${id}`))
    assert.match(opened.body, /made with love/)
    assert.match(opened.body, /` someone ` \(discord\)/)
  })

  test("keeps the submitter's text out of mentions and markdown", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { credit: "@everyone `x`", notes: "@ewan ```\n# heading" })
    const { body } = gh.pulls.get(1)
    assert.match(body, /`` @everyone `x` ``/)
    assert.match(body, /````text\n@ewan ```\n# heading\n````/)
    assert.equal((await details(id)).credit, "@everyone `x`")
  })

  test("records the density of bigger textures and names ids that would clash", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { name: "Flat" }, png(FLAT.width * 2, FLAT.height * 2))
    assert.deepEqual(branchList(id).textures.flat_2, { name: "Flat", author: "Someone", density: 2, border: "#3d1f0a" })
    const second = await send(cookie, { name: "Flat" })
    assert.ok(branchList(second.id).textures.flat_3)
    assert.equal((await details(second.id)).asset, "flat_3")
  })

  test("puts overlays in the overlays section and folder, without a border", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { kind: "overlay", name: "Soft Shading", border: "" }, png(FLAT.width * 2, FLAT.height * 2))
    const list = branchList(id)
    assert.deepEqual(list.overlays.soft_shading, { author: "Someone", density: 2 })
    assert.equal(list.textures.soft_shading, undefined)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/overlays/soft_shading.png"))
    assert.equal(gh.pulls.get(1).title, "Soft Shading overlay for Minecraft Ten")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "add Soft Shading overlay to Minecraft Ten")
    assert.equal((await details(id)).details.border, undefined)
  })

  test("keeps ids clear of textures, overlays and generated overlays, which share the thumbnails folder", async () => {
    const cookie = await signIn()
    const overlay = await send(cookie, { kind: "overlay", name: "Outline" })
    assert.ok(branchList(overlay.id).overlays.outline_2)
    const texture = await send(cookie, { name: "Bevel" })
    assert.deepEqual(branchList(texture.id).textures.bevel_2, { name: "Bevel", author: "Someone", border: "#3d1f0a" })
  })

  test("is refused before GitHub hears about it when the image or fields are wrong", async () => {
    assert.match((await send(await signIn(), { kind: "nope" })).error, /Pick what you're submitting/)
    const cookie = await signIn()
    assert.match((await send(cookie, {}, png(100, 100))).error, /template size, 570x444/)
    assert.match((await send(cookie, {}, png(4560, 3552))).error, /up to 4096 pixels/)
    assert.match((await send(cookie, { name: "fuck" })).error, /isn't allowed/)
    assert.match((await send(cookie, { agree: "false" })).error, /Agree/)
    assert.match((await send(cookie, { font: "nope" })).error, /Pick the font/)
    assert.match((await send(cookie, {}, null)).error, /Choose the texture's file/)
    assert.equal(gh.calls.length, 0)
  })

  test("goes to the font that owns the textures when a variant is picked", async () => {
    const fonts = JSON.parse(fs.readFileSync("public/font/fonts.json", "utf8"))
    const inherited = fonts.flatMap(font => (font.variants ?? []).filter(variant => variant.inherits).map(variant => ({ variant, owner: font })))[0]
    const flat = PNG.sync.read(fs.readFileSync(`public/font/${inherited.owner.id}/textures/flat.png`))
    const { id } = await send(await signIn(), { font: inherited.variant.id }, png(flat.width, flat.height))
    assert.equal((await details(id)).target, inherited.owner.id)
  })

  test("is limited per day", async () => {
    const cookie = await signIn()
    for (let index = 0; index < 10; index++) assert.equal((await send(cookie, { name: `Texture ${index}` })).status, 201)
    assert.equal((await send(cookie, { name: "One more" })).status, 429)
  })

  test("is undone when GitHub won't open the pull request", async () => {
    const cookie = await signIn()
    gh.failing.add("POST /repos/owner/repo/pulls")
    const { status, error } = await send(cookie)
    assert.equal(status, 502)
    assert.match(error, /GitHub isn't taking submissions/)
    assert.deepEqual(await (await listSubmissions(context("/api/submissions", { cookie }))).json(), { submissions: [] })
    assert.equal(gh.refs.has("heads/submission/1"), false)
  })
})

describe("a sent submission", () => {
  test("can be seen by anyone, but only changed by the person who sent it", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const shown = await details(id)
    assert.equal(shown.mine, false)
    assert.equal(shown.pullUrl, `https://github.com/${REPO}/pull/1`)
    assert.equal(shown.owner, undefined)
    assert.equal((await details(id, cookie)).mine, true)
    const other = await signIn("github", { id: 9, login: "other" })
    assert.equal((await edit(other, id, { name: "Mine Now" })).status, 404)
    const image = await submissionFile(context(`/api/submissions/${id}/file?v=${shown.file}`, { params: { id: String(id) } }))
    assert.equal(image.headers.get("Content-Type"), "image/png")
    assert.match(image.headers.get("Cache-Control"), /immutable/)
    assert.deepEqual(PNG.sync.read(Buffer.from(await image.arrayBuffer())).width, FLAT.width)
  })

  test("edits rewrite the branch and the pull request", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const { status, submission } = await edit(cookie, id, { name: "Shiny Gold", border: "#000000" })
    assert.equal(status, 200)
    assert.equal(submission.asset, "shiny_gold")
    const list = branchList(id)
    assert.equal(list.textures.gold_bricks, undefined)
    assert.deepEqual(list.textures.shiny_gold, { author: "Someone", border: "#000000" })
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/shiny_gold.png"))
    assert.equal(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/gold_bricks.png"), false)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
    assert.equal(gh.pulls.size, 1)
  })

  test("needs the image again to move to another font", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.match((await edit(cookie, id, { font: "minecraft-five" })).error, /Choose the texture's file again/)
  })

  test("can be withdrawn, which closes the pull request and deletes the branch", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const response = await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } }))
    assert.equal(response.status, 200)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.equal(gh.refs.has(`heads/submission/${id}`), false)
    assert.match(gh.comments[0].body, /Withdrawn/)
    await hook("pull_request", closed(1, false, id))
    assert.equal((await details(id)).status, "withdrawn")
    assert.equal((await edit(cookie, id, { name: "Again" })).status, 409)
  })
})

describe("the GitHub webhook", () => {
  async function sent() {
    const cookie = await signIn()
    const { id } = await send(cookie)
    return { cookie, id }
  }

  async function unread(cookie) {
    return (await (await accountDetails(context("/api/account", { cookie }))).json()).user.unread
  }

  test("refuses unsigned deliveries", async () => {
    assert.equal((await hook("ping", {}, "wrong")).status, 401)
  })

  test("publishes on merge and tells the submitter", async () => {
    const { cookie, id } = await sent()
    await hook("pull_request", closed(1, true, id))
    assert.equal((await details(id)).status, "published")
    assert.equal(await unread(cookie), 1)
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.equal(notifications[0].kind, "published")
    assert.equal(notifications[0].submissionName, "Gold Bricks")
    await markNotificationsSeen(context("/api/notifications", { method: "POST", cookie }))
    assert.equal(await unread(cookie), 0)
  })

  test("marks a closed pull request as rejected", async () => {
    const { id } = await sent()
    await hook("pull_request", closed(1, false, id))
    assert.equal((await details(id)).status, "rejected")
  })

  test("passes on comments and reviews from collaborators only", async () => {
    const { cookie } = await sent()
    const comment = (login, association, type = "User") => ({ action: "created", issue: { number: 1, pull_request: {} }, comment: { body: `from ${login}`, author_association: association, html_url: "https://github.com/c", user: { login, type } } })
    await hook("issue_comment", comment("ewan", "OWNER"))
    await hook("issue_comment", comment("stranger", "NONE"))
    await hook("issue_comment", comment("helper[bot]", "OWNER", "Bot"))
    await hook("pull_request_review", { action: "submitted", pull_request: { number: 1 }, review: { state: "changes_requested", body: "", author_association: "COLLABORATOR", html_url: "https://github.com/r", user: { login: "mate", type: "User" } } })
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.deepEqual(notifications.map(item => [item.kind, item.author, item.body]), [["changes", "mate", ""], ["comment", "ewan", "from ewan"]])
  })

  test("rebuilds open submissions on the new main when their textures.json changes", async () => {
    const { id } = await sent()
    const files = new Map(gh.filesAt("main"))
    const main = JSON.parse(fs.readFileSync(TEXTURES, "utf8"))
    files.set(TEXTURES, gh.blob(Buffer.from(`${jsonText({ ...main, textures: { ...main.textures, gold_bricks: { author: "Earlier", border: "#000000" } } })}\n`)))
    gh.refs.set("heads/main", gh.commit(files, [gh.main()], "someone else's texture"))
    await hook("push", { ref: "refs/heads/main", commits: [{ added: [], modified: [TEXTURES], removed: [] }] })
    assert.deepEqual(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).parents, [gh.main()])
    const list = branchList(id)
    assert.equal(list.textures.gold_bricks.author, "Earlier")
    assert.deepEqual(list.textures.gold_bricks_2, { name: "Gold Bricks", author: "Someone", border: "#3d1f0a" })
  })

  test("leaves submissions alone when main changes elsewhere", async () => {
    const { id } = await sent()
    const before = gh.refs.get(`heads/submission/${id}`)
    await hook("push", { ref: "refs/heads/main", commits: [{ added: ["README.md"], modified: [], removed: [] }] })
    assert.equal(gh.refs.get(`heads/submission/${id}`), before)
  })
})
