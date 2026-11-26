import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { watch } from "vue"
import { alongside, oneWord, wholeLine } from "#lib/title/broadcast.js"
import { createObject } from "#lib/settings/objects.js"
import { snapshot } from "#lib/settings/settings.js"

function line() {
  return ["a", "b"].map(text => createObject({ text, group: 1 }))
}

describe("editing a whole line", () => {
  test("reaches every word, except the text", () => {
    const words = line()
    const current = wholeLine(words[0], () => words)
    Object.assign(current, { hue: 40, text: "changed" })
    assert.deepEqual(words.map(word => [word.hue, word.text]), [[40, "changed"], [40, "b"]])
  })

  test("array changes are noticed on every word", () => {
    const words = line()
    const current = wholeLine(words[0], () => words)
    const seen = [0, 0]
    const stops = words.map((word, index) => watch(() => word.overlays.map(layer => layer.overlay).join(), () => seen[index]++, { flush: "sync" }))
    current.overlays.push({ overlay: "dust" }, { overlay: "cracks" })
    current.overlays.splice(1, 0, current.overlays.splice(0, 1)[0])
    stops.forEach(stop => stop())
    assert.deepEqual(words.map(word => word.overlays.map(layer => layer.overlay)), [["cracks", "dust"], ["cracks", "dust"]])
    assert.ok(seen.every(count => count > 0))
  })

  test("words don't end up sharing a layer", () => {
    const words = line()
    const current = wholeLine(words[0], () => words)
    current.overlays.push({ overlay: "dust", opacity: 100 })
    words[1].overlays[0].opacity = 20
    assert.equal(snapshot(words[0]).overlays[0].opacity, 100)
  })

  test("a layer found in a list can be found again", () => {
    const words = line()
    const current = wholeLine(words[0], () => words)
    current.overlays.push({ overlay: "dust" }, { overlay: "cracks" })
    assert.equal(current.overlays.indexOf(current.overlays[1]), 1)
  })
})

describe("editing one word", () => {
  test("keeps its own settings to itself and shares the line's", () => {
    const words = line()
    const current = oneWord(words[1], () => words)
    Object.assign(current, { hue: 40, spacing: 3 })
    assert.deepEqual(words.map(word => [word.hue, word.spacing]), [[0, 3], [40, 3]])
  })
})

describe("editing several selected texts", () => {
  function selected() {
    const first = createObject({ text: "a", hue: 10, overlays: [{ overlay: "dust", opacity: 100 }] })
    const second = createObject({ text: "b", hue: 20, overlays: [{ overlay: "cracks", opacity: 50 }, { overlay: "moss", opacity: 30 }] })
    return [first, second, alongside(first, key => key === "text" ? [first] : [first, second])]
  }

  test("only the changed setting reaches the others", () => {
    const [first, second, current] = selected()
    current.spacing = 4
    assert.deepEqual([first, second].map(object => [object.spacing, object.hue, object.text]), [[4, 10, "a"], [4, 20, "b"]])
  })

  test("the text stays on the first", () => {
    const [first, second, current] = selected()
    current.text = "changed"
    assert.deepEqual([first.text, second.text], ["changed", "b"])
  })

  test("a nested change only touches that value", () => {
    const [, second, current] = selected()
    current.overlays[0].opacity = 70
    assert.deepEqual(second.overlays.map(layer => [layer.overlay, layer.opacity]), [["cracks", 70], ["moss", 30]])
  })

  test("changing a list copies the whole list", () => {
    const [first, second, current] = selected()
    current.overlays.push({ overlay: "rust", opacity: 100 })
    assert.deepEqual(second.overlays.map(layer => layer.overlay), ["dust", "rust"])
    second.overlays[0].opacity = 5
    assert.equal(first.overlays[0].opacity, 100)
  })
})
