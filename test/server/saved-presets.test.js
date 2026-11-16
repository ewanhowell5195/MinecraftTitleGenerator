import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { batchesTogether, code, context, db, freshServer, list, restoreFetch, rowsEverywhere, shareAs, signIn, usageOf, vote, voteAll, withCookie } from "../helpers/presets.js"

const { LIMITS } = await import("../../src/lib/core/limits.js")
const { getPreset, replacePreset, submissionUsage, unsharePreset } = await import("../../src/server/presets.js")
const { addSaved, changeSaved, listSaved, removeSaved } = await import("../../src/server/saved.js")

beforeEach(freshServer)
afterEach(restoreFetch)

describe("saved presets", () => {
  function savedCall(handler, cookie, method, body) {
    return handler(withCookie("/api/saved", cookie, { method, body }))
  }

  async function savedList(cookie) {
    return (await (await savedCall(listSaved, cookie, "GET")).json()).presets
  }

  async function save(cookie, presets) {
    const response = await savedCall(addSaved, cookie, "POST", { presets })
    return { status: response.status, ...await response.json() }
  }

  function saved(text, name = text) {
    return { name, code: code([{ text }]) }
  }

  test("every route needs a session", async () => {
    assert.equal((await listSaved(context("/api/saved"))).status, 401)
    assert.equal((await save("session=none", [saved("a")])).status, 401)
    assert.equal((await savedCall(changeSaved, "session=none", "PATCH", { code: "a", name: "b" })).status, 401)
    assert.equal((await savedCall(removeSaved, "session=none", "DELETE", { code: "a" })).status, 401)
  })

  test("saves and lists in order, only for that account", async () => {
    const first = await signIn("discord", { id: "1", username: "a" })
    const second = await signIn("discord", { id: "2", username: "b" })
    await save(first, [saved("one"), saved("two")])
    await save(second, [saved("three")])
    assert.deepEqual((await savedList(first)).map(preset => preset.name), ["one", "two"])
    assert.deepEqual((await savedList(second)).map(preset => preset.name), ["three"])
  })

  test("the same title saved again keeps the first name, and two accounts can both save it", async () => {
    const first = await signIn("discord", { id: "1", username: "a" })
    const second = await signIn("discord", { id: "2", username: "b" })
    await save(first, [saved("same", "first name")])
    assert.deepEqual((await save(first, [saved("same", "second name")])).kept, [])
    await save(second, [saved("same", "theirs")])
    assert.deepEqual((await savedList(first)).map(preset => preset.name), ["first name"])
    assert.deepEqual((await savedList(second)).map(preset => preset.name), ["theirs"])
  })

  test("a shared preset is one row: sharing moves a save over rather than copying it", async () => {
    const cookie = await signIn()
    const preset = saved("one")
    await save(cookie, [preset, saved("two")])
    assert.equal((await list()).presets.length, 0)
    const { status, preset: published } = await shareAs(cookie, "one", { name: "Published" })
    assert.equal(status, 200)
    assert.equal(typeof published.createdAt, "number")
    assert.deepEqual((await savedList(cookie)).map(item => item.name), ["Published", "two"])
    assert.equal((await savedList(cookie))[0].shared, published.id)
    assert.equal(Object.hasOwn((await savedList(cookie))[1], "shared"), false)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM presets").get().count, 2)
  })

  test("a save stays out of everything public", async () => {
    const cookie = await signIn()
    const preset = saved("secret")
    await save(cookie, [preset])
    const { id } = db.prepare("SELECT id FROM presets").get()
    assert.deepEqual((await list()).presets, [])
    assert.deepEqual((await list("?sort=random")).presets, [])
    assert.deepEqual((await list("?q=secret")).presets, [])
    assert.equal((await getPreset(context(`/api/presets/${id}`, { params: { id: String(id) } }))).status, 404)
    assert.equal((await vote(id, 1, "someone")).status, 404)
    assert.deepEqual((await usageOf("1.1.1.1")).shared, [])
  })

  test("two accounts can save a title that is also shared", async () => {
    const first = await signIn("discord", { id: "1", username: "a" })
    const second = await signIn("discord", { id: "2", username: "b" })
    await shareAs(first, "popular")
    await save(second, [saved("popular", "my copy")])
    assert.deepEqual((await savedList(second)).map(item => item.name), ["my copy"])
    assert.equal((await list()).presets.length, 1)
  })

  test("a shared preset can't be renamed, changed or deleted through the saves", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "public")
    await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, name: "rude bypass" })
    await savedCall(removeSaved, cookie, "DELETE", { code: preset.code })
    assert.equal(db.prepare("SELECT name FROM presets WHERE id = ?").get(preset.id).name, "Public")
  })

  test("shared presets don't count towards the limit on saves", async () => {
    const cookie = await signIn()
    await shareAs(cookie, "shared one")
    for (let index = 0; index < LIMITS.savedPresets; index += LIMITS.savedBatch) await save(cookie, Array.from({ length: LIMITS.savedBatch }, (_, offset) => saved(`title ${index + offset}`)))
    assert.equal((await savedList(cookie)).length, LIMITS.savedPresets + 1)
    const extra = saved("extra")
    assert.deepEqual((await save(cookie, [extra])).kept, [extra.code])
  })

  test("deleting from Community moves it back to the saves, and sharing again keeps its stats", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "round trip")
    await voteAll(preset.id, Array(LIMITS.minVotes).fill(1))
    await unsharePreset(withCookie(`/api/presets/${preset.id}/unshare`, cookie, { method: "POST", params: { id: String(preset.id) } }))
    assert.deepEqual(await savedList(cookie), [{ name: "Round Trip", code: preset.code }])
    assert.deepEqual((await (await submissionUsage(withCookie("/api/presets/usage", cookie, { method: "GET" }))).json()).shared, [])
    const again = await shareAs(cookie, "round trip")
    assert.equal(again.preset.id, preset.id)
    assert.equal(again.preset.votes, LIMITS.minVotes)
  })

  test("changing a hidden preset's title resets its stats when it is shared again", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "old title")
    await voteAll(preset.id, Array(LIMITS.minVotes).fill(1))
    await unsharePreset(withCookie(`/api/presets/${preset.id}/unshare`, cookie, { method: "POST", params: { id: String(preset.id) } }))
    await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, replacement: code([{ text: "new title" }]) })
    const again = await shareAs(cookie, "new title")
    assert.equal(again.preset.id, preset.id)
    assert.equal(again.preset.votes, 0)
  })

  test("replacing a share with a title that is also saved takes that save's place", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "shared title")
    const copy = saved("saved title")
    await save(cookie, [copy])
    const response = await replacePreset(withCookie(`/api/presets/${preset.id}`, cookie, { method: "PUT", body: { code: copy.code, name: "Merged" }, params: { id: String(preset.id) } }))
    assert.equal(response.status, 200)
    assert.deepEqual(await savedList(cookie), [{ name: "Merged", code: copy.code, shared: preset.id }])
  })

  test("two shares replaced with the same title at once only take it once", async () => {
    const cookie = await signIn()
    const shares = [(await shareAs(cookie, "first title")).preset, (await shareAs(cookie, "second title")).preset]
    const wanted = code([{ text: "same title" }])
    batchesTogether()
    const responses = await Promise.all(shares.map(preset => replacePreset(withCookie(`/api/presets/${preset.id}`, cookie, { method: "PUT", body: { code: wanted }, params: { id: String(preset.id) } }))))
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
    const winner = shares[responses.findIndex(response => response.status === 200)]
    assert.equal((await responses.find(response => response.status === 409).json()).id, winner.id)
  })

  test("a deleted hidden preset's id is never used again", async () => {
    const cookie = await signIn()
    const preset = saved("gone")
    await save(cookie, [preset])
    const { id } = db.prepare("SELECT id FROM presets").get()
    await savedCall(removeSaved, cookie, "DELETE", { code: preset.code })
    await save(cookie, [saved("next")])
    assert.ok(db.prepare("SELECT id FROM presets").get().id > id)
  })

  test("hands back anything damaged, too big or badly named", async () => {
    const cookie = await signIn()
    const big = { name: "big", code: `${"a".repeat(LIMITS.savedCode + 1)}` }
    const damaged = { name: "damaged", code: "!!!" }
    const unnamed = { ...saved("unnamed"), name: " " }
    const { kept } = await save(cookie, [big, damaged, unnamed, saved("fine")])
    assert.deepEqual(kept, [big.code, damaged.code, unnamed.code])
    assert.deepEqual((await savedList(cookie)).map(preset => preset.name), ["fine"])
  })

  test("a batch over the limit is refused", async () => {
    const cookie = await signIn()
    const presets = Array.from({ length: LIMITS.savedBatch + 1 }, (_, index) => saved(`title ${index}`))
    assert.equal((await save(cookie, presets)).status, 400)
  })

  test("hands back what goes over the account's limit, but still accepts titles it already has", async () => {
    const cookie = await signIn()
    for (let index = 0; index < LIMITS.savedPresets; index += LIMITS.savedBatch) await save(cookie, Array.from({ length: LIMITS.savedBatch }, (_, offset) => saved(`title ${index + offset}`)))
    const extra = saved("extra")
    const { kept } = await save(cookie, [saved("title 0"), extra])
    assert.deepEqual(kept, [extra.code])
    assert.equal((await savedList(cookie)).length, LIMITS.savedPresets)
  })

  test("renames only on that account", async () => {
    const cookie = await signIn("discord", { id: "1", username: "a" })
    const other = await signIn("discord", { id: "2", username: "b" })
    const preset = saved("one")
    await save(cookie, [preset])
    await savedCall(changeSaved, other, "PATCH", { code: preset.code, name: "stolen" })
    await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, name: " new name " })
    assert.deepEqual(await savedList(cookie), [{ name: "new name", code: preset.code }])
  })

  test("replaces the title in place, keeping its order", async () => {
    const cookie = await signIn()
    const other = await signIn("discord", { id: "2", username: "b" })
    const [one, two] = [saved("one"), saved("two")]
    await save(cookie, [one, two])
    const after = code([{ text: "after" }])
    await savedCall(changeSaved, other, "PATCH", { code: one.code, replacement: after })
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: one.code, replacement: after, name: "After" })).status, 200)
    assert.deepEqual(await savedList(cookie), [{ name: "After", code: after }, two])
    assert.deepEqual((await save(cookie, [{ name: "Again", code: after }])).kept, [])
    assert.equal((await savedList(cookie)).length, 2)
  })

  test("a replacement is checked", async () => {
    const cookie = await signIn()
    const [one, two] = [saved("one"), saved("two")]
    await save(cookie, [one, two])
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: one.code, replacement: two.code })).status, 409)
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: one.code, replacement: "!!!" })).status, 400)
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: one.code, replacement: "a".repeat(LIMITS.savedCode + 1) })).status, 400)
    assert.deepEqual(await savedList(cookie), [one, two])
  })

  test("a change is checked", async () => {
    const cookie = await signIn()
    const preset = saved("one")
    await save(cookie, [preset])
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, name: " " })).status, 400)
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: preset.code })).status, 400)
    assert.equal((await savedCall(changeSaved, cookie, "PATCH", { name: "no code" })).status, 400)
  })

  test("deletes only from that account, and leaves nothing behind", async () => {
    const cookie = await signIn("discord", { id: "1", username: "a" })
    const other = await signIn("discord", { id: "2", username: "b" })
    const preset = saved("one")
    await save(cookie, [preset])
    await savedCall(removeSaved, other, "DELETE", { code: preset.code })
    assert.equal((await savedList(cookie)).length, 1)
    await savedCall(removeSaved, cookie, "DELETE", { code: preset.code })
    assert.deepEqual(rowsEverywhere(), { deleted_presets: 1 })
  })
})
