import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { arcLayout } from "../src/lib/arc.js"

const CAP = 8
const OPEN = "┫"
const CLOSE = "┣"
const BASE = { depth: 4, spacing: 0, kerning: true, arcMode: "stretch", arcTop: 0, arcBottom: 0, arcMove: 0, arcMarked: true, stretch: 1 }

function glyphOf(char, extra = {}) {
  const width = extra.width ?? 4
  const height = extra.height ?? CAP
  const bottom = extra.bottom ?? 0
  return { char, width, height, bottom, top: bottom + height, advance: 5, originX: 0, stretch: null, mask: new Uint8Array(width * height).fill(1), ...extra }
}

function fontOf(glyphs, extra = {}) {
  return { capHeight: CAP, kerning: {}, glyphs, ...extra }
}

function sheetOf(font) {
  return { glyphs: Object.fromEntries(Object.keys(font.glyphs).map(char => [char, { char, x: 0, top: 0, up: 0, upHeight: 1, down: 0, downHeight: 1, width: font.glyphs[char].width, height: font.glyphs[char].height }])) }
}

function arced(text, options = {}, font = fontOf({ a: glyphOf("a") })) {
  return arcLayout(font, sheetOf(font), [{ text, space: false }], 0, { ...BASE, ...options })
}

function words(list, word, options = {}, font = fontOf({ a: glyphOf("a") })) {
  return arcLayout(font, sheetOf(font), list, word, { ...BASE, ...options })
}

function heights(laid) {
  return laid.placed.map(item => item.glyph.height)
}

function lifts(laid) {
  return laid.placed.map(item => item.glyph.lift)
}

function range(from, to) {
  return Array.from({ length: to - from }, (_, index) => from + index)
}

describe("arcLayout results", () => {
  test("returns null when the word has no glyphs", () => {
    assert.equal(words([{ text: "a", space: false }, { text: "  ", space: true }], 1), null)
    assert.equal(words([{ text: "a", space: false }], 3), null)
  })

  test("a flat line keeps every glyph as it was", () => {
    const laid = arced("aaa")
    assert.deepEqual(laid.placed.map(item => item.x), [0, 5, 10])
    for (const { glyph } of laid.placed) {
      assert.equal(glyph.height, CAP)
      assert.equal(glyph.bottom, 0)
      assert.equal(glyph.top, CAP)
      assert.deepEqual(glyph.arc, { top: 0, bottom: 0, map: range(0, CAP), counts: new Array(CAP).fill(1), stretchable: new Array(CAP).fill(true) })
    }
    assert.deepEqual(laid.line, { minX: 0, maxX: 14, minY: 0, maxY: CAP })
    assert.deepEqual(laid.reach, { top: 0, bottom: 0 })
    assert.deepEqual(laid.sheet.tallest, { top: 0, bottom: 0 })
  })

  test("each glyph gets a unique key so stretched copies do not collide", () => {
    const laid = arced("aa")
    const keys = laid.placed.map(item => item.glyph.char)
    assert.deepEqual(keys, ["a\u00000", "a\u00001"])
    assert.deepEqual(Object.keys(laid.sheet.glyphs), keys)
  })

  test("sheet entries point at the source glyph in the original sheet", () => {
    const font = fontOf({ a: glyphOf("a") })
    const sheet = sheetOf(font)
    const laid = arcLayout(font, sheet, [{ text: "a", space: false }], 0, BASE)
    assert.equal(laid.sheet.glyphs["a\u00000"].source, sheet.glyphs.a)
  })
})

