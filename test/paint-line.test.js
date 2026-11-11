import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { quietStorage } from "./helpers/browser.js"

quietStorage()

const { paintLine } = await import("../src/lib/items.js")
const { decodeTitle, encodeTitle, unknownSetting } = await import("../src/lib/linkformat.js")
const { createObject } = await import("../src/lib/settings.js")

function word(values) {
  return createObject({ text: "word", group: 7, ...values })
}

describe("paintLine", () => {
  test("words of a line paint together by default", () => {
    assert.equal(paintLine(word()), "line-7")
  })

  test("moving or rotating a word doesn't split it from its line", () => {
    assert.equal(paintLine(word({ wordTranslateX: -1, wordTranslateZ: 4, wordScaleY: 1.25, wordRotationY: 10 })), "line-7")
  })

  test("layering words separately paints each on its own", () => {
    const object = word({ layerWords: true })
    assert.equal(paintLine(object), `word-${object.id}`)
  })

  test("a word with no line paints on its own", () => {
    const object = createObject({ text: "word", group: null })
    assert.equal(paintLine(object), `word-${object.id}`)
  })
})

describe("layerWords", () => {
  test("is off by default", () => {
    assert.equal(createObject().layerWords, false)
  })

  test("survives a share link and can be shared publicly", () => {
    const lines = [{ layerWords: true, words: [{ text: "one" }, { text: "two" }] }]
    const decoded = decodeTitle(encodeTitle({ version: 2, lines }).code)
    assert.equal(decoded.lines[0].layerWords, true)
    assert.equal(unknownSetting(decoded.lines), null)
  })
})
