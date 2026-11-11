import { beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fakeReplies, fakeTimeouts, stubStorage } from "./helpers/browser.js"

const stored = stubStorage()
globalThis.confirm = () => true
globalThis.BroadcastChannel = class {
  postMessage() {}
}
const { requests, replies, reset } = fakeReplies({ missing: () => ({ body: { kept: [] } }) })
fakeTimeouts()

const { account, refreshAccount, refreshUsage } = await import("../src/lib/community.js")
const { notice } = await import("../src/lib/notices.js")
const { addPreset, deleteSharedPreset, markShared, presets, presetsError, presetsLoading, removePreset, renamePreset, replaceTargets, replaceWith, sharePreset, unmarkShared, unsharePreset } = await import("../src/lib/presets.js")

const STORAGE = "minecraft-title-presets"
const SOMEONE = { id: "discord:1", name: "someone", provider: "discord" }

function local() {
  return JSON.parse(stored.get(STORAGE) ?? "[]")
}

function setLocal(list) {
  stored.set(STORAGE, JSON.stringify(list))
}

async function settled() {
  for (let tick = 0; tick < 10; tick++) await new Promise(resolve => setImmediate(resolve))
}

async function signIn(saved = []) {
  replies["GET /api/saved"] ??= { body: { presets: saved } }
  account.value = SOMEONE
  await settled()
}

function sentTo(method) {
  return requests.filter(request => request.method === method && request.url === "/api/saved")
}

beforeEach(async () => {
  account.value = null
  await settled()
  stored.clear()
  presets.value = []
  reset()
  notice.value = ""
  presetsError.value = ""
})

describe("signed out", () => {
  test("presets stay in this browser and nothing is sent", async () => {
    const preset = addPreset("One", "code-1")
    renamePreset(preset, "Renamed")
    await settled()
    assert.deepEqual(local(), [{ name: "Renamed", code: "code-1" }])
    assert.equal(requests.length, 0)
  })
})

