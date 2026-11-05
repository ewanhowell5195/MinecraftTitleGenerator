import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { SPACE, layout, lineLayout } from "../src/lib/layout.js"

const SMILE = "\u{1F633}"
const QUOTE = "\u{1F629}"
const OPEN = "┫"
const CLOSE = "┣"

function glyphOf(char, { width = 4, height = 2, advance = 6, originX = 1, mask } = {}) {
  return { char, width, height, advance, originX, bottom: 0, top: height, mask: mask ?? new Uint8Array(width * height).fill(1) }
}

function fontOf(chars, extra = {}) {
  return { glyphs: Object.fromEntries(Array.from(chars, char => [char, glyphOf(char)])), kerning: {}, ...extra }
}

function withGlyphs(font, glyphs) {
  return { ...font, glyphs: { ...font.glyphs, ...glyphs } }
}

function charsOf(placed) {
  return placed.map(item => item.glyph.char)
}

function xsOf(placed) {
  return placed.map(item => item.x)
}

describe("layout positions", () => {
  test("advances the pen and offsets each glyph by its origin", () => {
    assert.deepEqual(xsOf(layout(fontOf("a"), "aaa", {})), [1, 7, 13])
  })

  test("returns nothing for empty or blank text", () => {
    assert.deepEqual(layout(fontOf("a"), "", {}), [])
    assert.deepEqual(layout(fontOf("a"), "   ", {}), [])
  })

  test("trims surrounding whitespace", () => {
    const placed = layout(fontOf("a"), "  a  ", {})
    assert.deepEqual(xsOf(placed), [1])
    assert.equal(placed[0].spaces, 0)
  })

  test("characters without a glyph take no room", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab"), "a?b", {})), [1, 7])
  })

  test("a zero width glyph advances the pen but is not placed", () => {
    const font = withGlyphs(fontOf("a"), { ".": glyphOf(".", { width: 0, height: 0, advance: 4, originX: 0 }) })
    const placed = layout(font, "a.a", {})
    assert.deepEqual(charsOf(placed), ["a", "a"])
    assert.deepEqual(xsOf(placed), [1, 11])
  })
})

describe("layout text normalising", () => {
  test("lower cases text", () => {
    assert.deepEqual(charsOf(layout(fontOf("bc"), "BbC", {})), ["b", "b", "c"])
  })

  test("capital A uses its own glyph rather than the lower case one", () => {
    assert.deepEqual(charsOf(layout(fontOf("a" + SMILE), "Aa", {})), [SMILE, "a"])
  })

  test("capital A is dropped when the font has no glyph for it", () => {
    assert.deepEqual(xsOf(layout(fontOf("a"), "Aa", {})), [1])
  })

  test("a quote at the start of a word becomes the opening quote", () => {
    assert.deepEqual(charsOf(layout(fontOf("a'" + QUOTE), "'a", {})), [QUOTE, "a"])
  })

  test("a quote after whitespace becomes the opening quote", () => {
    assert.deepEqual(charsOf(layout(fontOf("ab'" + QUOTE), "a 'b", {})), ["a", QUOTE, "b"])
  })

  test("a quote inside a word stays a plain apostrophe", () => {
    assert.deepEqual(charsOf(layout(fontOf("ab'" + QUOTE), "a'b", {})), ["a", "'", "b"])
  })

  test("double quotes become a pair of single quote glyphs", () => {
    assert.deepEqual(charsOf(layout(fontOf("a'" + QUOTE), "\"a\"", {})), [QUOTE, QUOTE, "a", "'", "'"])
  })
})

