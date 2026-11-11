import { beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fakeTimeouts, forbidFetch, quietStorage } from "./helpers/browser.js"

quietStorage()
forbidFetch()
fakeTimeouts()

const { createObject } = await import("../src/lib/settings.js")
const { editorTitle, scene } = await import("../src/lib/scene.js")
const { heights, lineArc, rowStart } = await import("../src/lib/rows.js")
const { placementOf } = await import("../src/lib/placement.js")

function setScene(...objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
}

beforeEach(() => {
  for (const key of Object.keys(heights)) delete heights[key]
  setScene()
})

describe("rowStart above the title", () => {
  test("row 0 starts at zero whatever its spacing", () => {
    const object = createObject({ row: 0, rowSpacing: 10 })
    setScene(object)
    assert.equal(rowStart(object), 0)
  })

  test("row 1 starts after the height of row 0", () => {
    const base = createObject({ row: 0 })
    const object = createObject({ row: 1 })
    setScene(base, object)
    assert.equal(rowStart(object), 48)
  })

  test("row 0's spacing does not push row 1", () => {
    const base = createObject({ row: 0, rowSpacing: 10 })
    const object = createObject({ row: 1 })
    setScene(base, object)
    assert.equal(rowStart(object), 48)
  })

  test("a row's own spacing is added", () => {
    const base = createObject({ row: 0 })
    const object = createObject({ row: 1, rowSpacing: 5 })
    setScene(base, object)
    assert.equal(rowStart(object), 53)
  })

  test("spacing of rows between carries up", () => {
    const base = createObject({ row: 0 })
    const middle = createObject({ row: 1, rowSpacing: 5 })
    const object = createObject({ row: 2 })
    setScene(base, middle, object)
    assert.equal(rowStart(object), 101)
  })

  test("the tallest object in a row decides", () => {
    const short = createObject({ row: 0 })
    const tall = createObject({ row: 0, scaleY: 2 })
    const object = createObject({ row: 1 })
    setScene(short, tall, object)
    assert.equal(rowStart(object), 88)
  })

  test("an empty row takes the height of the object itself", () => {
    const base = createObject({ row: 0 })
    const object = createObject({ row: 2, scaleY: 2 })
    setScene(base, object)
    assert.equal(rowStart(object), 48 + 88)
  })
})

describe("rowStart below the title", () => {
  test("row -1 ends at zero", () => {
    const object = createObject({ row: -1 })
    setScene(object)
    assert.equal(rowStart(object), -48)
  })

  test("row -1 is moved down by its spacing", () => {
    const object = createObject({ row: -1, rowSpacing: 5 })
    setScene(object)
    assert.equal(rowStart(object), -53)
  })

  test("row -2 starts below row -1", () => {
    const above = createObject({ row: -1 })
    const object = createObject({ row: -2 })
    setScene(above, object)
    assert.equal(rowStart(object), -96)
  })

  test("the lowest object in a row decides", () => {
    const short = createObject({ row: -1 })
    const tall = createObject({ row: -1, scaleY: 2 })
    const object = createObject({ row: -2 })
    setScene(short, tall, object)
    assert.equal(rowStart(object), -88 - 48)
  })

  test("positive rows are not counted", () => {
    const above = createObject({ row: 1 })
    const object = createObject({ row: -1 })
    setScene(above, object)
    assert.equal(rowStart(object), -48)
  })
})

describe("rowStart scaling by type", () => {
  test("bottom rows scale their height and spacing", () => {
    const base = createObject({ type: "bottom", row: 0 })
    const object = createObject({ type: "bottom", row: 1, rowSpacing: 2 })
    setScene(base, object)
    near(rowStart(object), 1.67665 * 48 + 1.67665 * 2)
  })

  test("small rows scale height without outline padding or spacing scale", () => {
    const base = createObject({ type: "small", row: 0, border: 3 })
    const object = createObject({ type: "small", row: 1, rowSpacing: 2 })
    setScene(base, object)
    near(rowStart(object), 0.43021 * 44 + 2)
  })

  test("types stack separately", () => {
    const top = createObject({ type: "top", row: 1, scaleY: 5 })
    const bottom = createObject({ type: "bottom", row: 1 })
    const base = createObject({ type: "bottom", row: 0 })
    setScene(top, bottom, base)
    near(rowStart(bottom), 1.67665 * 48)
    assert.equal(rowStart(top), 208)
  })
})

