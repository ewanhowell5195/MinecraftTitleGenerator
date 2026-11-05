import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { nextTick } from "vue"

globalThis.localStorage = { getItem: () => null, setItem: () => {} }
globalThis.fetch = () => assert.fail("fetch must not be called")
mock.timers.enable({ apis: ["setTimeout"] })

const { createObject } = await import("../src/lib/settings.js")
const { view } = await import("../src/lib/view.js")
const { runtime, scene } = await import("../src/lib/scene.js")
const { history } = await import("../src/lib/history.js")
const { keepMatched, leadsTo, matchSolved, problems } = await import("../src/lib/match.js")

function chain(count) {
  const objects = Array.from({ length: count }, (_, index) => createObject({ text: `line ${index}` }))
  scene.objects.splice(0, scene.objects.length, ...objects)
  return objects
}

function linked(count) {
  const objects = chain(count)
  for (let i = 0; i < count - 1; i++) objects[i].matchWidth = objects[i + 1].id
  return objects
}

beforeEach(() => {
  for (const key of Object.keys(runtime)) delete runtime[key]
  for (const key of Object.keys(problems)) delete problems[key]
})

describe("leadsTo", () => {
  test("a line leads to itself", () => {
    const [a] = chain(1)
    assert.equal(leadsTo(a, a), true)
  })

  test("follows a direct match", () => {
    const [a, b] = linked(2)
    assert.equal(leadsTo(a, b), true)
  })

  test("does not follow a match backwards", () => {
    const [a, b] = linked(2)
    assert.equal(leadsTo(b, a), false)
  })

  test("follows a whole chain", () => {
    const [a, b, c, d] = linked(4)
    assert.equal(leadsTo(a, d), true)
    assert.equal(leadsTo(b, d), true)
    assert.equal(leadsTo(d, a), false)
    assert.equal(leadsTo(c, b), false)
  })

  test("is false for unrelated lines", () => {
    const [a, b] = chain(2)
    assert.equal(leadsTo(a, b), false)
  })

  test("stops at a reference that no longer exists", () => {
    const [a, b] = chain(2)
    a.matchWidth = 987654
    assert.equal(leadsTo(a, b), false)
  })

  test("finishes on a loop that misses the target", () => {
    const [a, b, c] = chain(3)
    a.matchWidth = b.id
    b.matchWidth = a.id
    assert.equal(leadsTo(a, c), false)
  })

  test("finds a target inside a loop", () => {
    const [a, b, c] = chain(3)
    a.matchWidth = b.id
    b.matchWidth = c.id
    c.matchWidth = a.id
    assert.equal(leadsTo(a, c), true)
    assert.equal(leadsTo(c, b), true)
  })

  test("finishes when a line matches itself", () => {
    const [a, b] = chain(2)
    a.matchWidth = a.id
    assert.equal(leadsTo(a, b), false)
  })

  test("finishes when a chain runs into a loop", () => {
    const [a, b, c, d] = chain(4)
    a.matchWidth = b.id
    b.matchWidth = c.id
    c.matchWidth = b.id
    assert.equal(leadsTo(a, d), false)
    assert.equal(leadsTo(a, c), true)
  })
})

describe("matchSolved", () => {
  test("is false with no match", () => {
    const [a] = chain(1)
    assert.equal(matchSolved(a), false)
  })

  test("is true when the reference is visible", () => {
    const [a] = linked(2)
    assert.equal(matchSolved(a), true)
  })

  test("is false when the reference is hidden", () => {
    const [a, b] = linked(2)
    b.hidden = true
    assert.equal(matchSolved(a), false)
  })

  test("ignores whether the line itself is hidden", () => {
    const [a] = linked(2)
    a.hidden = true
    assert.equal(matchSolved(a), true)
  })

  test("looks at the end of a chain", () => {
    const [a, b, c] = linked(3)
    assert.equal(matchSolved(a), true)
    b.hidden = true
    assert.equal(matchSolved(a), true)
    b.hidden = false
    c.hidden = true
    assert.equal(matchSolved(a), false)
    assert.equal(matchSolved(b), false)
  })

  test("is false for a reference that no longer exists", () => {
    const [a] = chain(1)
    a.matchWidth = 987654
    assert.equal(matchSolved(a), false)
  })
})