describe("layout kerning", () => {
  test("pulls the pair together", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { kerning: { ab: 2 } }), "ab", {})), [1, 5])
  })

  test("applies when the option is true or unset", () => {
    const font = fontOf("ab", { kerning: { ab: 2 } })
    assert.deepEqual(xsOf(layout(font, "ab", { kerning: true })), [1, 5])
    assert.deepEqual(xsOf(layout(font, "ab", {})), [1, 5])
  })

  test("is ignored when turned off", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { kerning: { ab: 2 } }), "ab", { kerning: false })), [1, 7])
  })

  test("only applies to the pair in that order", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { kerning: { ab: 2 } }), "ba", {})), [1, 7])
  })

  test("a negative value pushes the pair apart", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { kerning: { ab: -3 } }), "ab", {})), [1, 10])
  })

  test("accumulates along the line", () => {
    assert.deepEqual(xsOf(layout(fontOf("a", { kerning: { aa: 1 } }), "aaa", {})), [1, 6, 11])
  })

  test("looks pairs up after normalising", () => {
    const font = fontOf("b" + SMILE, { kerning: { [`${SMILE}b`]: 2 } })
    assert.deepEqual(xsOf(layout(font, "AB", {})), [1, 5])
  })

  test("does not apply across a space", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { kerning: { ab: 3, "a ": 3, " b": 3 } }), "a b", {})), [1, 15])
  })

  test("applies across words joined with no space", () => {
    const placed = lineLayout(fontOf("ab", { kerning: { ab: 2 } }), [{ text: "a", space: false }, { text: "b", space: false }], {})
    assert.deepEqual(xsOf(placed), [1, 5])
  })

  test("counts a zero width glyph as the previous character", () => {
    const font = withGlyphs(fontOf("a", { kerning: { ".a": 1, aa: 5 } }), { ".": glyphOf(".", { width: 0, height: 0, advance: 4, originX: 0 }) })
    assert.deepEqual(xsOf(layout(font, "a.a", {})), [1, 10])
  })
})

describe("layout spacing", () => {
  test("adds to every advance", () => {
    assert.deepEqual(xsOf(layout(fontOf("a"), "aaa", { spacing: 2 })), [1, 9, 17])
  })

  test("can be negative", () => {
    assert.deepEqual(xsOf(layout(fontOf("a"), "aaa", { spacing: -2 })), [1, 5, 9])
  })

  test("can be fractional", () => {
    assert.deepEqual(xsOf(layout(fontOf("a"), "aa", { spacing: 0.5 })), [1, 7.5])
  })

  test("combines with kerning", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { kerning: { ab: 2 } }), "ab", { spacing: 3 })), [1, 8])
  })
})

describe("layout spaces", () => {
  test("the default space width is exported for the atlas", () => {
    assert.equal(SPACE, 8)
  })

  test("uses the default width when the font sets none", () => {
    const placed = layout(fontOf("ab"), "a b", {})
    assert.deepEqual(xsOf(placed), [1, 15])
    assert.deepEqual(placed.map(item => item.spaces), [0, 1])
  })

  test("uses the font's own width", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { spaceWidth: 14 }), "a b", {})), [1, 21])
  })

  test("a font width of zero is respected", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab", { spaceWidth: 0 }), "a b", {})), [1, 7])
  })

  test("counts repeated spaces", () => {
    const placed = layout(fontOf("ab"), "a  b", {})
    assert.deepEqual(xsOf(placed), [1, 23])
    assert.equal(placed[1].spaces, 2)
  })

  test("spacing also applies to spaces", () => {
    assert.deepEqual(xsOf(layout(fontOf("ab"), "a b", { spacing: 2 })), [1, 19])
  })
})

describe("lineLayout words", () => {
  test("tags glyphs with their word index", () => {
    const placed = lineLayout(fontOf("ab"), [{ text: "aa", space: false }, { text: "b", space: true }], {})
    assert.deepEqual(placed.map(item => item.word), [0, 0, 1])
  })

  test("adds a space only where the word asks for one", () => {
    const words = [{ text: "a", space: false }, { text: "a", space: true }, { text: "a", space: false }]
    assert.deepEqual(xsOf(lineLayout(fontOf("a"), words, {})), [1, 15, 21])
  })

  test("ignores a space before the first word", () => {
    assert.deepEqual(xsOf(lineLayout(fontOf("a"), [{ text: "a", space: true }], {})), [1])
  })

  test("blank words keep their index but add nothing", () => {
    const placed = lineLayout(fontOf("ab"), [{ text: "  ", space: false }, { text: "a", space: false }, { text: "", space: true }, { text: "b", space: false }], {})
    assert.deepEqual(placed.map(item => item.word), [1, 3])
    assert.deepEqual(xsOf(placed), [1, 7])
  })

  test("a space after a blank first word is ignored", () => {
    const placed = lineLayout(fontOf("a"), [{ text: "", space: false }, { text: "a", space: true }], {})
    assert.deepEqual(xsOf(placed), [1])
    assert.equal(placed[0].spaces, 0)
  })

  test("trims each word on its own", () => {
    const placed = lineLayout(fontOf("ab"), [{ text: " a ", space: false }, { text: " b ", space: false }], {})
    assert.deepEqual(xsOf(placed), [1, 7])
  })
})

