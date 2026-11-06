import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

const stored = new Map()
const requests = []
let replies = {}

globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
globalThis.confirm = () => true
globalThis.BroadcastChannel = class {
  postMessage() {}
}
globalThis.fetch = async (url, options) => {
  const method = options?.method ?? "GET"
  const body = options?.body ? JSON.parse(options.body) : undefined
  requests.push({ method, url, body })
  const reply = replies[`${method} ${url}`]
  if (!reply) return { ok: true, status: 200, json: async () => ({ kept: [] }) }
  const value = typeof reply === "function" ? reply(body) : reply
  return { ok: (value.status ?? 200) < 400, status: value.status ?? 200, json: async () => value.body }
}
mock.timers.enable({ apis: ["setTimeout"] })

const { account } = await import("../src/lib/community.js")
const { notice } = await import("../src/lib/notices.js")
const { addPreset, markShared, presets, presetsError, presetsLoading, removePreset, renamePreset, unmarkShared } = await import("../src/lib/presets.js")

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
  requests.length = 0
  replies = {}
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
    account.value = SOMEONE
    assert.equal(presetsLoading.value, true)
    assert.deepEqual(presets.value, [])
    await settled()
    globalThis.fetch = realFetch
    finish()
    await settled()
    assert.equal(presetsLoading.value, false)
    assert.deepEqual(presets.value, [{ name: "Cloud", code: "cloud" }])
  })

  test("moves local presets up, then clears them from this browser", async () => {
    setLocal([{ name: "One", code: "code-1" }, { name: "Two", code: "code-2", shared: 4 }])
    await signIn([{ name: "Cloud", code: "cloud" }])
    assert.deepEqual(sentTo("POST")[0].body.presets, [{ name: "One", code: "code-1" }, { name: "Two", code: "code-2", shared: 4 }])
    assert.deepEqual(presets.value.map(preset => preset.name), ["Cloud", "One", "Two"])
    assert.deepEqual(local(), [])
    assert.match(notice.value, /Added 2 presets/)
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

  test("a failed upload keeps everything in this browser and says so", async () => {
    const list = [{ name: "One", code: "code-1" }]
    setLocal(list)
    replies["POST /api/saved"] = { status: 500, body: { error: "Nope." } }
    const logged = mock.method(console, "error", () => {})
    await signIn()
    logged.mock.restore()
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
      ["PATCH", { code: "code-1", shared: 9 }],
      ["PATCH", { code: "code-1", shared: null }],
      ["DELETE", { code: "code-1" }]
    ])
    assert.deepEqual(local(), [])
  })

  test("a failed change is put back and shows why", async () => {
    await signIn([{ name: "One", code: "code-1" }])
    replies["DELETE /api/saved"] = { status: 500, body: { error: "It broke." } }
    const logged = mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    assert.deepEqual(presets.value, [])
    await settled()
    logged.mock.restore()
    assert.deepEqual(presets.value, [{ name: "One", code: "code-1" }])
    assert.equal(notice.value, "It broke.")
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
    assert.deepEqual(sentTo("POST").map(request => request.body.presets), [[{ name: "Waiting", code: "waiting", shared: 3 }]])
    assert.deepEqual(presets.value, [{ name: "Waiting", code: "waiting", shared: 3 }, { name: "Later", code: "later", inBrowser: true }])
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

  test("a failed move keeps the preset in this browser and the delete still stands", async () => {
    await fullAccount()
    replies["POST /api/saved"] = { status: 500, body: { error: "Nope." } }
    const logged = mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    await settled()
    logged.mock.restore()
    assert.deepEqual(presets.value.map(preset => preset.code), ["waiting", "later"])
    assert.equal(presets.value[0].inBrowser, true)
    assert.equal(local().length, 2)
  })

  test("a failed delete puts the preset back and moves nothing", async () => {
    await fullAccount()
    replies["DELETE /api/saved"] = { status: 500, body: { error: "It broke." } }
    const logged = mock.method(console, "error", () => {})
    removePreset(presets.value[0])
    await settled()
    logged.mock.restore()
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

  test("browser-only presets aren't wiped when the account list failed to load", async () => {
    setLocal([{ name: "Earlier", code: "earlier" }])
    replies["GET /api/saved"] = { status: 500, body: { error: "Nope." } }
    const logged = mock.method(console, "error", () => {})
    account.value = SOMEONE
    await settled()
    replies["POST /api/saved"] = { body: { kept: ["code-1"] } }
    addPreset("New", "code-1")
    await settled()
    logged.mock.restore()
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
