import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { LIMITS } from "../src/lib/limits.js"
import { FILE_VERSION, createObject, layerValues } from "../src/lib/settings.js"
import { joinWords, limitProblem, lineWords, titleFacts, titleProblem, titleValues, trimmed } from "../src/lib/titleFacts.js"

describe("lineWords", () => {
  test("a line with no words is its own word", () => {
    assert.deepEqual(lineWords({ text: "one", hue: 20 }), [{ text: "one", hue: 20 }])
  })

  test("each word takes the line's settings and keeps its own", () => {
    assert.deepEqual(lineWords({ type: "bottom", hue: 20, words: [{ text: "a" }, { text: "b", hue: 40 }] }), [{ type: "bottom", hue: 20, text: "a" }, { type: "bottom", hue: 40, text: "b" }])
  })
})

describe("joinWords", () => {
  test("puts a space before the words that ask for one, but never first", () => {
    const words = [{ text: "one", spaceBefore: true }, { text: "two", spaceBefore: false }, { text: "three", spaceBefore: true }]
    assert.equal(joinWords(words, word => word.text), "onetwo three")
  })
})

describe("titleProblem", () => {
  const fine = {
    "single lines": [{}, { text: "two" }],
    "a line of words": [{ words: [{ text: "a" }, { text: "b" }] }],
    "a line matching another": [{}, { matchWidth: 0 }],
    "a chain of matches": [{ matchWidth: 1 }, { matchWidth: 2 }, {}],
    "no match written as null": [{ matchWidth: null }, { matchWidth: null, words: [{ text: "a" }] }],
    "a shape on its own line": [{ shape: "heart" }],
    "words written as null": [{ words: null }]
  }

  for (const [name, lines] of Object.entries(fine)) {
    test(`allows ${name}`, () => {
      assert.equal(titleProblem(lines), null)
    })
  }

  const problems = {
    "a line with no words": [[{ words: [] }], "a line has no words in it"],
    "words that are not a list": [[{ words: "hello" }], "a line has no words in it"],
    "a word that sets matchWidth": [[{}, { words: [{ text: "a", matchWidth: 0 }] }], "a word sets matchWidth, which only a line can have"],
    "a shape among words": [[{ words: [{ text: "a" }, { shape: "heart" }] }], "a shape is used as a word in a line"],
    "a line of words that is a shape": [[{ shape: "heart", words: [{ text: "a" }] }], "a shape is used as a word in a line"],
    "a matchWidth past the end": [[{}, { matchWidth: 2 }], "a line matches the width of line 2, which doesn't exist"],
    "a negative matchWidth": [[{ matchWidth: -1 }], "a line matches the width of line -1, which doesn't exist"],
    "a matchWidth between two lines": [[{}, { matchWidth: 0.5 }], "a line matches the width of line 0.5, which doesn't exist"],
    "a matchWidth that is not a number": [[{}, { matchWidth: "0" }], "a line matches the width of line 0, which doesn't exist"],
    "a line matching itself": [[{}, { matchWidth: 1 }], "line 1 matches its own width"],
    "two lines matching each other": [[{ matchWidth: 1 }, { matchWidth: 0 }], "line 0 matches its own width"],
    "a line leading into a loop": [[{ matchWidth: 1 }, { matchWidth: 2 }, { matchWidth: 1 }], "line 0 matches its own width"]
  }

  for (const [name, [lines, problem]] of Object.entries(problems)) {
    test(`names ${name}`, () => {
      assert.equal(titleProblem(lines), problem)
    })
  }
})

describe("limitProblem", () => {
  function words(count, text = "a") {
    return Array.from({ length: count }, () => ({ text }))
  }

  test("allows a title at every limit", () => {
    assert.equal(limitProblem(words(LIMITS.lines)), null)
    assert.equal(limitProblem([{ words: words(LIMITS.words) }]), null)
    assert.equal(limitProblem([{ text: "a".repeat(LIMITS.characters) }]), null)
  })

  test("names the limit a title is over", () => {
    assert.equal(limitProblem(words(LIMITS.lines + 1)), `A shared title can have up to ${LIMITS.lines} lines.`)
    assert.equal(limitProblem([{ words: words(LIMITS.words + 1) }]), `A shared title can have up to ${LIMITS.words} words.`)
    assert.equal(limitProblem([{ text: "a".repeat(LIMITS.characters + 1) }]), `A shared title can have up to ${LIMITS.characters} characters of text.`)
  })

  test("uses the facts it is given", () => {
    const lines = [{ text: "short" }]
    assert.equal(limitProblem(lines, { ...titleFacts(lines), words: LIMITS.words + 1 }), `A shared title can have up to ${LIMITS.words} words.`)
  })
})

describe("titleValues", () => {
  test("fills in every setting and groups the words of a line", () => {
    const [[single], [first, second]] = titleValues({ version: FILE_VERSION, lines: [{ text: "one" }, { type: "bottom", words: [{ text: "a" }, { text: "b", hue: 40 }] }] })
    assert.deepEqual([single.text, single.type, single.group, single.hue], ["one", "top", null, 0])
    assert.deepEqual([first.text, first.type, first.group, first.hue], ["a", "bottom", 2, 0])
    assert.deepEqual([second.text, second.type, second.group, second.hue], ["b", "bottom", 2, 40])
  })

  test("upgrades lines from an older version", () => {
    assert.equal(titleValues({ version: 3, lines: [{ font: "block-serif", spacing: 1 }] })[0][0].spacing, 3)
    assert.equal(titleValues({ version: FILE_VERSION, lines: [{ font: "block-serif", spacing: 1 }] })[0][0].spacing, 1)
  })

  test("throws the title's problem", () => {
    assert.throws(() => titleValues({ version: FILE_VERSION, lines: [{ words: [] }] }), { message: "a line has no words in it" })
    assert.throws(() => titleValues({ version: FILE_VERSION + 1, lines: [{}] }), { message: `it was saved by a newer version of the generator (format ${FILE_VERSION + 1})` })
    assert.throws(() => titleValues({ version: FILE_VERSION, lines: [] }), { message: "it has no text in it" })
  })
})

describe("separate layers in saved titles", () => {
  test("a layer keeps only what differs from the defaults, and opens with the rest filled in", () => {
    const object = createObject({ separateLayers: true })
    object.layerSettings = [{ ...layerValues(object), textureSource: "gradient", hue: 40 }]
    const saved = trimmed(object)
    assert.deepEqual(saved.layerSettings, [{ textureSource: "gradient", hue: 40 }])
    const [[opened]] = titleValues({ version: FILE_VERSION, lines: [saved] })
    assert.equal(opened.layerSettings[0].textureSource, "gradient")
    assert.equal(opened.layerSettings[0].hue, 40)
    assert.equal(opened.layerSettings[0].saturation, 100)
    assert.deepEqual(opened.layerSettings[0].overlays, [])
  })

  test("a title with layers kept together saves nothing extra", () => {
    const saved = trimmed(createObject())
    assert.equal("separateLayers" in saved, false)
    assert.equal("layerSettings" in saved, false)
  })
})