describe("lineLayout terminators", () => {
  const terminators = { [OPEN]: glyphOf(OPEN, { width: 2, advance: 3, originX: 0 }), [CLOSE]: glyphOf(CLOSE, { width: 2, advance: 3, originX: 0 }) }
  const font = withGlyphs(fontOf("ab"), terminators)

  test("are off by default", () => {
    assert.deepEqual(charsOf(layout(font, "a", {})), ["a"])
  })

  test("wrap the line when asked for", () => {
    const placed = layout(font, "a", { terminators: true })
    assert.deepEqual(charsOf(placed), [OPEN, "a", CLOSE])
    assert.deepEqual(xsOf(placed), [0, 4, 9])
  })

  test("are always added for fonts that force them", () => {
    assert.deepEqual(charsOf(layout({ ...font, forcedTerminators: true }, "a", {})), [OPEN, "a", CLOSE])
  })

  test("are skipped when the font lacks either glyph", () => {
    const partial = withGlyphs(fontOf("a"), { [OPEN]: terminators[OPEN] })
    assert.deepEqual(charsOf(layout(partial, "a", { terminators: true })), ["a"])
  })

  test("do not appear on empty text", () => {
    assert.deepEqual(layout(font, "", { terminators: true }), [])
  })

  test("belong to the first and last words", () => {
    const placed = lineLayout(font, [{ text: "", space: false }, { text: "a", space: false }, { text: "b", space: true }], { terminators: true })
    assert.deepEqual(charsOf(placed), [OPEN, "a", "b", CLOSE])
    assert.deepEqual(placed.map(item => item.word), [1, 1, 2, 2])
  })

  test("are set apart by a space on fonts that ask for it", () => {
    const placed = layout({ ...font, terminatorSpace: true }, "a", { terminators: true })
    assert.deepEqual(xsOf(placed), [0, 12, 25])
    assert.deepEqual(placed.map(item => item.spaces), [0, 1, 1])
  })
})

describe("lineLayout with a space glyph", () => {
  const space = glyphOf(" ", { width: 3, height: 2, advance: 3, originX: 0, mask: Uint8Array.of(1, 0, 1, 0, 1, 0) })
  const tight = glyphOf("a", { width: 4, height: 2, advance: 6, originX: 0 })
  const font = { glyphs: { a: tight, " ": space }, kerning: {} }

  test("fills the gap between glyphs from the space's centre column", () => {
    const placed = layout(font, "aa", {})
    assert.deepEqual(charsOf(placed), ["a", " ", "a"])
    assert.deepEqual(xsOf(placed), [0, 4, 6])
    const { glyph } = placed[1]
    assert.equal(glyph.fill, true)
    assert.equal(glyph.width, 2)
    assert.equal(glyph.height, 2)
    assert.deepEqual(Array.from(glyph.mask), [0, 0, 1, 1])
  })

  test("a filler does not change the shared space glyph", () => {
    layout(font, "aa", {})
    assert.equal(font.glyphs[" "].width, 3)
    assert.equal(font.glyphs[" "].fill, undefined)
  })

  test("rounds a fractional gap up to whole pixels", () => {
    const placed = layout(font, "aa", { spacing: 0.5 })
    assert.equal(placed[1].x, 4)
    assert.equal(placed[1].glyph.width, 3)
    assert.equal(placed[2].x, 6.5)
  })

  test("adds no filler when glyphs touch or overlap", () => {
    assert.deepEqual(charsOf(layout(font, "aa", { spacing: -2 })), ["a", "a"])
    assert.deepEqual(charsOf(layout(font, "aa", { spacing: -3 })), ["a", "a"])
  })

  test("adds no filler before the first glyph", () => {
    const shifted = { ...font, glyphs: { ...font.glyphs, a: { ...tight, originX: 5 } } }
    assert.deepEqual(xsOf(layout(shifted, "a", {})), [5])
  })

  test("places a word space as a real glyph owned by the previous word", () => {
    const placed = lineLayout(font, [{ text: "a", space: false }, { text: "a", space: true }], {})
    assert.deepEqual(charsOf(placed), ["a", " ", " ", "a"])
    assert.deepEqual(xsOf(placed), [0, 4, 6, 9])
    assert.deepEqual(placed.map(item => item.word), [0, 0, 0, 1])
    assert.deepEqual(placed.map(item => item.spaces), [0, 0, 0, 0])
    assert.equal(placed[1].glyph.fill, true)
    assert.equal(placed[2].glyph.fill, undefined)
  })

  test("a filler takes the word of the glyph before it", () => {
    const placed = lineLayout(font, [{ text: "a", space: false }, { text: "a", space: false }], {})
    assert.deepEqual(placed.map(item => item.word), [0, 0, 1])
  })
})
