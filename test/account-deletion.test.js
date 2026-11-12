import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { setTimeout as wait } from "node:timers/promises"
import { PNG } from "pngjs"
import { pngOf } from "./helpers/png.js"
import { context, hook, sendForm, serverEnv, signIn as signInAs } from "./helpers/server.js"

const { accountDetails } = await import("../src/server/accounts.js")
const { deleteAccount } = await import("../src/server/accountDeletion.js")
const { claimPresets, submitPreset, votePreset } = await import("../src/server/presets.js")
const { addSaved } = await import("../src/server/saved.js")
const { addComment, createSubmission } = await import("../src/server/submissions.js")
const { encodeTitle } = await import("../src/lib/linkformat.js")
const { FILE_VERSION } = await import("../src/lib/settings.js")

const TEXTURES = "public/font/minecraft-ten/textures.json"
const FLAT = PNG.sync.read(fs.readFileSync("public/font/minecraft-ten/textures/flat.png"))

let db
let gh
let restore

function signIn(id, username) {
  return signInAs("discord", { id, username, email: `${username}@example.com`, verified: true })
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
  const data = new FormData()
  for (const [key, value] of Object.entries({ kind: "texture", target: "minecraft-ten", name: "Gold Bricks", credit: JSON.stringify(["Someone"]), notes: "", agree: "true", details: JSON.stringify({ border: "#000000" }) })) data.set(key, value)
  data.set("file", new Blob([pngOf(FLAT.width, FLAT.height)], { type: "image/png" }), "texture.png")
  return (await sendForm(cookie, data)).id
}

async function remove(cookie, mode) {
  return deleteAccount(context("/api/account/delete", { method: "POST", body: { mode }, cookie }))
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
  ({ db, gh, restore } = serverEnv({ files: [TEXTURES], env: { IP_SALT: "salt" }, ip: "1.1.1.1" }))
})

afterEach(() => restore())

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
    assert.equal(count("SELECT COUNT(*) AS total FROM notifications"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM users WHERE name = 'leaving'"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM users WHERE name = 'staying'"), 1)
    assert.deepEqual(db.prepare("SELECT count FROM account_submissions ORDER BY rowid").all().map(row => row.count), [1, 1, 1])
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.ok(gh.refs.has(`heads/submission/${submission}`))
    assert.doesNotMatch(gh.pulls.get(1).body, /leaving/)
    assert.match(gh.pulls.get(1).body, /^Sent from the website\.$/m)
    assert.ok(gh.comments.every(item => !item.body.includes("leaving")))
  })

  test("anonymising keeps shared presets and submissions without the account", async () => {
    const { owner, shared, submission } = await setUp()
    const response = await remove(owner, "anonymise")
    assert.equal(response.status, 200)
    assert.deepEqual({ ...db.prepare("SELECT user_id, shared FROM presets WHERE id = ?").get(shared.id) }, { user_id: null, shared: 1 })
    assert.equal(count("SELECT COUNT(*) AS total FROM presets WHERE shared = 0"), 0)
    assert.deepEqual({ ...db.prepare("SELECT user_id, status FROM submissions WHERE id = ?").get(submission) }, { user_id: null, status: "open" })
    assert.equal(gh.comments[0].body, "The submitter commented on the site:\n\n```text\nmy note\n```")
    assert.deepEqual(db.prepare("SELECT kind, author FROM notifications").all().map(row => [row.kind, row.author]), [["submitted", ""], ["comment", ""]])
    assert.equal(gh.pulls.get(1).state, "open")
    assert.doesNotMatch(gh.pulls.get(1).body, /leaving/)
    assert.equal(count("SELECT COUNT(*) AS total FROM users WHERE name = 'leaving'"), 0)
    const comment = { action: "created", issue: { number: 1, pull_request: {} }, comment: { body: "nice", author_association: "OWNER", html_url: "https://github.com/c", user: { login: "ewan", type: "User" } } }
    assert.equal((await hook("issue_comment", comment)).status, 200)
    assert.equal(count("SELECT COUNT(*) AS total FROM notifications WHERE kind = 'comment' AND author = 'ewan'"), 1)
  })

  test("keeps the day's submission count, so deleting the account doesn't give more", async () => {
    const cookie = await signIn("1", "leaving")
    await submit(cookie)
    await remove(cookie, "remove")
    await wait(5)
    const again = await signIn("1", "leaving")
    await submit(again)
    assert.deepEqual(db.prepare("SELECT count FROM account_submissions").all().map(row => row.count), [2])
  })
})

describe("sessions from before an account was deleted", () => {
  async function refused(response) {
    assert.equal(response.status, 401)
    assert.match((await response.json()).error, /This account has been deleted/)
    assert.match(response.headers.get("Set-Cookie"), /^session=; .*Max-Age=0/)
  }

  async function leave() {
    const here = await signIn("1", "leaving")
    const elsewhere = await signIn("1", "leaving")
    await share(here, "mine")
    assert.equal((await remove(here, "remove")).status, 200)
    return elsewhere
  }

  test("can't share, save, claim, submit or comment, so the account stays deleted", async () => {
    const elsewhere = await leave()
    await refused(await submitPreset(context("/api/presets", { method: "POST", body: { code: code("again") }, cookie: elsewhere })))
    await refused(await addSaved(context("/api/saved", { method: "POST", body: { presets: [{ name: "private", code: code("private") }] }, cookie: elsewhere })))
    await refused(await claimPresets(context("/api/presets/claim", { method: "POST", body: { tokens: [] }, cookie: elsewhere })))
    await refused(await createSubmission(context("/api/submissions", { method: "POST", body: new FormData(), cookie: elsewhere })))
    await refused(await addComment(context("/api/submissions/1/comments", { method: "POST", body: { body: "hello" }, cookie: elsewhere, params: { id: "1" } })))
    assert.equal(count("SELECT COUNT(*) AS total FROM users"), 0)
    assert.equal(count("SELECT COUNT(*) AS total FROM presets"), 0)
  })

  test("count as signed out when the account is asked for", async () => {
    const elsewhere = await leave()
    const response = await accountDetails(context("/api/account", { cookie: elsewhere }))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).user, null)
    assert.match(response.headers.get("Set-Cookie"), /^session=; .*Max-Age=0/)
  })

  test("don't stop a new sign-in from making the account again", async () => {
    await leave()
    await wait(5)
    const back = await signIn("1", "leaving")
    assert.equal((await (await accountDetails(context("/api/account", { cookie: back }))).json()).user.name, "leaving")
    assert.equal((await share(back, "again")).name, "Again")
    assert.equal(count("SELECT COUNT(*) AS total FROM users"), 1)
  })

  test("leave other accounts alone", async () => {
    const other = await signIn("2", "staying")
    await leave()
    assert.equal((await share(other, "theirs")).name, "Theirs")
  })

  test("are remembered by a hash, only for as long as a session lasts", async () => {
    db.prepare("INSERT INTO deleted_accounts (account_hash, deleted_at) VALUES ('old', ?), ('recent', ?)").run(Date.now() - 91 * 86400000, Date.now() - 89 * 86400000)
    await leave()
    const rows = db.prepare("SELECT account_hash FROM deleted_accounts ORDER BY deleted_at").all().map(row => row.account_hash)
    assert.equal(rows.length, 2)
    assert.equal(rows[0], "recent")
    assert.match(rows[1], /^[0-9a-f]{64}$/)
  })
})