describe("rowStart inputs", () => {
  test("hidden objects do not take up a row", () => {
    const hidden = createObject({ row: 0, scaleY: 5, hidden: true })
    const visible = createObject({ row: 0 })
    const object = createObject({ row: 1 })
    setScene(hidden, visible, object)
    assert.equal(rowStart(object), 48)
  })

  test("the border pads the height", () => {
    const base = createObject({ row: 0, border: 5 })
    const object = createObject({ row: 1 })
    setScene(base, object)
    assert.equal(rowStart(object), 54)
  })

  test("the object's scale applies to the cap height only", () => {
    const base = createObject({ row: 0, scaleY: 3 })
    const object = createObject({ row: 1 })
    setScene(base, object)
    assert.equal(rowStart(object), 128)
  })

  test("the outline scales with the object when asked", () => {
    const base = createObject({ row: 0, scaleY: 3, scaleOutline: true })
    const object = createObject({ row: 1 })
    setScene(base, object)
    assert.equal(rowStart(object), 136)
  })

  test("measured heights replace the defaults", () => {
    const base = createObject({ row: 0 })
    const object = createObject({ row: 1 })
    heights[base.id] = { height: 50, capHeight: 30, arc: { top: 5, bottom: 0 }, scaleY: 2 }
    setScene(base, object)
    assert.equal(rowStart(object), 94)
  })

  test("a measured scale wins for the outline too", () => {
    const base = createObject({ row: 0, scaleY: 9, scaleOutline: true })
    const object = createObject({ row: 1 })
    heights[base.id] = { scaleY: 2 }
    setScene(base, object)
    assert.equal(rowStart(object), 92)
  })

  test("arcs add to the height", () => {
    const base = createObject({ row: 0 })
    const object = createObject({ row: 1 })
    heights[base.id] = { arc: { top: 3, bottom: 4 } }
    setScene(base, object)
    assert.equal(rowStart(object), 55)
  })
})

describe("words of one line", () => {
  test("share the furthest reach any of them measured", () => {
    const first = createObject({ row: 0, group: 1 })
    const second = createObject({ row: 0, group: 1 })
    const other = createObject({ row: 0, group: 2 })
    heights[first.id] = { arc: { top: 6, bottom: 1 } }
    heights[second.id] = { arc: { top: 2, bottom: 5 } }
    heights[other.id] = { arc: { top: 9, bottom: 9 } }
    setScene(first, second, other)
    assert.deepEqual(lineArc(first, editorTitle), { top: 6, bottom: 5 })
    assert.deepEqual(lineArc(second, editorTitle), { top: 6, bottom: 5 })
  })

  test("sit on one baseline when a twist reaches further at the ends", () => {
    const words = [3, 0, 3].map(bottom => {
      const word = createObject({ row: 0, group: 1 })
      heights[word.id] = { arc: { top: 0, bottom } }
      return word
    })
    setScene(...words)
    const placed = words.map(word => placementOf(word, editorTitle, { height: 44, capHeight: 40, depth: 20, reference: 20, scale: [1, 1, 1], wordScale: [1, 1, 1], outlineGrow: [1, 1, 1] }))
    assert.deepEqual(placed.map(value => value.offset[1]), [3, 3, 3])
  })

  test("drop below the title by the same amount", () => {
    const first = createObject({ row: -1, group: 1 })
    const second = createObject({ row: -1, group: 1 })
    heights[first.id] = { arc: { top: 4, bottom: 0 } }
    heights[second.id] = { arc: { top: 0, bottom: 0 } }
    setScene(first, second)
    assert.equal(rowStart(first), -52)
    assert.equal(rowStart(second), -52)
  })

  test("a word with no line uses its own reach", () => {
    const object = createObject({ row: 0 })
    heights[object.id] = { arc: { top: 2, bottom: 3 } }
    assert.deepEqual(lineArc(object, editorTitle), { top: 2, bottom: 3 })
  })
})