describe("line arc stretch", () => {
  test("grows the ends of the line and leaves the middle", () => {
    const laid = arced("aaa", { arcTop: 0.5 })
    assert.deepEqual(heights(laid), [12, 8, 12])
    assert.equal(laid.placed[0].glyph.bottom, 0)
    assert.equal(laid.placed[0].glyph.top, 12)
    assert.equal(laid.placed[0].glyph.arc.top, 4)
    assert.equal(laid.placed[0].glyph.arc.bottom, 0)
    assert.equal(laid.placed[1].glyph.arc.top, 0)
  })

  test("follows a square curve from the middle outward", () => {
    assert.deepEqual(heights(arced("aaaaa", { arcTop: 0.5 })), [12, 9, 8, 9, 12])
  })

  test("a negative amount bows the other way", () => {
    assert.deepEqual(heights(arced("aaa", { arcTop: -0.5 })), [8, 12, 8])
  })

  test("a single glyph does not arc", () => {
    assert.deepEqual(heights(arced("a", { arcTop: 1 })), [CAP])
  })

  test("a single glyph takes the full negative amount", () => {
    assert.deepEqual(heights(arced("a", { arcTop: -0.5 })), [12])
  })

  test("the bottom amount grows downward", () => {
    const laid = arced("aaa", { arcBottom: 0.5 })
    assert.equal(laid.placed[0].glyph.bottom, -4)
    assert.equal(laid.placed[0].glyph.top, CAP)
    assert.equal(laid.placed[0].glyph.arc.bottom, 4)
    assert.equal(laid.line.minY, -4)
    assert.equal(laid.line.maxY, CAP)
    assert.deepEqual(laid.reach, { top: 0, bottom: 4 })
  })

  test("top and bottom combine", () => {
    const laid = arced("aaa", { arcTop: 0.5, arcBottom: 0.25 })
    const [{ glyph }] = laid.placed
    assert.equal(glyph.height, 14)
    assert.equal(glyph.bottom, -2)
    assert.equal(glyph.top, 12)
    assert.deepEqual(laid.line, { minX: 0, maxX: 14, minY: -2, maxY: 12 })
    assert.deepEqual(laid.sheet.tallest, { top: 4, bottom: 2 })
  })

  test("spreads added rows evenly through the glyph", () => {
    const { arc } = arced("aaa", { arcTop: 0.5 }).placed[0].glyph
    assert.deepEqual(arc.map, [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7])
    assert.deepEqual(arc.counts, [1, 2, 1, 2, 1, 2, 1, 2])
  })

  test("rebuilds the mask from the source rows", () => {
    const pattern = Uint8Array.of(1, 0, 0, 0, 1, 0, 0, 1)
    const font = fontOf({ a: glyphOf("a", { width: 1, mask: pattern }) })
    const { glyph } = arced("aaa", { arcTop: 0.5 }, font).placed[0]
    assert.deepEqual(Array.from(glyph.mask), glyph.arc.map.map(row => pattern[row]))
    assert.equal(glyph.mask.length, 12)
  })

  test("does not change the font's own glyph", () => {
    const font = fontOf({ a: glyphOf("a") })
    arced("aaa", { arcTop: 0.5 }, font)
    assert.equal(font.glyphs.a.height, CAP)
    assert.equal(font.glyphs.a.top, CAP)
  })
})

describe("arc centre", () => {
  test("the middle is the default", () => {
    assert.deepEqual(heights(arced("aaaaa", { arcTop: 0.5, arcCentre: 0.5 })), heights(arced("aaaaa", { arcTop: 0.5 })))
  })

  test("a centre at the left end leaves the first character flat and stretches the last the most", () => {
    const stretched = heights(arced("aaaaa", { arcTop: 0.5, arcCentre: 0 }))
    assert.ok(stretched[0] < stretched[4])
    assert.deepEqual(stretched, stretched.toSorted((a, b) => a - b))
  })

  test("a word can have its own centre", () => {
    const list = [{ text: "aaa", space: false, arc: { mode: "stretch", top: 0.5, bottom: 0, move: 0, centre: 1, marked: true } }]
    const stretched = heights(words(list, 0))
    assert.ok(stretched[0] > stretched[2])
  })
})

describe("line arc move", () => {
  test("lifts whole glyphs instead of stretching them", () => {
    const laid = arced("aaa", { arcMode: "move", arcMove: 0.5 })
    assert.deepEqual(heights(laid), [8, 8, 8])
    assert.deepEqual(lifts(laid), [4, 0, 4])
    assert.equal(laid.line.maxY, 12)
    assert.deepEqual(laid.reach, { top: 4, bottom: 0 })
    assert.deepEqual(laid.sheet.tallest, { top: 0, bottom: 0 })
  })

  test("a negative amount sinks the ends", () => {
    const laid = arced("aaa", { arcMode: "move", arcMove: -0.5 })
    assert.deepEqual(lifts(laid), [-4, 0, -4])
    assert.equal(laid.line.minY, -4)
    assert.equal(laid.line.maxY, CAP)
    assert.deepEqual(laid.reach, { top: 0, bottom: 4 })
  })

  test("ignores the stretch amounts", () => {
    assert.deepEqual(heights(arced("aaa", { arcMode: "move", arcTop: 0.5, arcBottom: 0.5 })), [8, 8, 8])
  })

  test("the move amount is ignored when stretching", () => {
    assert.deepEqual(lifts(arced("aaa", { arcMove: 0.5 })), [0, 0, 0])
  })
})

