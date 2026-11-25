import { beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fakeTimeouts, quietStorage, viteEnv } from "../helpers/browser.js"

viteEnv({ DEV: false })

const posts = []

async function recordPost(url, options) {
  posts.push({ url, method: options.method, ...JSON.parse(options.body) })
  return { ok: true }
}

globalThis.fetch = recordPost
quietStorage()
globalThis.location = { href: "https://example.test/app/", origin: "https://example.test", pathname: "/app/", search: "" }
fakeTimeouts()

const { FILE_VERSION } = await import("#lib/settings/upgrades.js")
const { createObject } = await import("#lib/settings/objects.js")
const { scene, sharedLink } = await import("#lib/state/scene.js")
const { fileError } = await import("#lib/state/notices.js")
const { encodeTitle } = await import("#lib/link/linkformat.js")
const { openSharedLink, shareLink } = await import("#lib/state/share.js")
const { undo } = await import("#lib/state/history.js")
const { setTitle } = await import("../helpers/scene.js")

describe("sharing a title", () => {
  beforeEach(() => {
    posts.length = 0
  })

  test("counts towards the stats", () => {
    setTitle(createObject({ text: "stats", texture: "grass" }))
    shareLink()
    assert.equal(posts.length, 1)
    assert.equal(posts[0].method, "POST")
    assert.match(posts[0].url, /minecrafttitlegenerator\/stats$/)
    assert.deepEqual(posts[0].ids, ["minecraft-ten", "minecraft-ten.grass"])
  })

  test("sends a Minecraft texture with its version, apart from the other ids", () => {
    setTitle(createObject({ text: "block", textureSource: "tileable", tileable: "dirt", tileableSource: "minecraft", minecraftTexture: "stone", minecraftVersion: "1.8.9" }))
    shareLink()
    assert.deepEqual(posts[0].ids, ["minecraft-ten"])
    assert.deepEqual(posts[0].minecraft, [{ texture: "stone", version: "1.8.9" }])
  })

  test("sends a texture once when two lines use it", () => {
    const line = { textureSource: "tileable", tileableSource: "minecraft", minecraftTexture: "stone" }
    setTitle(createObject({ ...line, text: "one", minecraftVersion: "1.8.9" }), createObject({ ...line, text: "two", minecraftVersion: "26.3" }))
    shareLink()
    assert.equal(posts[0].minecraft.length, 1)
  })

  test("leaves out the Minecraft list when no line uses one", () => {
    setTitle(createObject({ text: "plain", texture: "grass" }))
    shareLink()
    assert.equal(posts[0].minecraft, undefined)
  })

  test("sharing the same title again does not count twice", () => {
    setTitle(createObject({ text: "twice", texture: "grass" }))
    shareLink()
    shareLink()
    assert.equal(posts.length, 1)
  })

  test("sharing after a change counts again", () => {
    const object = createObject({ text: "before", texture: "grass" })
    setTitle(object)
    shareLink()
    object.text = "after"
    shareLink()
    assert.equal(posts.length, 2)
  })

  test("returns a link to this page", () => {
    setTitle(createObject({ text: "link", texture: "grass" }))
    const { link, skipped } = shareLink()
    assert.match(link, /^https:\/\/example\.test\/app\/\?title=[A-Za-z0-9_-]+$/)
    assert.equal(skipped, 0)
  })

  test("replaces the title already in the link and keeps the rest", () => {
    location.href = "https://example.test/app/?other=1&title=old#title=older"
    setTitle(createObject({ text: "link", texture: "grass" }))
    const { link } = shareLink()
    location.href = "https://example.test/app/"
    assert.match(link, /^https:\/\/example\.test\/app\/\?other=1&title=[A-Za-z0-9_-]+$/)
    assert.doesNotMatch(link, /old/)
  })
})

