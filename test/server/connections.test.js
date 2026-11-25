import { afterEach, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { code, context, db, freshServer, restoreFetch, share, shareAs, signIn, withCookie } from "../helpers/presets.js"

const { accountDetails, signOut } = await import("#server/accounts.js")
const { deleteAccount } = await import("#server/accountDeletion.js")
const { connect, disconnect, listConnections } = await import("#server/connecting.js")
const { MOST_CONNECTIONS } = await import("#server/connections.js")
const { preflight } = await import("#server/http.js")
const { claimPresets, deletePreset, renamePreset, replacePreset, submissionUsage, submitPreset, unsharePreset } = await import("#server/presets.js")
const { votePreset } = await import("#server/presetScores.js")
const { addSaved, changeSaved, listSaved, removeSaved } = await import("#server/saved.js")

const PATH = "/api/account/connections"
const KEY = "a".repeat(64)
const DAY = 86400000

beforeEach(freshServer)
afterEach(restoreFetch)

function hashOf(key) {
  return createHash("sha256").update(key).digest("hex")
}

function connecting(cookie, key = KEY) {
  return connect(withCookie(PATH, cookie, { method: "POST", body: { key: hashOf(key) } }))
}

function withKey(path, key = KEY, options = {}) {
  const made = context(path, options)
  made.request = new Request(made.request, { headers: { "CF-Connecting-IP": "1.1.1.1", Authorization: `Bearer ${key}`, ...options.headers } })
  return made
}

async function who(key = KEY) {
  return (await (await accountDetails(withKey("/api/account", key))).json()).user
}

async function connections(cookie) {
  return (await (await listConnections(withCookie(PATH, cookie))).json()).connections
}

async function later(days, run) {
  const now = Date.now()
  mock.timers.enable({ apis: ["Date"], now: now + days * DAY })
  try {
    return await run()
  } finally {
    mock.timers.reset()
  }
}

describe("connecting Blockbench", () => {
  test("a key signs in as the account that connected it, without its private details", async () => {
    assert.equal(await who(), null)
    assert.equal((await connecting(await signIn())).status, 201)
    assert.deepEqual(await who(), { id: "discord:1234", name: "someone", provider: "discord", avatar: "https://cdn.discordapp.com/embed/avatars/0.png" })
    assert.equal(await who("b".repeat(64)), null)
  })

  test("only a hash of the key is stored", async () => {
    await connecting(await signIn())
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM connections").all()).includes(KEY))
  })

  test("connecting needs a signed in browser and a valid key", async () => {
    assert.equal((await connect(context(PATH, { method: "POST", body: { key: hashOf(KEY) } }))).status, 401)
    const cookie = await signIn()
    for (const key of [undefined, 5, "", "A".repeat(64), "a".repeat(63)]) assert.equal((await connect(withCookie(PATH, cookie, { method: "POST", body: { key } }))).status, 400)
    await connecting(cookie)
    assert.equal((await connect(withKey(PATH, KEY, { method: "POST", body: { key: hashOf("c".repeat(64)) } }))).status, 401)
  })

  test("a key can't be connected again, by the same account or another", async () => {
    await connecting(await signIn())
    assert.equal((await connecting(await signIn("github", { id: 2, login: "other" }))).status, 409)
    assert.equal((await connecting(await signIn())).status, 409)
    assert.equal((await who()).name, "someone")
  })

  test("another website can't connect for the visitor", async () => {
    const made = withCookie(PATH, await signIn(), { method: "POST", body: { key: hashOf(KEY) } })
    made.request.headers.set("Origin", "https://web.blockbench.net")
    assert.equal((await connect(made)).status, 403)
  })

  test("a key doesn't work where it isn't accepted", async () => {
    await connecting(await signIn())
    assert.equal((await listConnections(withKey(PATH))).status, 401)
    assert.equal((await deleteAccount(withKey("/api/account/delete", KEY, { method: "POST", body: { mode: "remove" } }))).status, 401)
    assert.equal((await claimPresets(withKey("/api/presets/claim", KEY, { method: "POST", body: { tokens: [] } }))).status, 401)
    assert.equal((await submitPreset(withKey("/api/presets", KEY, { method: "POST", body: { code: code([{ text: "a" }]), account: true } }))).status, 401)
  })

  test("a key wins over a cookie where it is accepted", async () => {
    await connecting(await signIn())
    const other = await signIn("github", { id: 2, login: "other" })
    assert.equal((await (await accountDetails(withKey("/api/account", KEY, { headers: { Cookie: other } }))).json()).user.name, "someone")
  })

  test("usage is the account's", async () => {
    const cookie = await signIn()
    await connecting(cookie)
    const shared = await shareAs(cookie, "mine")
    await share("another")
    const usage = await (await submissionUsage(withKey("/api/presets/usage"))).json()
    assert.deepEqual(usage.owned, [shared.preset.id])
    assert.equal(usage.used, 1)
  })

  test("a vote with a key is the account's, and can't be on its own preset", async () => {
    const cookie = await signIn()
    await connecting(cookie)
    const other = await share("another")
    const own = await shareAs(cookie, "mine")
    const voting = id => votePreset(withKey(`/api/presets/${id}/vote`, KEY, { method: "POST", body: { value: 1 }, params: { id: String(id) } }))
    assert.equal((await voting(other.id)).status, 200)
    assert.equal((await voting(own.preset.id)).status, 403)
    const usage = await (await submissionUsage(withCookie("/api/presets/usage", cookie))).json()
    assert.deepEqual(usage.votes, { [other.id]: 1 })
  })

  test("a key can list, save, change and remove the account's own presets", async () => {
    await connecting(await signIn())
    const saved = async () => (await (await listSaved(withKey("/api/saved"))).json()).presets
    const [first, second] = [code([{ text: "one" }]), code([{ text: "two" }])]
    assert.equal((await addSaved(withKey("/api/saved", KEY, { method: "POST", body: { presets: [{ name: "One", code: first }] } }))).status, 200)
    assert.deepEqual(await saved(), [{ name: "One", code: first }])
    assert.equal((await changeSaved(withKey("/api/saved", KEY, { method: "PATCH", body: { code: first, name: "Two", replacement: second } }))).status, 200)
    assert.deepEqual(await saved(), [{ name: "Two", code: second }])
    assert.equal((await removeSaved(withKey("/api/saved", KEY, { method: "DELETE", body: { code: second } }))).status, 200)
    assert.deepEqual(await saved(), [])
  })

  test("a key can manage the account's shared presets and nobody else's", async () => {
    const cookie = await signIn()
    await connecting(cookie)
    const { preset } = await shareAs(cookie, "mine")
    const other = await share("another")
    const at = (id, options) => withKey(`/api/presets/${id}`, KEY, { params: { id: String(id) }, ...options })
    for (const change of [id => renamePreset(at(id, { method: "PATCH", body: { name: "Renamed" } })), id => replacePreset(at(id, { method: "PUT", body: { code: code([{ text: "new" }]), name: "Newer" } })), id => unsharePreset(at(id, { method: "POST" })), id => deletePreset(at(id, { method: "DELETE" }))]) {
      assert.equal((await change(other.id)).status, 403)
      assert.equal((await change(preset.id)).status, 200)
    }
  })

  test("signing out in Blockbench deletes its key and leaves the others", async () => {
    const cookie = await signIn()
    await connecting(cookie)
    await connecting(cookie, "b".repeat(64))
    assert.equal((await signOut(withKey("/api/account/logout", KEY, { method: "POST" }))).status, 200)
    assert.equal(await who(), null)
    assert.equal((await who("b".repeat(64))).name, "someone")
    assert.equal((await connections(cookie)).length, 1)
  })

  test("the website can disconnect its own account's Blockbench only", async () => {
    const cookie = await signIn()
    await connecting(cookie)
    const other = await signIn("github", { id: 2, login: "other" })
    await disconnect(withCookie(PATH, other, { method: "DELETE", body: { key: hashOf(KEY) } }))
    assert.equal((await who()).name, "someone")
    const [{ id }] = await connections(cookie)
    await disconnect(withCookie(PATH, cookie, { method: "DELETE", body: { key: id } }))
    assert.equal(await who(), null)
    assert.deepEqual(await connections(cookie), [])
  })

  test("deleting the account deletes its keys", async () => {
    const cookie = await signIn()
    await connecting(cookie)
    await deleteAccount(withCookie("/api/account/delete", cookie, { method: "POST", body: { mode: "remove" } }))
    assert.equal(await who(), null)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM connections").get().total, 0)
  })

  test("a new username and picture show in Blockbench after signing in on the website", async () => {
    await connecting(await signIn())
    await signIn("discord", { id: "1234", username: "renamed", avatar: "new" })
    const { name, avatar } = await who()
    assert.equal(name, "renamed")
    assert.equal(avatar, "https://cdn.discordapp.com/avatars/1234/new.png?size=64")
  })

  test("a key lasts as long as it is used, and 90 days after", async () => {
    await connecting(await signIn())
    assert.equal((await later(80, who)).name, "someone")
    assert.equal((await later(160, who)).name, "someone")
    assert.equal(await later(251, who), null)
  })

  test("an unused key is deleted once someone connects, and an account keeps its newest", async () => {
    const cookie = await signIn()
    await connecting(await signIn("github", { id: 2, login: "other" }), "f".repeat(64))
    db.prepare("UPDATE connections SET used_at = ?").run(Date.now() - 91 * DAY)
    for (let index = 0; index < MOST_CONNECTIONS + 2; index++) {
      await connecting(cookie, index.toString(16).repeat(64))
      db.prepare("UPDATE connections SET used_at = ? WHERE key_hash = ?").run(Date.now() - DAY + index, hashOf(index.toString(16).repeat(64)))
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM connections").get().total, MOST_CONNECTIONS)
    assert.equal(await who("0".repeat(64)), null)
    assert.equal((await who("b".repeat(64))).name, "someone")
  })

  test("Blockbench's website may send a key, and only it", async () => {
    await connecting(await signIn())
    const answer = preflight()
    assert.equal(answer.status, 204)
    assert.match(answer.headers.get("Access-Control-Allow-Headers"), /Authorization/)
    const headers = { Origin: "https://web.blockbench.net" }
    const shown = await accountDetails(withKey("/api/account", KEY, { headers }))
    assert.equal(shown.headers.get("Access-Control-Allow-Origin"), "*")
    assert.equal((await signOut(withKey("/api/account/logout", KEY, { method: "POST", headers: { Origin: "https://evil.test" } }))).status, 403)
    assert.equal((await submitPreset(withKey("/api/presets", KEY, { method: "POST", body: { code: code([{ text: "a" }]) }, headers }))).status, 403)
    assert.equal((await signOut(withKey("/api/account/logout", KEY, { method: "POST", headers }))).status, 200)
    assert.equal(await who(), null)
  })
})