describe("signing in", () => {
  test("loads from the database and shows no local presets while loading", async () => {
    setLocal([])
    let finish
    replies["GET /api/saved"] = { body: { presets: [{ name: "Cloud", code: "cloud" }] } }
    const realFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      await new Promise(resolve => finish = resolve)
      return realFetch(...args)
    }
    try {
      account.value = SOMEONE
      assert.equal(presetsLoading.value, true)
      assert.deepEqual(presets.value, [])
      await settled()
    } finally {
      globalThis.fetch = realFetch
    }
    finish()
    await settled()
    assert.equal(presetsLoading.value, false)
    assert.deepEqual(presets.value, [{ name: "Cloud", code: "cloud" }])
  })

  test("moves local presets up, then clears them from this browser", async () => {
    setLocal([{ name: "One", code: "code-1" }, { name: "Two", code: "code-2", shared: 4 }])
    await signIn([{ name: "Cloud", code: "cloud" }])
    assert.deepEqual(sentTo("POST")[0].body.presets, [{ name: "One", code: "code-1" }, { name: "Two", code: "code-2" }])
    assert.deepEqual(presets.value.map(preset => preset.name), ["Cloud", "One", "Two"])
    assert.deepEqual(local(), [])
    assert.match(notice.value, /Added 2 presets/)
  })

  test("a title on the account from an older version isn't sent again", async () => {
    setLocal([{ name: "Local name", code: "3same" }])
    await signIn([{ name: "Cloud name", code: "2same" }])
    assert.equal(sentTo("POST").length, 0)
    assert.deepEqual(presets.value, [{ name: "Cloud name", code: "2same" }])
  })

  test("a title already on the account isn't sent again and keeps its name there", async () => {
    setLocal([{ name: "Local name", code: "same" }])
    await signIn([{ name: "Cloud name", code: "same" }])
    assert.equal(sentTo("POST").length, 0)
    assert.deepEqual(presets.value, [{ name: "Cloud name", code: "same" }])
    assert.deepEqual(local(), [])
    assert.equal(notice.value, "")
  })

  test("a name already taken on the account gets a number", async () => {
    setLocal([{ name: "Title", code: "a" }, { name: "Title 2", code: "b" }])
    await signIn([{ name: "Title", code: "cloud" }])
    assert.deepEqual(presets.value.map(preset => preset.name), ["Title", "Title 2", "Title 2 2"])
  })

  test("sends many presets in batches", async () => {
    setLocal(Array.from({ length: 60 }, (_, index) => ({ name: `Title ${index}`, code: `code-${index}` })))
    await signIn()
    assert.deepEqual(sentTo("POST").map(request => request.body.presets.length), [25, 25, 10])
    assert.equal(presets.value.length, 60)
  })

  test("what doesn't fit stays in this browser and comes back on sign out", async () => {
    setLocal([{ name: "Fits", code: "fits" }, { name: "Extra", code: "extra" }])
    replies["POST /api/saved"] = { body: { kept: ["extra"] } }
    await signIn()
    assert.deepEqual(presets.value, [{ name: "Fits", code: "fits" }, { name: "Extra", code: "extra", inBrowser: true }])
    assert.deepEqual(local(), [{ name: "Extra", code: "extra" }])
    assert.match(notice.value, /Added 1 preset .*1 preset didn't fit on your account/)
    account.value = null
    assert.deepEqual(presets.value, [{ name: "Extra", code: "extra" }])
  })

  test("what stayed in this browser moves up once there is room", async () => {
    setLocal([{ name: "Extra", code: "extra" }])
    replies["POST /api/saved"] = { body: { kept: ["extra"] } }
    await signIn()
    assert.equal(presets.value[0].inBrowser, true)
    account.value = null
    replies["POST /api/saved"] = { body: { kept: [] } }
    await signIn()
    assert.deepEqual(presets.value, [{ name: "Extra", code: "extra" }])
    assert.deepEqual(local(), [])
  })

  test("a failed upload keeps everything in this browser and says so", async t => {
    const list = [{ name: "One", code: "code-1" }]
    setLocal(list)
    replies["POST /api/saved"] = { status: 500, body: { error: "Nope." } }
    t.mock.method(console, "error", () => {})
    await signIn()
    assert.deepEqual(local(), list)
    assert.match(presetsError.value, /Couldn't load your presets: Nope/)
    assert.equal(presetsLoading.value, false)
  })

  test("a retry after a part-finished upload doesn't send the first part again", async () => {
    setLocal([{ name: "One", code: "code-1" }, { name: "Two", code: "code-2" }])
    await signIn([{ name: "One", code: "code-1" }])
    assert.deepEqual(sentTo("POST")[0].body.presets.map(preset => preset.code), ["code-2"])
  })
})

describe("signed in", () => {
  test("changes go to the server, in order, and not to this browser", async () => {
    await signIn()
    const preset = addPreset("One", "code-1")
    renamePreset(preset, "Renamed")
    markShared(preset, 9)
    assert.equal(presets.value[0].name, "Renamed")
    assert.equal(presets.value[0].shared, 9)
    await settled()
    unmarkShared(9)
    removePreset(preset)
    assert.deepEqual(presets.value, [])
    await settled()
    assert.deepEqual(requests.filter(request => request.method !== "GET").map(request => [request.method, request.body]), [
      ["POST", { presets: [{ name: "One", code: "code-1" }] }],
      ["PATCH", { code: "code-1", name: "Renamed" }],
      ["DELETE", { code: "code-1" }]
    ])
    assert.deepEqual(local(), [])
  })

  test("a failed change is put back and shows why", async t => {
    await signIn([{ name: "One", code: "code-1" }])
    replies["DELETE /api/saved"] = { status: 500, body: { error: "It broke." } }
    t.mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    assert.deepEqual(presets.value, [])
    await settled()
    assert.deepEqual(presets.value, [{ name: "One", code: "code-1" }])
    assert.equal(notice.value, "It broke.")
  })

  test("a failed save takes back only that preset, not what was saved after it", async t => {
    await signIn([{ name: "Cloud", code: "cloud" }])
    replies["POST /api/saved"] = body => body.presets[0].code === "code-a" ? { status: 500, body: { error: "It broke." } } : { body: { kept: [] } }
    t.mock.method(console, "error", () => {})
    addPreset("A", "code-a")
    addPreset("B", "code-b")
    assert.deepEqual(presets.value.map(preset => preset.name), ["Cloud", "A", "B"])
    await settled()
    assert.deepEqual(presets.value, [{ name: "Cloud", code: "cloud" }, { name: "B", code: "code-b" }])
    assert.equal(notice.value, "It broke.")
  })

  test("a failed rename puts the name back and keeps a later change to another preset", async t => {
    await signIn([{ name: "One", code: "code-1" }, { name: "Two", code: "code-2" }])
    replies["PATCH /api/saved"] = body => body.code === "code-1" ? { status: 500, body: { error: "It broke." } } : { body: {} }
    t.mock.method(console, "error", () => {})
    renamePreset(presets.value[0], "First")
    renamePreset(presets.value[1], "Second")
    await settled()
    assert.deepEqual(presets.value, [{ name: "One", code: "code-1" }, { name: "Second", code: "code-2" }])
  })

  test("a failed delete puts the preset back where it was and keeps a later save", async t => {
    await signIn([{ name: "One", code: "code-1" }, { name: "Two", code: "code-2" }])
    replies["DELETE /api/saved"] = { status: 500, body: { error: "It broke." } }
    t.mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    addPreset("Three", "code-3")
    await settled()
    assert.deepEqual(presets.value.map(preset => preset.name), ["One", "Two", "Three"])
  })

  test("a preset the account has no room for is saved in this browser and shows why", async () => {
    await signIn([{ name: "Cloud", code: "cloud" }])
    replies["POST /api/saved"] = { body: { kept: ["code-1"] } }
    addPreset("One", "code-1")
    await settled()
    assert.deepEqual(presets.value, [{ name: "Cloud", code: "cloud" }, { name: "One", code: "code-1", inBrowser: true }])
    assert.deepEqual(local(), [{ name: "One", code: "code-1" }])
    assert.match(notice.value, /One didn't fit on your account, so it's saved in this browser instead/)
  })

  test("a browser-only preset changes in this browser and nothing is sent", async () => {
    setLocal([{ name: "One", code: "code-1" }, { name: "Two", code: "code-2" }])
    replies["POST /api/saved"] = { body: { kept: ["code-1", "code-2"] } }
    await signIn([{ name: "Cloud", code: "cloud" }])
    requests.length = 0
    const one = presets.value.find(preset => preset.code === "code-1")
    const renamed = renamePreset(one, "Renamed")
    markShared(renamed, 9)
    removePreset(presets.value.find(preset => preset.code === "code-2"))
    await settled()
    assert.equal(requests.length, 0)
    assert.deepEqual(local(), [{ name: "Renamed", code: "code-1", shared: 9 }])
    assert.deepEqual(presets.value, [{ name: "Cloud", code: "cloud" }, { name: "Renamed", code: "code-1", inBrowser: true, shared: 9 }])
    unmarkShared(9)
    assert.deepEqual(local(), [{ name: "Renamed", code: "code-1" }])
    assert.equal(requests.length, 0)
  })

  async function fullAccount() {
    setLocal([{ name: "Waiting", code: "waiting", shared: 3 }, { name: "Later", code: "later" }])
    replies["POST /api/saved"] = { body: { kept: ["waiting", "later"] } }
    await signIn([{ name: "Cloud", code: "cloud" }])
    requests.length = 0
    notice.value = ""
  }

  test("deleting an account preset moves one browser-only preset into the free slot", async () => {
    await fullAccount()
    replies["POST /api/saved"] = { body: { kept: [] } }
    removePreset(presets.value[0])
    await settled()
    assert.deepEqual(sentTo("POST").map(request => request.body.presets), [[{ name: "Waiting", code: "waiting" }]])
    assert.deepEqual(presets.value, [{ name: "Waiting", code: "waiting" }, { name: "Later", code: "later", inBrowser: true }])
    assert.deepEqual(local(), [{ name: "Later", code: "later" }])
    assert.equal(notice.value, "Waiting is now saved on your account.")
  })

  test("if the slot has gone by then, the preset stays in this browser", async () => {
    await fullAccount()
    removePreset(presets.value[0])
    await settled()
    assert.equal(presets.value[0].inBrowser, true)
    assert.equal(local().length, 2)
    assert.equal(notice.value, "")
  })

  test("a failed move keeps the preset in this browser and the delete still stands", async t => {
    await fullAccount()
    replies["POST /api/saved"] = { status: 500, body: { error: "Nope." } }
    t.mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    await settled()
    assert.deepEqual(presets.value.map(preset => preset.code), ["waiting", "later"])
    assert.equal(presets.value[0].inBrowser, true)
    assert.equal(local().length, 2)
  })

  test("a failed delete puts the preset back and moves nothing", async t => {
    await fullAccount()
    replies["DELETE /api/saved"] = { status: 500, body: { error: "It broke." } }
    t.mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    await settled()
    assert.equal(sentTo("POST").length, 0)
    assert.deepEqual(presets.value.map(preset => preset.code), ["cloud", "waiting", "later"])
  })

  test("deleting a browser-only preset frees no slot, so nothing moves", async () => {
    await fullAccount()
    removePreset(presets.value[1])
    await settled()
    assert.equal(requests.length, 0)
    assert.deepEqual(local(), [{ name: "Later", code: "later" }])
  })

  test("deleting with nothing waiting sends only the delete", async () => {
    await signIn([{ name: "Cloud", code: "cloud" }])
    removePreset(presets.value[0])
    await settled()
    assert.equal(sentTo("POST").length, 0)
    assert.equal(sentTo("DELETE").length, 1)
  })

  test("a change made before the upload is refused is kept in this browser", async () => {
    await signIn()
    replies["POST /api/saved"] = { body: { kept: ["code-1"] } }
    const preset = addPreset("One", "code-1")
    renamePreset(preset, "Renamed")
    await settled()
    assert.deepEqual(local(), [{ name: "Renamed", code: "code-1" }])
    assert.equal(presets.value[0].inBrowser, true)
  })

  test("browser-only presets aren't wiped when the account list failed to load", async t => {
    setLocal([{ name: "Earlier", code: "earlier" }])
    replies["GET /api/saved"] = { status: 500, body: { error: "Nope." } }
    t.mock.method(console, "error", () => {})
    account.value = SOMEONE
    await settled()
    replies["POST /api/saved"] = { body: { kept: ["code-1"] } }
    addPreset("New", "code-1")
    await settled()
    assert.deepEqual(local().map(preset => preset.code), ["earlier", "code-1"])
  })

  test("a preset saved while the list is loading isn't lost", async () => {
    replies["GET /api/saved"] = { body: { presets: [{ name: "Cloud", code: "cloud" }] } }
    account.value = SOMEONE
    addPreset("New", "new")
    await settled()
    assert.deepEqual(presets.value.map(preset => preset.name).toSorted(), ["Cloud", "New"])
  })
})

describe("replacing a preset", () => {
  const LOCAL = { name: "Local", code: "local" }
  const SHARED = { name: "Shared", code: "shared", shared: 9 }
  const FAR = { name: "Far", code: "far", shared: 5 }

  async function managing(owned, saved) {
    replies["GET /api/presets/usage"] = { body: { used: 0, shared: owned, owned } }
    replies["GET /api/account"] = { body: { user: SOMEONE, providers: [] } }
    replies["GET /api/saved"] = { body: { presets: saved } }
    await refreshAccount(true)
    await refreshUsage(true)
    await settled()
    requests.length = 0
  }

  function sent() {
    return requests.filter(request => request.method !== "GET").map(request => [request.method, request.url, request.body])
  }

  async function signedOutWith(list) {
    replies["GET /api/presets/usage"] = { body: { used: 0, shared: [], owned: [] } }
    replies["GET /api/account"] = { body: { user: null, providers: [] } }
    account.value = null
    await refreshAccount(true)
    setLocal(list)
    presets.value = list
    requests.length = 0
  }

  test("a title saved by an older version isn't offered as something to replace with itself", async () => {
    await managing([9, 7], [{ name: "Old", code: "2same", shared: 9 }, { name: "Second", code: "2second", shared: 7 }, { name: "Other", code: "2other", shared: 5 }, LOCAL])
    assert.deepEqual(replaceTargets("3same").map(target => target.name), ["Second"])
    assert.equal(addPreset("Copy", "3same").name, "Old")
    assert.equal(presets.value.length, 4)
  })

  test("a new title can replace anything saved, in alphabetical order", async () => {
    await managing([9], [LOCAL, SHARED, FAR, { name: "apple", code: "apple" }, { name: "Title 10", code: "ten" }, { name: "Title 2", code: "two" }])
    assert.deepEqual(replaceTargets("new").map(target => target.name), ["apple", "Far", "Local", "Shared", "Title 2", "Title 10"])
    assert.deepEqual(replaceTargets("new")[1], { name: "Far", code: "far", shared: 5, online: false })
    assert.deepEqual(replaceTargets("new")[3], { name: "Shared", code: "shared", shared: 9, online: true })
  })

  test("a title that is already saved can only replace shares this browser manages", async () => {
    await managing([9], [LOCAL, SHARED, FAR])
    assert.deepEqual(replaceTargets("local").map(target => target.name), ["Shared"])
  })

  test("a saved preset takes the new title, and nothing is sent online", async () => {
    await managing([], [LOCAL, { name: "Other", code: "other" }])
    const { preset, online } = await replaceWith(replaceTargets("new").find(target => target.code === "local"), "new", "Renamed")
    await settled()
    assert.equal(online, null)
    assert.equal(preset.code, "new")
    assert.deepEqual(presets.value, [{ name: "Renamed", code: "new" }, { name: "Other", code: "other" }])
    assert.deepEqual(sent(), [["PATCH", "/api/saved", { code: "local", replacement: "new", name: "Renamed" }]])
  })

  test("a shared preset is one row, so replacing it only sends the share", async () => {
    await managing([9], [SHARED])
    replies["PUT /api/presets/9"] = { body: { preset: { id: 9, name: "Renamed", code: "new", votes: 0, rating: null } } }
    const { online } = await replaceWith(replaceTargets("new")[0], "new", "Renamed")
    await settled()
    assert.equal(online.id, 9)
    assert.deepEqual(presets.value, [{ name: "Renamed", code: "new", shared: 9 }])
    assert.deepEqual(sent(), [["PUT", "/api/presets/9", { code: "new", name: "Renamed" }]])
  })

  test("renaming a shared preset renames it in Community, and a refusal puts the name back", async t => {
    await managing([9], [SHARED])
    replies["PATCH /api/presets/9"] = { body: { preset: { id: 9, name: "Renamed" } } }
    renamePreset(presets.value[0], "Renamed")
    await settled()
    assert.equal(presets.value[0].name, "Renamed")
    assert.deepEqual(sent(), [["PATCH", "/api/presets/9", { name: "Renamed" }]])
    replies["PATCH /api/presets/9"] = { status: 400, body: { error: "Not allowed." } }
    t.mock.method(console, "error", () => {})
    renamePreset(presets.value[0], "Rude")
    await settled()
    assert.equal(presets.value[0].name, "Renamed")
    assert.equal(notice.value, "Not allowed.")
  })

  test("deleting from Community moves it back to your presets", async () => {
    await managing([9], [SHARED])
    replies["POST /api/presets/9/unshare"] = { body: { preset: { name: "Shared", code: "shared" } } }
    await unsharePreset(9)
    assert.deepEqual(presets.value, [{ name: "Shared", code: "shared" }])
  })

  test("fully deleting removes it from your presets too", async () => {
    await managing([9], [SHARED, LOCAL])
    replies["DELETE /api/presets/9"] = { body: { deleted: true } }
    await deleteSharedPreset(9)
    assert.deepEqual(presets.value, [LOCAL])
  })

  test("sharing renames the preset to what you called it, and refusing someone else's title links nothing", async () => {
    await managing([], [LOCAL, { name: "Taken", code: "taken" }])
    replies["POST /api/presets"] = { status: 201, body: { preset: { id: 9, name: "Published", code: "local" }, onAccount: true } }
    await sharePreset(presets.value[0], "Published")
    assert.deepEqual(presets.value[0], { name: "Published", code: "local", shared: 9 })
    replies["POST /api/presets"] = { status: 409, body: { error: "This title has already been shared.", id: 3 } }
    await assert.rejects(sharePreset(presets.value[1], "Copy"), /already been shared/)
    assert.deepEqual(presets.value[1], { name: "Taken", code: "taken" })
  })

  test("signed out, deleting from Community remembers the row so sharing again keeps its stats", async () => {
    await signedOutWith([{ name: "Mine", code: "mine", shared: 9 }])
    replies["POST /api/presets/9/unshare"] = { body: { preset: { name: "Mine", code: "mine" } } }
    await unsharePreset(9)
    assert.deepEqual(local(), [{ name: "Mine", code: "mine", unshared: 9 }])
    replies["POST /api/presets"] = { body: { preset: { id: 9, name: "Mine", code: "mine" }, onAccount: false } }
    await sharePreset(presets.value[0], "Mine")
    assert.deepEqual(local(), [{ name: "Mine", code: "mine", shared: 9 }])
    assert.equal(requests.find(request => request.url === "/api/presets").body.id, 9)
  })

  test("signed out, deleting a preset that left Community deletes its row too", async () => {
    await signedOutWith([{ name: "Mine", code: "mine", unshared: 9 }])
    replies["DELETE /api/presets/9"] = { body: { deleted: true } }
    removePreset(presets.value[0])
    await settled()
    assert.deepEqual(local(), [])
    assert.equal(requests.some(request => request.method === "DELETE" && request.url === "/api/presets/9"), true)
  })

  test("a refused share leaves everything as it was", async () => {
    await managing([9], [SHARED])
    replies["PUT /api/presets/9"] = { status: 409, body: { error: "This title has already been shared.", id: 3 } }
    await assert.rejects(replaceWith(replaceTargets("new")[0], "new", "Renamed"), /already been shared/)
    await settled()
    assert.deepEqual(presets.value, [SHARED])
    assert.deepEqual(sent().map(([method]) => method), ["PUT"])
  })

  test("a share this browser can't manage stays online and the preset is no longer linked to it", async () => {
    await managing([], [FAR])
    await replaceWith(replaceTargets("new")[0], "new", "Renamed")
    await settled()
    assert.deepEqual(presets.value, [{ name: "Renamed", code: "new" }])
    assert.equal(requests.some(request => request.method === "PUT"), false)
  })

  test("a preset that is already saved takes over the share and the old one goes", async () => {
    await managing([9], [LOCAL, SHARED])
    replies["PUT /api/presets/9"] = { body: { preset: { id: 9, name: "Renamed", code: "local", votes: 0, rating: null } } }
    await replaceWith(replaceTargets("local")[0], "local", "Renamed")
    await settled()
    assert.deepEqual(presets.value, [{ name: "Renamed", code: "local", shared: 9 }])
  })
})

describe("signing out", () => {
  test("empties the list when everything was moved", async () => {
    setLocal([{ name: "One", code: "code-1" }])
    await signIn()
    assert.equal(presets.value.length, 1)
    account.value = null
    assert.deepEqual(presets.value, [])
  })

  test("going back to the account loads the presets again", async () => {
    await signIn([{ name: "Cloud", code: "cloud" }])
    account.value = null
    await signIn()
    assert.deepEqual(presets.value, [{ name: "Cloud", code: "cloud" }])
  })
})
