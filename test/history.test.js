import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { nextTick } from "vue"

globalThis.localStorage = { getItem: () => null, setItem: () => {} }
globalThis.fetch = () => assert.fail("fetch must not be called")
mock.timers.enable({ apis: ["setTimeout"] })

const { LAYER, createObject } = await import("../src/lib/settings.js")
const { addObject, keepTexture, scene, select } = await import("../src/lib/scene.js")
const { history, holdHistory, quietly, redo, undo } = await import("../src/lib/history.js")
const { openTitle } = await import("../src/lib/file.js")

async function settle() {
  await nextTick()
  mock.timers.tick(300)
}

async function start() {
  holdHistory(false)
  const object = createObject({ text: "start" })
  quietly(() => scene.objects.splice(0, scene.objects.length, object))
  scene.selected = object.id
  scene.selectedGroup = null
  await settle()
  history.undo = []
  history.redo = []
  return object
}

async function change(object, values) {
  Object.assign(object, values)
  await settle()
}

let object

beforeEach(async () => {
  object = await start()
})

describe("undo and redo", () => {
  test("a settled change can be undone and redone", async () => {
    await change(object, { text: "changed" })
    assert.equal(history.undo.length, 1)
    undo()
    assert.equal(object.text, "start")
    assert.equal(history.undo.length, 0)
    assert.equal(history.redo.length, 1)
    redo()
    assert.equal(object.text, "changed")
    assert.equal(history.undo.length, 1)
    assert.equal(history.redo.length, 0)
  })

  test("steps back through several changes in order", async () => {
    await change(object, { text: "one" })
    await change(object, { text: "two" })
    await change(object, { text: "three" })
    undo()
    assert.equal(object.text, "two")
    undo()
    assert.equal(object.text, "one")
    redo()
    assert.equal(object.text, "two")
    undo()
    undo()
    assert.equal(object.text, "start")
  })

  test("undo takes in a change that has not settled yet", async () => {
    object.text = "pending"
    await nextTick()
    undo()
    assert.equal(object.text, "start")
    redo()
    assert.equal(object.text, "pending")
  })

  test("changes close together make one step", async () => {
    object.text = "one"
    await nextTick()
    mock.timers.tick(299)
    object.hue = 20
    await nextTick()
    mock.timers.tick(299)
    assert.equal(history.undo.length, 0)
    object.text = "two"
    await settle()
    assert.equal(history.undo.length, 1)
    undo()
    assert.equal(object.text, "start")
    assert.equal(object.hue, 0)
  })

  test("a change put back before settling adds no step", async () => {
    object.text = "other"
    await nextTick()
    object.text = "start"
    await settle()
    assert.equal(history.undo.length, 0)
  })

  test("a new change clears redo", async () => {
    await change(object, { text: "one" })
    undo()
    assert.equal(history.redo.length, 1)
    await change(object, { text: "two" })
    assert.equal(history.redo.length, 0)
    redo()
    assert.equal(object.text, "two")
  })

  test("nothing to undo or redo does nothing", () => {
    undo()
    redo()
    assert.equal(object.text, "start")
    assert.equal(history.undo.length, 0)
    assert.equal(history.redo.length, 0)
  })

  test("undoing does not create further steps", async () => {
    await change(object, { text: "one" })
    undo()
    await settle()
    assert.equal(history.undo.length, 0)
    assert.equal(history.redo.length, 1)
    redo()
    await settle()
    assert.equal(history.undo.length, 1)
    assert.equal(history.redo.length, 0)
  })

  test("the same object stays in the scene", async () => {
    await change(object, { text: "one" })
    undo()
    assert.equal(scene.objects[0], object)
  })

  test("an added object goes on undo and returns with its id on redo", async () => {
    addObject()
    await settle()
    const added = scene.objects[1]
    assert.equal(scene.selected, added.id)
    undo()
    assert.equal(scene.objects.length, 1)
    assert.equal(scene.selected, object.id)
    redo()
    assert.equal(scene.objects.length, 2)
    assert.equal(scene.objects[1].id, added.id)
    assert.equal(scene.selected, added.id)
    assert.ok(keepTexture.has(scene.objects[1]))
  })

  test("an object added later is tracked too", async () => {
    addObject()
    await settle()
    const added = scene.objects[1]
    await change(added, { text: "edited" })
    assert.equal(history.undo.length, 2)
    undo()
    assert.equal(added.text, "text")
  })

  test("changing the selection alone adds no step", async () => {
    addObject()
    await settle()
    const steps = history.undo.length
    select(object)
    await settle()
    assert.equal(history.undo.length, steps)
  })

  test("undoing a font change keeps the texture", async () => {
    await change(object, { font: "other" })
    keepTexture.delete(object)
    undo()
    assert.equal(object.font, "minecraft-ten")
    assert.ok(keepTexture.has(object))
  })

  test("undoing another change does not touch the texture flag", async () => {
    await change(object, { hue: 10 })
    keepTexture.delete(object)
    undo()
    assert.equal(keepTexture.has(object), false)
  })

  test("long strings come back whole", async () => {
    const file = `data:image/png;base64,${"A".repeat(4000)}`
    await change(object, { overlayMode: "custom", overlays: [{ ...LAYER, overlay: "upload", file }] })
    await change(object, { overlays: [] })
    undo()
    assert.equal(object.overlays[0].file, file)
    undo()
    assert.deepEqual(Array.from(object.overlays), [])
    redo()
    assert.equal(object.overlays[0].file, file)
  })

  test("two different long strings stay apart", async () => {
    const first = "a".repeat(2000)
    const second = "b".repeat(2000)
    await change(object, { text: first })
    await change(object, { text: second })
    undo()
    assert.equal(object.text, first)
    redo()
    assert.equal(object.text, second)
  })

  test("opening a title is one step", async () => {
    await openTitle({ name: "a.mctitle", text: async () => JSON.stringify({ format: "minecraft-title", version: 1, lines: [{ text: "one" }, { text: "two" }] }) })
    await settle()
    assert.equal(history.undo.length, 1)
    assert.equal(scene.objects.length, 2)
    undo()
    assert.equal(scene.objects.length, 1)
    assert.equal(scene.objects[0].id, object.id)
    assert.equal(scene.objects[0].text, "start")
    assert.equal(scene.selected, object.id)
  })
})