describe("word shapes", () => {
  const stretchArc = { mode: "stretch", top: 0.5, bottom: 0, move: 0, marked: true }
  const moveArc = { mode: "move", top: 0, bottom: 0, move: 0.5, marked: true }

  test("a word arc is measured across its own word", () => {
    const list = [{ text: "aaa", space: false, arc: stretchArc }, { text: "aaa", space: true }]
    assert.deepEqual(heights(words(list, 0)), [12, 8, 12])
    assert.deepEqual(heights(words(list, 1)), [8, 8, 8])
  })

  test("a line arc is measured across the whole line", () => {
    const list = [{ text: "aaa", space: false }, { text: "aaa", space: true }]
    const first = heights(words(list, 0, { arcTop: 0.5 }))
    const second = heights(words(list, 1, { arcTop: 0.5 }))
    assert.deepEqual(first, second.toReversed())
    assert.equal(first[0], 12)
    assert.ok(first[1] > CAP && first[1] < 12)
  })

  test("line and word arcs add up", () => {
    assert.deepEqual(heights(words([{ text: "aaa", space: false, arc: stretchArc }], 0, { arcTop: 0.25 })), [14, 8, 14])
  })

  test("a word move lifts its own glyphs", () => {
    const laid = words([{ text: "aaa", space: false, arc: moveArc }], 0)
    assert.deepEqual(lifts(laid), [4, 0, 4])
    assert.deepEqual(heights(laid), [8, 8, 8])
  })

  test("line and word moves add up", () => {
    assert.deepEqual(lifts(words([{ text: "aaa", space: false, arc: moveArc }], 0, { arcMode: "move", arcMove: 0.5 })), [8, 0, 8])
  })

  test("a one glyph word does not arc on its own", () => {
    assert.deepEqual(heights(words([{ text: "a", space: false, arc: stretchArc }, { text: "aaa", space: true }], 0)), [CAP])
  })

  test("line bounds and shared heights include the other words", () => {
    const list = [{ text: "aaa", space: false, arc: stretchArc }, { text: "aaa", space: true }]
    const other = words(list, 1)
    assert.deepEqual(other.line, { minX: 0, maxX: 37, minY: 0, maxY: 12 })
    assert.deepEqual(other.sheet.tallest, { top: 4, bottom: 0 })
    assert.deepEqual(other.reach, { top: 4, bottom: 0 })
  })

  test("only the chosen word lands in the sheet", () => {
    const list = [{ text: "aa", space: false }, { text: "a", space: true }]
    assert.equal(Object.keys(words(list, 0).sheet.glyphs).length, 2)
    assert.equal(Object.keys(words(list, 1).sheet.glyphs).length, 1)
    assert.deepEqual(words(list, 1).placed.map(item => item.word), [1])
  })
})

describe("vertical stretch", () => {
  test("a scale above one grows upward from the baseline", () => {
    const { glyph } = arced("a", { stretch: 1.5 }).placed[0]
    assert.equal(glyph.height, 12)
    assert.equal(glyph.bottom, 0)
    assert.equal(glyph.top, 12)
    assert.equal(glyph.arc.top, 4)
    assert.equal(glyph.arc.bottom, 0)
  })

  test("the line and word scales multiply", () => {
    assert.deepEqual(heights(words([{ text: "a", space: false, stretch: 1.5 }], 0, { stretch: 1.5 })), [18])
  })

  test("a scale below one removes rows evenly", () => {
    const { glyph } = arced("a", { stretch: 0.5 }).placed[0]
    assert.equal(glyph.height, 4)
    assert.equal(glyph.top, 4)
    assert.equal(glyph.arc.top, -4)
    assert.deepEqual(glyph.arc.map, [1, 3, 5, 7])
  })

  test("a glyph never shrinks away entirely", () => {
    for (const stretch of [0, 0.01]) assert.deepEqual(heights(arced("a", { stretch })), [1])
  })

  test("a descending glyph grows on both sides of the baseline in proportion", () => {
    const font = fontOf({ a: glyphOf("a", { bottom: -2 }) })
    const { glyph } = arced("a", { stretch: 1.5 }, font).placed[0]
    assert.equal(glyph.bottom, -3)
    assert.equal(glyph.top, 9)
    assert.equal(glyph.arc.top, 3)
    assert.equal(glyph.arc.bottom, 1)
  })
})