describe("problems and solving", () => {
  before(() => {
    keepMatched()
    view.fov = 0
  })

  function state(halfWidth, border, offsetY = 0, settled = true) {
    return {
      settled,
      built: {
        border,
        frame: null,
        line: { min: [-halfWidth, 0, -5], max: [halfWidth, 40, 5] },
        body: { triangles: 12, positions: new Float32Array([-halfWidth, 0, -5, halfWidth, 40, 5]) }
      },
      transform: { type: [1, 1, 1], offset: [0, offsetY, 0], rotation: 0, anchor: { y: "bottom", z: "back" }, scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0], outlineGrow: [1, 1, 1] }
    }
  }

  test("starts empty", () => {
    assert.deepEqual(Object.keys(problems), [])
  })

  test("solves a narrower line up to the reference's width", async () => {
    const [target, reference] = linked(2)
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(40, 2, -60)
    await nextTick()
    assert.equal(target.scaleX, 2.5)
    assert.equal(target.scaleY, 1)
    assert.equal(target.id in problems, false)
  })

  test("takes the outline width into account", async () => {
    const [target, reference] = linked(2)
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(50, 4, -60)
    await nextTick()
    assert.equal(target.scaleX, 1.96)
  })

  test("a linked line solves Y from X", async () => {
    const [target, reference] = linked(2)
    target.linkScale = 1.5
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(40, 2, -60)
    await nextTick()
    assert.equal(target.scaleX, 2.5)
    assert.equal(target.scaleY, 3.75)
  })

  test("a chain is solved against its last line", async () => {
    const [first, second, last] = linked(3)
    runtime[last.id] = state(100, 2)
    runtime[second.id] = state(40, 2, -60)
    runtime[first.id] = state(25, 2, -120)
    await nextTick()
    assert.equal(first.scaleX, 4)
    assert.equal(second.scaleX, 2.5)
  })

  test("solving does not create an undo step", async () => {
    const [target, reference] = linked(2)
    mock.timers.tick(300)
    history.undo = []
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(40, 2, -60)
    await nextTick()
    mock.timers.tick(300)
    assert.equal(target.scaleX, 2.5)
    assert.equal(history.undo.length, 0)
  })

  test("a line that cannot be solved records the problem and keeps its scale", async () => {
    const [target, reference] = linked(2)
    target.scaleX = 1.2
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(0, 0, -60)
    await nextTick()
    assert.equal(problems[target.id], "these texts' edges can't be lined up by scaling")
    assert.equal(target.scaleX, 1.2)
  })

  test("the problem clears once the line can be solved", async () => {
    const [target, reference] = linked(2)
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(0, 0, -60)
    await nextTick()
    assert.equal(target.id in problems, true)
    runtime[target.id] = state(40, 2, -60)
    await nextTick()
    assert.equal(target.id in problems, false)
    assert.equal(target.scaleX, 2.5)
  })

  test("a hidden reference leaves the scale alone", async () => {
    const [target, reference] = linked(2)
    reference.hidden = true
    target.scaleX = 1.2
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(40, 2, -60)
    await nextTick()
    assert.equal(target.scaleX, 1.2)
    assert.equal(target.id in problems, false)
  })

  test("a line still building is not solved yet", async () => {
    const [target, reference] = linked(2)
    runtime[reference.id] = state(100, 2)
    runtime[target.id] = state(40, 2, -60, false)
    await nextTick()
    assert.equal(target.scaleX, 1)
    runtime[target.id] = state(40, 2, -60)
    await nextTick()
    assert.equal(target.scaleX, 2.5)
  })
})
