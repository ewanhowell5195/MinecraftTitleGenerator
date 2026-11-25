import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { nextTick } from "vue"
import { fakeTimeouts, forbidFetch } from "../helpers/browser.js"

const store = new Map()
let failWrites = false

function writeStore(key, value) {
  if (failWrites) throw new Error("quota exceeded")
  store.set(key, value)
}

globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: writeStore }
forbidFetch()
fakeTimeouts()

const { snapshot } = await import("#lib/settings/settings.js")
const { FILE_VERSION } = await import("#lib/settings/upgrades.js")
const { createObject } = await import("#lib/settings/objects.js")
const { keepTexture } = await import("#lib/title/objects.js")
const { saveError, scene, select } = await import("#lib/state/scene.js")
const { line, setScene } = await import("../helpers/scene.js")

beforeEach(() => {
  setScene(createObject())
})

describe("autosave", () => {
  test("writes the scene after the settle time", async () => {
    const [a] = setScene(createObject({ text: "first" }))
    await nextTick()
    mock.timers.tick(300)
    store.delete("minecraft-title-scene")
    a.text = "saved"
    await nextTick()
    mock.timers.tick(299)
    assert.equal(store.has("minecraft-title-scene"), false)
    mock.timers.tick(1)
    assert.deepEqual(JSON.parse(store.get("minecraft-title-scene")), { version: FILE_VERSION, lines: [{ text: "saved" }], selected: 0, selectedGroup: null })
  })

  test("stores the selection by position", async () => {
    const [, , c] = setScene(createObject({ text: "one" }), ...line(4, "two", "three"))
    select(c)
    scene.selectedGroup = 4
    await nextTick()
    mock.timers.tick(300)
    const saved = JSON.parse(store.get("minecraft-title-scene"))
    assert.equal(saved.selected, 2)
    assert.equal(saved.selectedGroup, 1)
  })

  test("writes what a line's words share once", async () => {
    const customFont = { kind: "ascii", fileName: "ascii.png", data: "data:image/png;base64,FONT", height: 40, lowercase: false }
    const shared = { font: "custom-abc", customFont, textureSource: "custom", customTexture: "data:image/png;base64,TEXTURE" }
    setScene(...["a", "b", "c"].map(text => createObject({ ...shared, text, group: 2 })))
    await nextTick()
    mock.timers.tick(300)
    const text = store.get("minecraft-title-scene")
    assert.equal(text.split("base64,FONT").length, 2)
    assert.equal(text.split("base64,TEXTURE").length, 2)
    assert.deepEqual(JSON.parse(text).lines[0].words, [{ text: "a" }, { text: "b" }, { text: "c" }])
  })

  test("keeps the settings of tabs that aren't in use", async () => {
    setScene(createObject({ text: "kept", textureSource: "gradient", texture: "cracked", tileableScale: 4 }))
    await nextTick()
    mock.timers.tick(300)
    assert.deepEqual(JSON.parse(store.get("minecraft-title-scene")).lines, [{ text: "kept", textureSource: "gradient", texture: "cracked", tileableScale: 4 }])
  })

  test("reports a failed write and clears it after the next success", async () => {
    const [a] = setScene(createObject({ text: "first" }))
    await nextTick()
    failWrites = true
    a.text = "fails"
    await nextTick()
    mock.timers.tick(300)
    failWrites = false
    assert.equal(saveError.value, "Your title couldn't be saved, so changes will be lost if you reload: quota exceeded")
    a.text = "works"
    await nextTick()
    mock.timers.tick(300)
    assert.equal(saveError.value, null)
  })
})

