import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

function withViteEnv(url, context, nextLoad) {
  const result = nextLoad(url, context)
  if (!url.endsWith("/src/lib/stats.js")) return result
  return { ...result, source: `import.meta.env = { DEV: false }\n${result.source}` }
}

registerHooks({ load: withViteEnv })

const stored = new Map()
const posts = []
let answer = true

globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
globalThis.fetch = async (url, options) => {
  posts.push(JSON.parse(options.body).ids)
  return { ok: true }
}
globalThis.confirm = () => answer
mock.timers.enable({ apis: ["setTimeout"] })

const { createObject, LAYER } = await import("../src/lib/settings.js")
const { scene, validSelection } = await import("../src/lib/scene.js")
const { fileError } = await import("../src/lib/file.js")
const { decodeTitle } = await import("../src/lib/linkformat.js")
const { NAME_LIMIT, addPreset, loadPreset, markShared, presets, removePreset, renamePreset, savePreset, savedPreset } = await import("../src/lib/presets.js")

const STORAGE = "minecraft-title-presets"

function setTitle(...objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
}

function savedList() {
  return JSON.parse(stored.get(STORAGE))
}

describe("presets", () => {
  beforeEach(() => {
    stored.clear()
    presets.value = []
    posts.length = 0
    answer = true
    savedPreset.value = null
    fileError.value = null
  })

  test("are stored as the link code, not the title's settings", async () => {
    setTitle(createObject({ text: "stone", texture: "cracked", hue: 120 }))
    await savePreset()
    const [preset] = savedList()
    assert.deepEqual(Object.keys(preset), ["name", "code"])
    assert.equal(typeof preset.code, "string")
    assert.equal(decodeTitle(preset.code).lines[0].hue, 120)
    assert.equal(stored.get(STORAGE).includes("cracked\":"), false)
  })

  test("are named after the title's text", async () => {
    setTitle(createObject({ text: "My Server" }), createObject({ type: "bottom", text: "season 2" }))
    await savePreset()
    assert.equal(presets.value[0].name, "My Server season 2")
    assert.equal(savedPreset.value.name, "My Server season 2")
  })

  test("leave out hidden lines from the name", async () => {
    setTitle(createObject({ text: "shown" }), createObject({ text: "secret", hidden: true }))
    await savePreset()
    assert.equal(presets.value[0].name, "shown")
  })

  test("get a number when the name is taken by a different title", () => {
    addPreset("stone", "a")
    addPreset("stone", "b")
    addPreset("stone", "c")
    assert.deepEqual(presets.value.map(preset => preset.name), ["stone", "stone 2", "stone 3"])
  })

  test("saving the same title twice keeps one preset", async () => {
    setTitle(createObject({ text: "twice" }))
    await savePreset()
    await savePreset()
    assert.equal(presets.value.length, 1)
    assert.equal(savedPreset.value.name, "twice")
  })

  test("a title with no text still gets a name", () => {
    assert.equal(addPreset("", "a").name, "Title")
  })

  test("count towards the stats", async () => {
    setTitle(createObject({ text: "counted", texture: "grass" }))
    await savePreset()
    assert.deepEqual(posts[0], ["minecraft-ten", "minecraft-ten.grass"])
  })

  test("report uploaded overlays that could not be kept", async () => {
    setTitle(createObject({ text: "upload", overlayMode: "custom", overlays: [{ ...LAYER, source: "file", file: "data:image/png;base64,AAAA" }] }))
    await savePreset()
    assert.equal(savedPreset.value.skipped, 1)
    assert.equal(stored.get(STORAGE).includes("data:image/png"), false)
  })

  test("a full browser store reports the problem and keeps the list", async () => {
    addPreset("first", "a")
    const setItem = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error("the quota has been exceeded")
    }
    setTitle(createObject({ text: "too much" }))
    await savePreset()
    localStorage.setItem = setItem
    assert.equal(presets.value.length, 1)
    assert.match(fileError.value, /^Couldn't save this preset: the quota has been exceeded/)
  })

  test("can be renamed without touching the title or the code", () => {
    const preset = addPreset("stone", "a")
    const renamed = renamePreset(preset, "  My favourite  ")
    assert.equal(renamed.name, "My favourite")
    assert.deepEqual(savedList(), [{ name: "My favourite", code: "a" }])
  })

  test("an empty name keeps the old one", () => {
    const preset = addPreset("stone", "a")
    assert.equal(renamePreset(preset, "   ").name, "stone")
    assert.equal(savedList()[0].name, "stone")
  })

  test("a long name is cut to the limit", () => {
    const preset = addPreset("stone", "a")
    assert.equal(renamePreset(preset, "x".repeat(100)).name.length, NAME_LIMIT)
  })

  test("a renamed preset can be renamed again from what it returned", () => {
    const first = addPreset("stone", "a")
    const second = renamePreset(first, "two")
    assert.equal(renamePreset(second, "three").name, "three")
    assert.equal(presets.value.length, 1)
  })

  test("saving the same title again keeps the name you gave it", async () => {
    setTitle(createObject({ text: "plain" }))
    await savePreset()
    renamePreset(presets.value[0], "Better name")
    await savePreset()
    assert.deepEqual(presets.value.map(preset => preset.name), ["Better name"])
    assert.equal(savedPreset.value.name, "Better name")
  })

  test("remember that they were shared", () => {
    const preset = addPreset("stone", "a")
    markShared(preset, 12)
    assert.deepEqual(savedList(), [{ name: "stone", code: "a", shared: 12 }])
    assert.equal(renamePreset(presets.value[0], "new name").shared, 12)
  })

  test("can be removed", () => {
    const first = addPreset("first", "a")
    addPreset("second", "b")
    removePreset(first)
    assert.deepEqual(savedList().map(preset => preset.name), ["second"])
    assert.deepEqual(presets.value.map(preset => preset.name), ["second"])
  })

  test("open back into the same title", async () => {
    setTitle(createObject({ text: "kept", hue: 42 }), createObject({ type: "bottom", text: "below" }))
    await savePreset()
    const [preset] = presets.value
    setTitle(createObject({ text: "something else" }))
    assert.equal(loadPreset(preset), true)
    assert.deepEqual(scene.objects.map(object => object.text), ["kept", "below"])
    assert.equal(scene.objects[0].hue, 42)
  })

  test("do not replace the title when you say no", async () => {
    setTitle(createObject({ text: "saved" }))
    await savePreset()
    const [preset] = presets.value
    setTitle(createObject({ text: "current" }))
    answer = false
    assert.equal(loadPreset(preset), false)
    assert.equal(scene.objects[0].text, "current")
  })

  test("a damaged preset reports the problem and leaves the title", () => {
    setTitle(createObject({ text: "current" }))
    assert.equal(loadPreset({ name: "broken", code: "1!!!" }), true)
    assert.equal(scene.objects[0].text, "current")
    assert.match(fileError.value, /^Couldn't open broken: /)
  })
})
