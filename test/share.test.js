import { beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fakeTimeouts, quietStorage, viteEnv } from "./helpers/browser.js"

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

const { FILE_VERSION, createObject } = await import("../src/lib/settings.js")
const { scene, sharedLink } = await import("../src/lib/scene.js")
const { fileError } = await import("../src/lib/file.js")
const { encodeTitle } = await import("../src/lib/linkformat.js")
const { openSharedLink, shareLink } = await import("../src/lib/share.js")
const { setTitle } = await import("./helpers/scene.js")

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
})
