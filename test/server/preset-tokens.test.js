import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { code, context, db, download, env, freshServer, list, post, rename, restoreFetch, shareAs, signIn, usageAs, usageOf, vote, voteAll, withCookie } from "../helpers/presets.js"
import { holdQuery } from "../helpers/server.js"

const { LIMITS } = await import("../../src/lib/core/limits.js")
const { claimPresets, deletePreset, getPreset, renamePreset, replacePreset, submitPreset, unsharePreset } = await import("../../src/server/presets.js")
const { presetStats, votePreset } = await import("../../src/server/presetScores.js")
const { addSaved, listSaved } = await import("../../src/server/saved.js")

beforeEach(freshServer)
afterEach(restoreFetch)

describe("tokens", () => {
  function withToken(path, token, options) {
    const made = context(path, options)
    made.request = new Request(made.request, { headers: { "CF-Connecting-IP": "9.9.9.9", ...(token && { "X-Preset-Token": token }) } })
    return made
  }

  async function shared(text = "managed") {
    const { preset, token, onAccount } = await post({ code: code([{ text }]) }, "1.1.1.1")
    return { preset, token, onAccount }
  }

  async function renameWith(token, id, name = "renamed") {
    const response = await renamePreset(withToken(`/api/presets/${id}`, token, { method: "PATCH", body: { name }, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  async function replaceWith(token, id, text, name) {
    const response = await replacePreset(withToken(`/api/presets/${id}`, token, { method: "PUT", body: { code: code([{ text }]), name }, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  test("replacing keeps the id and resets the votes, rating and uses", async () => {
    const { preset, token } = await shared("before")
    await voteAll(preset.id, Array(LIMITS.minVotes).fill(1))
    await download(preset.id, "someone")
    const result = await replaceWith(token, preset.id, "after", "New name")
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM preset_downloads WHERE preset_id = ?").get(preset.id).count, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM preset_daily_downloads WHERE preset_id = ?").get(preset.id).count, 0)
    assert.equal((await download(preset.id, "someone")).counted, true)
    assert.equal(result.status, 200)
    assert.equal(result.preset.id, preset.id)
    assert.equal(result.preset.code, code([{ text: "after" }]))
    assert.equal(result.preset.name, "New name")
    assert.equal(result.preset.text, "after")
    assert.equal(result.preset.votes, 0)
    assert.equal(result.preset.rating, null)
    assert.equal(result.preset.downloads, 0)
    assert.equal(result.preset.createdAt, preset.createdAt)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM preset_votes WHERE preset_id = ?").get(preset.id).count, 0)
    assert.equal((await vote(preset.id, 1, "voter 0")).votes, 1)
  })

  test("replacing doesn't use up a share", async () => {
    const { preset, token } = await shared("before")
    const { used } = await usageOf("9.9.9.9")
    await replaceWith(token, preset.id, "after", "")
    assert.equal((await usageOf("9.9.9.9")).used, used)
  })

  test("replacing with no name names it after the new title", async () => {
    const { preset, token } = await shared("before")
    assert.equal((await replaceWith(token, preset.id, "after this", "")).preset.name, "After This")
  })

  test("the same title keeps its votes and only changes the name", async () => {
    const { preset, token } = await shared("same")
    await voteAll(preset.id, Array(LIMITS.minVotes).fill(1))
    const result = await replaceWith(token, preset.id, "same", "Renamed")
    assert.equal(result.preset.name, "Renamed")
    assert.equal(result.preset.votes, LIMITS.minVotes)
    assert.equal(result.preset.rating, 5)
  })

  test("a title someone else already shared is refused and changes nothing", async () => {
    const taken = await shared("taken")
    const { preset, token } = await shared("mine")
    await voteAll(preset.id, [1])
    const result = await replaceWith(token, preset.id, "taken", "Copy")
    assert.equal(result.status, 409)
    assert.equal(result.id, taken.preset.id)
    const row = db.prepare("SELECT name, votes FROM presets WHERE id = ?").get(preset.id)
    assert.equal(row.name, "Mine")
    assert.equal(row.votes, 1)
  })

  test("only the owner can replace, and the new title is checked", async () => {
    const { preset, token } = await shared("before")
    const other = await shared("other")
    assert.equal((await replaceWith(null, preset.id, "after")).status, 401)
    assert.equal((await replaceWith(other.token, preset.id, "after")).status, 403)
    assert.equal((await replaceWith(token, 999, "after")).status, 404)
    assert.equal((await replaceWith(token, preset.id, "a".repeat(61))).status, 400)
    assert.equal(db.prepare("SELECT text FROM presets WHERE id = ?").get(preset.id).text, "before")
  })

  test("an account can replace its own preset, and not someone else's", async () => {
    const cookie = await signIn("discord", { id: "1", username: "a" })
    const other = await signIn("discord", { id: "2", username: "b" })
    const { preset } = await shareAs(cookie, "mine")
    const replaced = body => replacePreset(withCookie(`/api/presets/${preset.id}`, body, { method: "PUT", body: { code: code([{ text: "after" }]) }, params: { id: String(preset.id) } }))
    assert.equal((await replaced(other)).status, 403)
    assert.equal((await replaced(cookie)).status, 200)
  })

  async function unshareWith(token, id) {
    const response = await unsharePreset(withToken(`/api/presets/${id}/unshare`, token, { method: "POST", params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  async function shareAgain(token, id, text, name) {
    const made = withToken("/api/presets", token, { method: "POST", body: { code: code([{ text }]), name, id } })
    const response = await submitPreset(made)
    return { status: response.status, ...await response.json() }
  }

  test("deleting from Community hides it everywhere public and only the owner can do it", async () => {
    const { preset, token } = await shared("hidden")
    const other = await shared("other")
    assert.equal((await unshareWith(other.token, preset.id)).status, 403)
    assert.equal((await unshareWith(null, preset.id)).status, 401)
    const result = await unshareWith(token, preset.id)
    assert.equal(result.status, 200)
    assert.deepEqual(result.preset, { name: "Hidden", code: code([{ text: "hidden" }]) })
    assert.deepEqual((await list()).presets.map(item => item.id), [other.preset.id])
    assert.deepEqual((await list("?sort=random")).presets.map(item => item.id), [other.preset.id])
    assert.deepEqual((await list("?q=hidden")).presets, [])
    assert.equal((await getPreset(context(`/api/presets/${preset.id}`, { params: { id: String(preset.id) } }))).status, 404)
    assert.equal((await vote(preset.id, 1, "someone")).status, 404)
    assert.equal((await download(preset.id, "someone")).status, 404)
    assert.deepEqual((await (await presetStats(context(`/api/presets/stats?ids=${preset.id}`))).json()).stats, {})
  })

  test("sharing it again keeps its id, stats and date", async () => {
    const { preset, token } = await shared("again")
    await voteAll(preset.id, Array(LIMITS.minVotes).fill(1))
    await download(preset.id, "someone")
    await unshareWith(token, preset.id)
    const result = await shareAgain(token, preset.id, "again", "Back again")
    assert.equal(result.status, 200)
    assert.equal(result.token, undefined)
    assert.equal(result.preset.id, preset.id)
    assert.equal(result.preset.name, "Back again")
    assert.equal(result.preset.votes, LIMITS.minVotes)
    assert.equal(result.preset.rating, 5)
    assert.equal(result.preset.downloads, 1)
    assert.equal(result.preset.createdAt, preset.createdAt)
    assert.deepEqual((await list()).presets.map(item => item.id), [preset.id])
  })

  test("sharing it again with a different title resets its stats", async () => {
    const { preset, token } = await shared("first title")
    await voteAll(preset.id, Array(LIMITS.minVotes).fill(1))
    await download(preset.id, "someone")
    await unshareWith(token, preset.id)
    const result = await shareAgain(token, preset.id, "second title", "Changed")
    assert.equal(result.preset.id, preset.id)
    assert.equal(result.preset.votes, 0)
    assert.equal(result.preset.rating, null)
    assert.equal(result.preset.downloads, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM preset_votes WHERE preset_id = ?").get(preset.id).count, 0)
  })

  test("a title someone else shared in the meantime can't be shared again", async () => {
    const { preset, token } = await shared("wanted")
    await unshareWith(token, preset.id)
    const theirs = await shared("wanted")
    assert.notEqual(theirs.preset.id, preset.id)
    const result = await shareAgain(token, preset.id, "wanted", "Mine")
    assert.equal(result.status, 409)
    assert.equal(result.id, theirs.preset.id)
  })

  test("someone else's token can't bring it back", async () => {
    const { preset, token } = await shared("guarded")
    const other = await shared("other")
    await unshareWith(token, preset.id)
    const result = await shareAgain(other.token, preset.id, "guarded", "Stolen")
    assert.notEqual(result.preset.id, preset.id)
    assert.equal(db.prepare("SELECT shared FROM presets WHERE id = ?").get(preset.id).shared, 0)
  })

  test("signing in claims a preset that left Community, without clashing with a saved copy", async () => {
    const { preset, token } = await shared("claimed")
    await unshareWith(token, preset.id)
    const cookie = await signIn()
    await addSaved(withCookie("/api/saved", cookie, { method: "POST", body: { presets: [{ name: "Copy", code: code([{ text: "claimed" }]) }] } }))
    assert.deepEqual((await claim(cookie, [{ id: preset.id, token }])).moved, [preset.id])
    assert.deepEqual((await (await listSaved(withCookie("/api/saved", cookie, { method: "GET" }))).json()).presets, [{ name: "Claimed", code: code([{ text: "claimed" }]) }])
  })

  test("the saved copy a claim replaces keeps its id out of use", async () => {
    const { preset, token } = await shared("claimed")
    await unshareWith(token, preset.id)
    const cookie = await signIn()
    await addSaved(withCookie("/api/saved", cookie, { method: "POST", body: { presets: [{ name: "Copy", code: code([{ text: "claimed" }]) }] } }))
    const copy = db.prepare("SELECT id FROM presets WHERE id != ?").get(preset.id).id
    await claim(cookie, [{ id: preset.id, token }])
    assert.deepEqual(db.prepare("SELECT id FROM deleted_presets").all().map(row => row.id), [copy])
    const next = await shared("next")
    assert.ok(next.preset.id > copy)
  })

  async function removeWith(token, id) {
    return (await deletePreset(withToken(`/api/presets/${id}`, token, { method: "DELETE", params: { id: String(id) } }))).status
  }

  async function claim(cookie, tokens) {
    const response = await claimPresets(withCookie("/api/presets/claim", cookie, { method: "POST", body: { tokens } }))
    return { status: response.status, ...await response.json() }
  }

  test("sharing without an account returns a token and stores only its hash", async () => {
    const { token, onAccount, preset } = await shared()
    assert.match(token, /^[0-9a-f]{64}$/)
    assert.equal(onAccount, false)
    const { token_hash: stored } = db.prepare("SELECT token_hash FROM presets WHERE id = ?").get(preset.id)
    assert.match(stored, /^[0-9a-f]{64}$/)
    assert.notEqual(stored, token)
  })

  test("the hash never reaches the public routes", async () => {
    const { preset } = await shared()
    assert.equal(JSON.stringify(await list()).includes("token"), false)
    const single = await getPreset(context(`/api/presets/${preset.id}`, { params: { id: String(preset.id) } }))
    assert.equal((await single.text()).includes("token"), false)
  })

  test("sharing on an account makes no token", async () => {
    const { token, preset } = await shareAs(await signIn(), "on account")
    assert.equal(token, undefined)
    assert.equal(db.prepare("SELECT token_hash FROM presets WHERE id = ?").get(preset.id).token_hash, null)
  })

  test("the token can rename and delete from any IP", async () => {
    const { token, preset } = await shared()
    assert.equal((await renameWith(token, preset.id)).preset.name, "renamed")
    assert.equal(await removeWith(token, preset.id), 200)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM presets").get().total, 0)
  })

  test("no token or the wrong token can't change it, even from the same IP", async () => {
    const { preset } = await shared()
    const other = await shared("other")
    assert.equal((await renameWith(null, preset.id)).status, 401)
    assert.equal((await renameWith("wrong", preset.id)).status, 403)
    assert.equal((await renameWith(other.token, preset.id)).status, 403)
    assert.equal(await removeWith(other.token, preset.id), 403)
  })

  test("a token can't change a preset with no token", async () => {
    const { preset } = await shareAs(await signIn(), "on account")
    const { token } = await shared()
    assert.equal((await renameWith(token, preset.id)).status, 403)
    db.prepare("UPDATE presets SET token_hash = NULL, user_id = NULL").run()
    assert.equal((await renameWith(token, preset.id)).status, 403)
  })

  test("deleting with a token doesn't need or touch a user", async () => {
    const cookie = await signIn()
    await shareAs(cookie, "stays")
    const { token, preset } = await shared()
    await removeWith(token, preset.id)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 1)
  })

  test("signing in moves token presets to the account and kills the token", async () => {
    const cookie = await signIn()
    const { token, preset } = await shared()
    const { moved } = await claim(cookie, [{ id: preset.id, token }])
    assert.deepEqual(moved, [preset.id])
    const row = db.prepare("SELECT token_hash, user_id FROM presets").get()
    assert.equal(row.token_hash, null)
    assert.equal(db.prepare("SELECT name FROM users WHERE id = ?").get(row.user_id).name, "someone")
    assert.equal((await renameWith(token, preset.id)).status, 403)
    assert.deepEqual((await usageAs(cookie)).owned, [preset.id])
    assert.equal((await rename(cookie, preset.id, "mine")).preset.author, "someone")
  })

  test("a wrong token or a taken preset doesn't move, and leaves no user", async () => {
    const cookie = await signIn()
    const { preset } = await shared()
    assert.deepEqual((await claim(cookie, [{ id: preset.id, token: "wrong" }, { id: 999, token: "none" }])).moved, [])
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 0)
    assert.notEqual(db.prepare("SELECT token_hash FROM presets").get().token_hash, null)
  })

  const MOVED_MEANWHILE = [
    ["rename", /SET name = /, (token, id) => renamePreset(withToken(`/api/presets/${id}`, token, { method: "PATCH", body: { name: "renamed" }, params: { id: String(id) } }))],
    ["replace", /SET code = /, (token, id) => replacePreset(withToken(`/api/presets/${id}`, token, { method: "PUT", body: { code: code([{ text: "replaced" }]) }, params: { id: String(id) } }))],
    ["unshare", /SET shared = 0/, (token, id) => unsharePreset(withToken(`/api/presets/${id}/unshare`, token, { method: "POST", params: { id: String(id) } }))],
    ["delete", /DELETE FROM presets/, (token, id) => deletePreset(withToken(`/api/presets/${id}`, token, { method: "DELETE", params: { id: String(id) } }))]
  ]
  for (const [label, pattern, send] of MOVED_MEANWHILE) {
    test(`a token can't ${label} a preset that moved to an account while it was sent`, async () => {
      const { token, preset } = await shared()
      await vote(preset.id, 1, "voter")
      const cookie = await signIn()
      const hold = holdQuery(env, pattern)
      const sending = send(token, preset.id)
      await hold.arrived
      assert.deepEqual((await claim(cookie, [{ id: preset.id, token }])).moved, [preset.id])
      hold.release()
      assert.equal((await sending).status, 403)
      assert.deepEqual({ ...db.prepare("SELECT name, shared, votes FROM presets WHERE id = ?").get(preset.id) }, { name: preset.name, shared: 1, votes: 1 })
    })
  }

  test("a vote is refused if the preset moved to the voter's account while it was sent", async () => {
    const { token, preset } = await shared()
    const cookie = await signIn()
    const hold = holdQuery(env, /preset_votes/)
    const voting = votePreset(withCookie(`/api/presets/${preset.id}/vote`, cookie, { method: "POST", body: { value: 1 }, params: { id: String(preset.id) } }))
    await hold.arrived
    assert.deepEqual((await claim(cookie, [{ id: preset.id, token }])).moved, [preset.id])
    hold.release()
    assert.equal((await voting).status, 403)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM preset_votes").get().total, 0)
    assert.equal((await votePreset(withCookie(`/api/presets/${preset.id}/vote`, cookie, { method: "POST", body: { value: 1 }, params: { id: String(preset.id) } }))).status, 403)
  })

  test("moving needs a session, a tidy request and an allowed username", async () => {
    const { token, preset } = await shared()
    const tokens = [{ id: preset.id, token }]
    assert.equal((await claim("session=none", tokens)).status, 401)
    const cookie = await signIn()
    assert.equal((await claim(cookie, "nope")).status, 400)
    assert.equal((await claim(cookie, [{ id: "1", token }])).status, 400)
    assert.equal((await claim(cookie, Array.from({ length: LIMITS.claimBatch + 1 }, () => tokens[0]))).status, 400)
    assert.equal((await claim(await signIn("discord", { id: "9", username: "fuck" }), tokens)).status, 400)
    assert.notEqual(db.prepare("SELECT token_hash FROM presets").get().token_hash, null)
  })
})