describe("restoring the saved scene", () => {
  async function loadWith(saved, tag) {
    store.set("minecraft-title-scene", saved)
    const module = await import(`../../src/lib/state/scene.js?${tag}`)
    store.delete("minecraft-title-scene")
    return module
  }

  test("brings back the title and its selection", async () => {
    const reference = createObject({ text: "one", hue: 30 })
    const [b, c] = line(3, "two", "three")
    b.matchWidth = c.matchWidth = reference.id
    setScene(reference, b, c)
    select(c)
    scene.selectedGroup = 3
    await nextTick()
    mock.timers.tick(300)
    const module = await loadWith(store.get("minecraft-title-scene"), "restore")
    const [first, second, third] = module.scene.objects
    assert.deepEqual(module.scene.objects.map(object => object.text), ["one", "two", "three"])
    assert.equal(first.hue, 30)
    assert.equal(first.group, null)
    assert.ok(second.group !== null && second.group === third.group)
    assert.deepEqual([second.matchWidth, third.matchWidth], [first.id, first.id])
    assert.equal(module.scene.selected, third.id)
    assert.equal(module.scene.selectedGroup, third.group)
    assert.ok(keepTexture.has(first))
    assert.equal(module.saveError.value, null)
  })

  test("brings back uploads and the settings of tabs that aren't in use", async () => {
    const customFont = { kind: "ascii", fileName: "ascii.png", data: "data:image/png;base64,FONT", height: 40, lowercase: false }
    const shared = { font: "custom-abc", customFont, textureSource: "custom", customTexture: "data:image/png;base64,TEXTURE", texture: "cracked", group: 2 }
    setScene(createObject({ ...shared, text: "a" }), createObject({ ...shared, text: "b", hue: 20 }))
    await nextTick()
    mock.timers.tick(300)
    const module = await loadWith(store.get("minecraft-title-scene"), "uploads")
    assert.deepEqual(module.scene.objects.map(object => snapshot(object)), scene.objects.map(object => ({ ...snapshot(object), group: module.scene.objects[0].group })))
  })

  test("runs a scene stored by an older version through the file upgrades", async () => {
    const module = await loadWith(JSON.stringify({ version: 3, lines: [{ text: "serif", font: "block-serif", spacing: 1, depth: 30 }], selected: 0, selectedGroup: null }), "upgrade")
    assert.equal(module.scene.objects[0].spacing, 3)
    assert.equal(module.scene.objects[0].depthAnchor, "front")
  })

  test("says why a stored scene could not be brought back", async () => {
    const module = await loadWith(JSON.stringify({ version: FILE_VERSION + 1, lines: [{ text: "newer" }] }), "newer")
    assert.equal(module.scene.objects[0].text, "Minecraft")
    assert.equal(module.saveError.value, `Your last title couldn't be restored: it was saved by a newer version of the generator (format ${FILE_VERSION + 1})`)
  })

  describe("stored before scenes had a version", () => {
    test("brings back objects and selection", async () => {
      const saved = { objects: [{ id: 7001, text: "one", hue: 30 }, { id: 7002, text: "two", group: 3, matchWidth: 7001 }, { id: 7003, text: "three", group: 3, matchWidth: 7001 }], selected: 7002, selectedGroup: 3 }
      const module = await loadWith(JSON.stringify(saved), "legacy")
      const [first, second, third] = module.scene.objects
      assert.deepEqual(module.scene.objects.map(object => object.text), ["one", "two", "three"])
      assert.equal(first.hue, 30)
      assert.ok(second.group !== null && second.group === third.group)
      assert.deepEqual([second.matchWidth, third.matchWidth], [first.id, first.id])
      assert.equal(module.scene.selected, second.id)
      assert.equal(module.scene.selectedGroup, second.group)
      assert.ok(keepTexture.has(first))
    })

    test("keeps separate lines that have no group apart", async () => {
      const module = await loadWith(JSON.stringify({ objects: [{ id: 7401, text: "one" }, { id: 7402, text: "two" }] }), "ungrouped")
      assert.deepEqual(module.scene.objects.map(object => object.group), [null, null])
    })

    test("is read as version 4, so only the depth anchor is upgraded", async () => {
      const old = { id: 7501, text: "old", font: "block-serif", spacing: 1, depth: 22, matchWidth: null, scaleX: 1.5 }
      const current = { id: 7502, text: "current", depthAnchor: "back" }
      const update = { id: 7503, text: "update", type: "bottom" }
      const module = await loadWith(JSON.stringify({ objects: [old, current, update] }), "version")
      assert.deepEqual(module.scene.objects.map(object => object.depthAnchor), ["front", "back", "front"])
      assert.equal(module.scene.objects[0].spacing, 1)
      assert.equal(module.scene.objects[0].scaleX, 1.5)
    })

    test("turns a twist anchor into its centre", async () => {
      const module = await loadWith(JSON.stringify({ objects: [{ id: 7601, text: "twist", twistRibbon: 30, twistRibbonAnchor: "right" }] }), "twist")
      assert.equal(module.scene.objects[0].twistRibbonCentre, 100)
      assert.equal(module.scene.objects[0].twistRibbonMirror, true)
    })
  })

  test("fixes a selection that no longer exists", async () => {
    const module = await loadWith(JSON.stringify({ version: FILE_VERSION, lines: [{ text: "one" }], selected: 5, selectedGroup: 2 }), "stale")
    assert.equal(module.scene.selected, module.scene.objects[0].id)
    assert.equal(module.scene.selectedGroup, null)
  })

  test("keeps blank words when some text remains", async () => {
    const module = await loadWith(JSON.stringify({ objects: [{ id: 7201, text: " " }, { id: 7202, text: "x" }] }), "blank")
    assert.equal(module.scene.objects.length, 2)
  })

  test("starts fresh when every word is blank", async () => {
    const module = await loadWith(JSON.stringify({ objects: [{ id: 7301, text: "  " }] }), "empty")
    assert.equal(module.scene.objects.length, 1)
    assert.equal(module.scene.objects[0].text, "Minecraft")
  })

  test("starts fresh from broken JSON", async () => {
    const module = await loadWith("{ nope", "broken")
    assert.equal(module.scene.objects.length, 1)
    assert.equal(module.scene.objects[0].text, "Minecraft")
  })

  test("starts fresh when nothing is saved", async () => {
    const module = await import("../../src/lib/state/scene.js?nothing")
    assert.equal(module.scene.objects.length, 1)
    assert.equal(module.scene.selected, module.scene.objects[0].id)
  })
})
