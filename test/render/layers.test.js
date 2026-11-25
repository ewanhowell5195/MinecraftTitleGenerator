import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { matchStack, paintedLines, showLayer } from "#render/layers.js"

const CLEAR = [0, 0, 0, 0]
const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]

function pixels(...values) {
  return new Uint8ClampedArray(values.flat())
}

function stacked(layers, at) {
  return layers.reduce((under, layer) => {
    const alpha = layer[at + 3] / 255
    return under.map((value, c) => value * (1 - alpha) + (c === 3 ? layer[at + 3] : layer[at + c] * alpha))
  }, [0, 0, 0, 0])
}

function assertStacks(target, layers) {
  for (let at = 0; at < target.length; at += 4) {
    const found = stacked(layers, at)
    const wanted = [0, 1, 2].map(c => target[at + c] * target[at + 3] / 255).concat(target[at + 3])
    assert.ok(found.every((value, c) => Math.abs(value - wanted[c]) <= 2), `${found} is not ${wanted}`)
  }
}

function entryOf(line, order, parts = {}) {
  return { line, group: { visible: true }, materials: [{ colorWrite: true }], outline: { visible: true, renderOrder: order }, solid: { visible: true, renderOrder: order + 10 }, halo: null, holes: null, ...parts }
}

describe("matchStack", () => {
  test("leaves layers alone when they already stack to the render", () => {
    const layers = [pixels(BLUE, BLUE), pixels(CLEAR, RED)]
    assert.equal(matchStack(pixels(BLUE, RED), layers, 2), false)
    assert.deepEqual(layers, [pixels(BLUE, BLUE), pixels(CLEAR, RED)])
  })

  test("keeps the hidden part of a lower layer", () => {
    const layers = [pixels(BLUE), pixels(RED)]
    matchStack(pixels(RED), layers, 1)
    assert.deepEqual(layers[0], pixels(BLUE))
  })

  test("clears what the render doesn't show", () => {
    const layers = [pixels(BLUE), pixels(RED)]
    assert.equal(matchStack(pixels(CLEAR), layers, 1), true)
    assert.deepEqual(layers, [pixels(CLEAR), pixels(CLEAR)])
  })

  test("removes a layer rather than recolouring one when that is enough", () => {
    const layers = [pixels(BLUE), pixels(RED)]
    matchStack(pixels(BLUE), layers, 1)
    assert.deepEqual(layers, [pixels(BLUE), pixels(CLEAR)])
  })

  test("closes the seam where a layer is cut by one stacked under it", () => {
    const target = pixels([102, 0, 153, 255])
    const layers = [pixels([0, 0, 255, 153]), pixels([255, 0, 0, 102])]
    matchStack(target, layers, 1)
    assertStacks(target, layers)
    assert.deepEqual(layers[1], pixels([255, 0, 0, 102]))
  })

  test("fills a pixel no layer has from a layer beside it", () => {
    const target = pixels(BLUE, BLUE)
    const layers = [pixels(BLUE, CLEAR), pixels(CLEAR, CLEAR)]
    matchStack(target, layers, 2)
    assert.deepEqual(layers, [pixels(BLUE, BLUE), pixels(CLEAR, CLEAR)])
  })

  test("recreates a translucent edge", () => {
    const target = pixels([200, 40, 10, 120])
    const layers = [pixels([0, 0, 255, 90]), pixels([255, 0, 0, 100])]
    matchStack(target, layers, 1)
    assertStacks(target, layers)
  })
})

describe("paintedLines", () => {
  test("lists each line's words in the order they are painted", () => {
    const entries = new Map([[1, entryOf("line-1", 3)], [2, entryOf("line-2", 0)], [3, entryOf("line-1", 4)]])
    assert.deepEqual(paintedLines(entries), [[2], [1, 3]])
  })

  test("leaves out hidden and empty words", () => {
    const entries = new Map([[1, entryOf("a", 0, { group: { visible: false } })], [2, entryOf("b", 1, { outline: null, solid: null })], [3, entryOf("c", 2)]])
    assert.deepEqual(paintedLines(entries), [[3]])
  })
})

describe("showLayer", () => {
  function titleOf() {
    const [below, shown, above] = [0, 1, 2].map(order => entryOf(`line-${order}`, order, { halo: { visible: true }, holes: { visible: true } }))
    return { below, shown, above, entries: new Map([[1, below], [2, shown], [3, above]]) }
  }

  function look({ outline, solid, halo, holes, materials: [{ colorWrite }] }) {
    return [outline.visible, solid.visible, halo.visible, holes.visible, colorWrite]
  }

  test("draws the line against only the depth of the ones under it", () => {
    const { below, shown, above, entries } = titleOf()
    showLayer(entries, { ids: [2], below: [1] })
    assert.deepEqual([below, shown, above].map(look), [[false, true, false, true, false], [true, true, false, true, true], [false, false, false, false, true]])
  })

  test("the outline is drawn without any line", () => {
    const { entries } = titleOf()
    showLayer(entries, { ids: null, below: [] })
    for (const entry of entries.values()) assert.deepEqual(look(entry), [false, false, true, true, true])
  })

  test("letters painted again go with their solid", () => {
    const { below, shown, above, entries } = titleOf()
    for (const entry of entries.values()) entry.letters = { visible: true }
    const restore = showLayer(entries, { ids: [2], below: [1] })
    assert.deepEqual([below, shown, above].map(entry => entry.letters.visible), [true, true, false])
    restore()
    assert.equal(above.letters.visible, true)
  })

  test("puts everything back", () => {
    const { entries } = titleOf()
    showLayer(entries, { ids: [2], below: [1] })()
    for (const entry of entries.values()) assert.deepEqual(look(entry), [true, true, true, true, true])
  })
})