describe("stretch marks", () => {
  const marked = fontOf({ a: glyphOf("a", { stretch: [3, 4] }) })

  test("arc rows land only on marked rows", () => {
    const { arc } = arced("aaa", { arcTop: 0.5 }, marked).placed[0].glyph
    assert.deepEqual(arc.map, [0, 1, 2, 3, 3, 3, 4, 4, 4, 5, 6, 7])
    assert.deepEqual(arc.counts, [1, 1, 1, 3, 3, 1, 1, 1])
    assert.deepEqual(arc.stretchable, [false, false, false, true, true, false, false, false])
  })

  test("marks can be turned off for the arc", () => {
    const { arc } = arced("aaa", { arcTop: 0.5, arcMarked: false }, marked).placed[0].glyph
    assert.deepEqual(arc.map, [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7])
    assert.deepEqual(arc.stretchable, new Array(CAP).fill(true))
  })

  test("vertical stretch uses the marks", () => {
    const { arc } = arced("a", { stretch: 1.5 }, marked).placed[0].glyph
    assert.deepEqual(arc.map, [0, 1, 2, 3, 3, 3, 4, 4, 4, 5, 6, 7])
  })

  test("the marks are consumed by the stretched glyph", () => {
    assert.equal(arced("aaa", { arcTop: 0.5 }, marked).placed[0].glyph.stretch, null)
  })

  test("shrinking can remove every marked row", () => {
    const { glyph } = arced("a", { stretch: 0.5 }, marked).placed[0]
    assert.equal(glyph.height, 6)
    assert.deepEqual(glyph.arc.map, [0, 1, 2, 5, 6, 7])
  })

  test("a mark below the glyph pushes it up unstretched", () => {
    const font = fontOf({ a: glyphOf("a", { stretch: [-1] }) })
    const [outer, middle] = arced("aaa", { arcTop: 0.25 }, font).placed
    assert.equal(outer.glyph.bottom, 2)
    assert.equal(outer.glyph.top, 10)
    assert.deepEqual(outer.glyph.arc.map, range(0, CAP))
    assert.equal(outer.glyph.arc.top, 2)
    assert.equal(middle.glyph.bottom, 0)
  })

  test("a mark above the glyph leaves it where it is", () => {
    const font = fontOf({ a: glyphOf("a", { stretch: [9] }) })
    const [outer] = arced("aaa", { arcTop: 0.25 }, font).placed
    assert.equal(outer.glyph.bottom, 0)
    assert.equal(outer.glyph.top, CAP)
    assert.deepEqual(outer.glyph.arc.map, range(0, CAP))
    assert.equal(outer.glyph.arc.top, 2)
  })
})

describe("arc sheet", () => {
  test("lays glyphs side by side with a gap", () => {
    const { sheet } = arced("aaa")
    assert.deepEqual(Object.values(sheet.glyphs).map(entry => entry.x), [0, 6, 12])
    assert.equal(sheet.width, 18)
  })

  test("stacks the up strip, the face and the down strip", () => {
    const { sheet } = arced("aaa", { arcTop: 0.5 })
    const [outer, middle] = Object.values(sheet.glyphs)
    assert.deepEqual([outer.up, outer.upHeight, outer.top, outer.height, outer.down, outer.downHeight], [0, 4, 6, 12, 20, 4])
    assert.deepEqual([middle.top, middle.height, middle.down], [6, 8, 16])
  })

  test("sizes the sheet to the tallest glyph with a swatch row below", () => {
    const { sheet } = arced("aaa", { arcTop: 0.5 })
    assert.equal(sheet.height, 27)
    assert.deepEqual(sheet.swatch, { x: 0, y: 26 })
  })

  test("rounds the depth and never lets it reach zero", () => {
    assert.equal(arced("a", { depth: 3.4 }).sheet.glyphs["a\u00000"].upHeight, 3)
    assert.equal(arced("a", { depth: 3.6 }).sheet.glyphs["a\u00000"].downHeight, 4)
    assert.equal(arced("a", { depth: 0 }).sheet.glyphs["a\u00000"].upHeight, 1)
  })

  test("records each glyph's place on the line and in the word", () => {
    const list = [{ text: "aa", space: false }, { text: "aa", space: true }]
    const laid = words(list, 1)
    assert.deepEqual(laid.placed.map(item => item.x), [18, 23])
    assert.deepEqual(laid.placed.map(item => item.glyph.placedX), [18, 23])
    assert.deepEqual(laid.placed.map(item => item.glyph.lineX), [18, 23])
    assert.deepEqual(laid.placed.map(item => item.glyph.wordX), [0, 5])
    assert.equal(laid.sheet.wordWidth, 9)
  })

  test("line positions start from the first glyph's own offset", () => {
    const font = fontOf({ a: glyphOf("a", { originX: 2 }) })
    const laid = arced("aa", {}, font)
    assert.deepEqual(laid.placed.map(item => item.x), [2, 7])
    assert.deepEqual(laid.placed.map(item => item.glyph.lineX), [0, 5])
  })
})