describe("a preset's link", () => {
  const replaced = []
  const code = encodeTitle({ version: FILE_VERSION, lines: [{ text: "preset", hue: 40 }] }).code

  async function openPreset(value, reply = { ok: true, status: 200, body: { preset: { id: 330, name: "Quest", code, downloads: 4 } } }) {
    globalThis.history = { state: null, replaceState: (state, title, url) => replaced.push(url.href) }
    globalThis.fetch = async (url, options) => {
      posts.push({ url, method: options?.method ?? "GET" })
      return { ok: reply.ok, status: reply.status, json: async () => url.endsWith("/download") ? { counted: true } : reply.body }
    }
    location.href = `https://example.test/app/?preset=${value}`
    location.search = `?preset=${value}`
    await openSharedLink()
    globalThis.fetch = recordPost
    location.search = ""
  }

  beforeEach(() => {
    posts.length = 0
    replaced.length = 0
    fileError.value = null
    Object.assign(sharedLink, { open: false, preset: null })
    setTitle(createObject({ text: "before" }))
  })

  test("opens it, remembers it and keeps it in the address", async () => {
    await openPreset(330)
    assert.equal(fileError.value, null)
    assert.deepEqual(scene.objects.map(object => [object.text, object.hue]), [["preset", 40]])
    assert.deepEqual(scene.preset, { id: 330, name: "Quest" })
    assert.deepEqual(sharedLink, { open: true, preset: 330 })
    assert.deepEqual(replaced, [])
    assert.ok(posts.some(post => post.url.endsWith("/330/download") && post.method === "POST"))
  })

  test("is what sharing gives until something is edited", async () => {
    await openPreset(330)
    assert.deepEqual(shareLink(), { link: "https://example.test/app/?preset=330", skipped: 0 })
    await Promise.resolve()
    scene.objects[0].hue = 90
    assert.deepEqual(sharedLink, { open: false, preset: null })
    assert.deepEqual(replaced, ["https://example.test/app/"])
    location.href = "https://example.test/app/"
    assert.match(shareLink().link, /[?]title=/)
  })

  test("doesn't come back when the edit is undone", async () => {
    await openPreset(330)
    await Promise.resolve()
    scene.objects[0].hue = 90
    undo()
    assert.equal(sharedLink.preset, null)
  })

  test("a preset that doesn't exist says so and leaves the title and address", async () => {
    await openPreset(99, { ok: false, status: 404, body: { error: "This preset doesn't exist." } })
    assert.equal(fileError.value, "Couldn't open this link: This preset doesn't exist.")
    assert.deepEqual(scene.objects.map(object => object.text), ["before"])
    assert.deepEqual(sharedLink, { open: false, preset: null })
    assert.deepEqual(replaced, ["https://example.test/app/"])
  })

  test("refuses a link without a number", async () => {
    await openPreset("abc")
    assert.equal(fileError.value, "Couldn't open this link: it doesn't have a preset's number")
    assert.equal(posts.length, 0)
  })
})

describe("opening a shared link", () => {
  const replaced = []

  function openCode(code) {
    replaced.length = 0
    globalThis.history = { state: null, replaceState: (state, title, url) => replaced.push(url.href) }
    location.href = `https://example.test/app/?title=${code}`
    location.search = `?title=${code}`
    openSharedLink()
    location.href = "https://example.test/app/"
    location.search = ""
  }

  beforeEach(() => {
    fileError.value = null
    sharedLink.open = false
    setTitle(createObject({ text: "before" }))
  })

  test("shows the title in the link", () => {
    openCode(encodeTitle({ version: FILE_VERSION, lines: [{ text: "shared", hue: 40 }] }).code)
    assert.equal(fileError.value, null)
    assert.deepEqual(scene.objects.map(object => [object.text, object.hue]), [["shared", 40]])
    assert.equal(sharedLink.open, true)
    assert.deepEqual(replaced, [])
  })

  test("refuses a setting it can't read, names it and takes the title out of the address", () => {
    openCode(encodeTitle({ version: FILE_VERSION, lines: [{ text: 5 }] }).code)
    assert.equal(fileError.value, "Couldn't open this link: it has a setting that can't be read: text")
    assert.deepEqual(scene.objects.map(object => object.text), ["before"])
    assert.equal(sharedLink.open, false)
    assert.deepEqual(replaced, ["https://example.test/app/"])
  })

  test("refuses a title the editor can't hold", () => {
    openCode(encodeTitle({ version: FILE_VERSION, lines: [{ text: "a", matchWidth: 0 }] }).code)
    assert.equal(fileError.value, "Couldn't open this link: line 0 matches its own width")
    assert.deepEqual(scene.objects.map(object => object.text), ["before"])
  })

  async function openFileUrl(address, served) {
    replaced.length = 0
    globalThis.history = { state: null, replaceState: (state, title, url) => replaced.push(url.href) }
    globalThis.fetch = async url => url === address && served ? { ok: served.status === 200, status: served.status, text: async () => served.text } : { ok: false, status: 404 }
    location.href = `https://example.test/app/?title=${encodeURIComponent(address)}`
    location.search = `?title=${encodeURIComponent(address)}`
    await openSharedLink()
    globalThis.fetch = recordPost
    location.href = "https://example.test/app/"
    location.search = ""
  }

  test("opens a title file from a link to it", async () => {
    const address = "https://raw.githubusercontent.com/owner/repo/abc/reports/x/title.mctitle"
    await openFileUrl(address, { status: 200, text: JSON.stringify({ format: "minecraft-title", version: FILE_VERSION, lines: [{ text: "from a file", hue: 12 }] }) })
    assert.equal(fileError.value, null)
    assert.deepEqual(scene.objects.map(object => [object.text, object.hue]), [["from a file", 12]])
    assert.equal(sharedLink.open, true)
  })

  test("refuses a title file link that can't be downloaded or isn't a title", async () => {
    await openFileUrl("https://example.test/missing.mctitle", null)
    assert.equal(fileError.value, "Couldn't open this link: its title file couldn't be downloaded (404)")
    assert.deepEqual(replaced, ["https://example.test/app/"])
    await openFileUrl("https://example.test/other.json", { status: 200, text: "{\"format\":\"other\"}" })
    assert.equal(fileError.value, "Couldn't open this link: this isn't a Minecraft title file")
    assert.deepEqual(scene.objects.map(object => object.text), ["before"])
    assert.equal(sharedLink.open, false)
  })
})
