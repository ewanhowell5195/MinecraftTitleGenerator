import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { watch } from "vue"
import { oneWord, wholeLine } from "#lib/title/broadcast.js"
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