describe("the undo limit", () => {
  test("keeps the latest 200 steps", async () => {
    for (let i = 1; i <= 205; i++) await change(object, { text: `t${i}` })
    assert.equal(history.undo.length, 200)
    for (let i = 0; i < 200; i++) undo()
    assert.equal(object.text, "t5")
    assert.equal(history.undo.length, 0)
    assert.equal(history.redo.length, 200)
    undo()
    assert.equal(object.text, "t5")
  })
})

describe("quietly", () => {
  test("does not create an undo step", async () => {
    quietly(() => object.font = "loaded")
    await settle()
    assert.equal(object.font, "loaded")
    assert.equal(history.undo.length, 0)
  })

  test("does not clear redo", async () => {
    await change(object, { text: "one" })
    undo()
    quietly(() => object.hue = 10)
    await settle()
    assert.equal(history.redo.length, 1)
  })

  test("a quiet change stays when the next real change is undone", async () => {
    await change(object, { text: "one" })
    quietly(() => object.hue = 10)
    await settle()
    await change(object, { text: "two" })
    undo()
    assert.equal(object.text, "one")
    assert.equal(object.hue, 10)
  })

  test("goes along with a real change made at the same time", async () => {
    object.text = "real"
    await nextTick()
    quietly(() => object.hue = 10)
    await settle()
    assert.equal(history.undo.length, 1)
    undo()
    assert.equal(object.text, "start")
    assert.equal(object.hue, 0)
  })

  test("nests", async () => {
    quietly(() => {
      quietly(() => object.hue = 10)
      object.saturation = 50
    })
    await settle()
    assert.equal(history.undo.length, 0)
  })

  test("stops being quiet after an error", async () => {
    assert.throws(() => quietly(() => {
      throw new Error("failed")
    }), { message: "failed" })
    await change(object, { text: "real" })
    assert.equal(history.undo.length, 1)
  })
})

describe("holdHistory", () => {
  test("waits for the release before making a step", async () => {
    holdHistory(true)
    object.scaleX = 1.5
    await nextTick()
    mock.timers.tick(5000)
    object.scaleX = 2
    await nextTick()
    mock.timers.tick(5000)
    assert.equal(history.undo.length, 0)
    holdHistory(false)
    mock.timers.tick(299)
    assert.equal(history.undo.length, 0)
    mock.timers.tick(1)
    assert.equal(history.undo.length, 1)
    undo()
    assert.equal(object.scaleX, 1)
  })

  test("takes in a change made just before the hold", async () => {
    object.text = "before"
    await nextTick()
    holdHistory(true)
    mock.timers.tick(5000)
    object.scaleX = 2
    await nextTick()
    holdHistory(false)
    mock.timers.tick(300)
    assert.equal(history.undo.length, 1)
    undo()
    assert.equal(object.text, "start")
    assert.equal(object.scaleX, 1)
  })

  test("a release without changes adds nothing", () => {
    holdHistory(true)
    holdHistory(false)
    mock.timers.tick(300)
    assert.equal(history.undo.length, 0)
  })

  test("a quiet change during a hold adds nothing", async () => {
    holdHistory(true)
    quietly(() => object.hue = 10)
    await nextTick()
    holdHistory(false)
    mock.timers.tick(300)
    assert.equal(history.undo.length, 0)
  })
})