describe("special glyphs", () => {
  test("a glyph missing from the sheet passes through unstretched but still counts", () => {
    const font = fontOf({ a: glyphOf("a"), b: glyphOf("b", { height: 10, top: 10 }) })
    const sheet = { glyphs: { a: sheetOf(font).glyphs.a } }
    const laid = arcLayout(font, sheet, [{ text: "aba", space: false }], 0, { ...BASE, arcTop: 0.5 })
    assert.deepEqual(laid.placed.map(item => item.glyph.char), ["a\u00000", "b", "a\u00002"])
    assert.equal(laid.placed[1].glyph, font.glyphs.b)
    assert.equal(Object.keys(laid.sheet.glyphs).length, 2)
    assert.equal(laid.sheet.wordWidth, 14)
    assert.equal(laid.line.maxY, 12)
  })

  test("a line with nothing in the sheet reports no reach", () => {
    const font = fontOf({ a: glyphOf("a") })
    const laid = arcLayout(font, { glyphs: {} }, [{ text: "a", space: false }], 0, BASE)
    assert.deepEqual(laid.reach, { top: 0, bottom: 0 })
    assert.deepEqual(laid.sheet.tallest, { top: 0, bottom: 0 })
    assert.equal(laid.sheet.width, 1)
    assert.deepEqual(laid.line, { minX: 0, maxX: 4, minY: 0, maxY: CAP })
  })

  test("a filler keeps its flag and takes a narrow slot", () => {
    const font = fontOf({ a: glyphOf("a"), " ": glyphOf(" ", { width: 3, height: 2, top: 2, advance: 3 }) })
    const laid = arced("aa", {}, font)
    assert.deepEqual(laid.placed.map(item => item.glyph.width), [4, 1, 4])
    assert.equal(laid.placed[1].glyph.fill, true)
    assert.equal(laid.placed[0].glyph.fill, undefined)
    assert.deepEqual(Object.values(laid.sheet.glyphs).map(entry => entry.x), [0, 6, 9])
    assert.equal(laid.sheet.width, 15)
  })

  test("terminators count as part of the line's curve", () => {
    const font = fontOf({ a: glyphOf("a"), [OPEN]: glyphOf(OPEN), [CLOSE]: glyphOf(CLOSE) })
    const laid = arced("a", { terminators: true, arcTop: 0.5 }, font)
    assert.deepEqual(heights(laid), [12, 8, 12])
    assert.deepEqual(laid.placed.map(item => item.word), [0, 0, 0])
  })

  test("the drawn spaces beside the terminators are drawn with the end words", () => {
    const font = fontOf({ a: glyphOf("a"), " ": glyphOf(" ", { width: 5 }), [OPEN]: glyphOf(OPEN), [CLOSE]: glyphOf(CLOSE) }, { terminatorSpace: true })
    const list = [{ text: "a", space: false }, { text: "a", space: false }]
    const charsOf = laid => laid.placed.filter(item => !item.glyph.fill).map(item => item.glyph.char.split("\u0000")[0])
    assert.deepEqual(charsOf(words(list, 0, { terminators: true }, font)), [OPEN, " ", "a"])
    assert.deepEqual(charsOf(words(list, 1, { terminators: true }, font)), ["a", " ", CLOSE])
  })
})
