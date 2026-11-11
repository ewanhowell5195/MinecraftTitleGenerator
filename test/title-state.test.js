import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { quietStorage } from "./helpers/browser.js"

quietStorage()

const { reactive } = await import("vue")
const { heights, rowStart } = await import("../src/lib/rows.js")
const { editorTitle, scene, words } = await import("../src/lib/scene.js")
const { createObject } = await import("../src/lib/settings.js")
const { createTitle } = await import("../src/lib/title.js")

function separate(objects) {
  return createTitle(reactive(objects), { render: false, fov: 43, fixedDistance: false })
}

describe("a separate title", () => {
  test("keeps its own runtime, heights and problems", () => {
    const title = separate([])
    assert.notEqual(title.runtime, editorTitle.runtime)
    assert.notEqual(title.heights, editorTitle.heights)
    assert.notEqual(title.problems, editorTitle.problems)
  })

  test("groups words from its own objects", () => {
    const own = createObject({ text: "own", group: 7 })
    const other = createObject({ text: "other", group: 7 })
    const title = separate([own, other])
    assert.equal(words(title.objects[0], title).length, 2)
    assert.equal(words(title.objects[0]).length, 0)
  })

  test("stacks rows from its own objects and heights", () => {
    const first = createObject({ text: "first", row: 0 })
    const second = createObject({ text: "second", row: 1 })
    const title = separate([first, second])
    title.heights[first.id] = { height: 100, capHeight: 100, scaleY: 1 }
    const start = rowStart(title.objects[1], title)
    assert.ok(start > 100)
    assert.equal(heights[first.id], undefined)
  })
})

describe("the editor's title", () => {
  test("follows the scene when its list is replaced", () => {
    const replaced = [createObject({ text: "new" })]
    const before = scene.objects
    scene.objects = replaced
    assert.equal(editorTitle.objects, scene.objects)
    assert.equal(editorTitle.objects[0].text, "new")
    scene.objects = before
  })
})
