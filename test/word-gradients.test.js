import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { blend } from "../src/lib/material.js"
import { refitStops, splitGradients } from "../src/lib/wordGradients.js"

const BLACK_WHITE = [{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }]
const glyph = { width: 10, height: 10, advance: 12, originX: 0, mask: new Uint8Array(100) }
const font = { capHeight: 10, kerning: {}, glyphs: Object.fromEntries(Array.from("abcd", char => [char, { ...glyph, char }])) }

function word(values) {
  return { text: "abcd", spaceBefore: true, spacing: 0, kerning: true, terminators: false, textureSource: "premade", gradientAngle: 0, stops: BLACK_WHITE, smooth: true, ...values }
}

const PARTS = [{ text: "ab", spaceBefore: true }, { text: "cd", spaceBefore: false }]

describe("refitting stops", () => {
  test("a smooth gradient keeps the colours at the new ends", () => {
    assert.deepEqual(refitStops(BLACK_WHITE, true, 0.25, 0.75), [{ colour: blend("#000000", "#ffffff", 0.25), position: 0 }, { colour: blend("#000000", "#ffffff", 0.75), position: 100 }])
  })

  test("a smooth gradient keeps the stops inside the new range", () => {
    const stops = [{ colour: "#ff0000", position: 0 }, { colour: "#00ff00", position: 50 }, { colour: "#0000ff", position: 100 }]
    assert.deepEqual(refitStops(stops, true, 0.25, 1), [{ colour: blend("#ff0000", "#00ff00", 0.5), position: 0 }, { colour: "#00ff00", position: 33.33 }, { colour: "#0000ff", position: 100 }])
  })

  test("hard bands keep only the bands inside the new range", () => {
    const stops = [{ colour: "#ff0000", position: 0 }, { colour: "#00ff00", position: 50 }, { colour: "#0000ff", position: 100 }]
    assert.deepEqual(refitStops(stops, false, 0.25, 0.75), [{ colour: "#ff0000", position: 0 }, { colour: "#00ff00", position: 50 }])
  })
})

describe("splitting a word", () => {
  test("a horizontal gradient is shared out across the new words", () => {
    const original = word({ textureSource: "gradient", gradientAngle: 270 })
    const [left, right] = splitGradients(font, [original], original, PARTS)
    assert.deepEqual(left.stops, [{ colour: "#000000", position: 0 }, { colour: blend("#000000", "#ffffff", 22 / 46), position: 100 }])
    assert.deepEqual(right.stops, [{ colour: blend("#000000", "#ffffff", 24 / 46), position: 0 }, { colour: "#ffffff", position: 100 }])
  })

  test("a vertical gradient stays the same on every word", () => {
    const original = word({ textureSource: "gradient", gradientAngle: 0 })
    for (const part of splitGradients(font, [original], original, PARTS)) assert.deepEqual(part.stops, BLACK_WHITE)
  })

  test("edge gradients are shared out too", () => {
    const original = word({ customEdge: true, edgeFill: "gradient", edgeStops: BLACK_WHITE, edgeSmooth: true })
    const [left, right] = splitGradients(font, [original], original, PARTS)
    assert.equal(left.edgeStops.at(-1).colour, blend("#000000", "#ffffff", 22 / 46))
    assert.equal(right.edgeStops[0].colour, blend("#000000", "#ffffff", 24 / 46))
    assert.equal(left.stops, undefined)
  })

  test("face gradients that run up the face are left alone", () => {
    const original = word({ customInternal: true, internalFill: "gradient", internalDirection: "up", internalStops: BLACK_WHITE })
    assert.deepEqual(splitGradients(font, [original], original, PARTS), [{}, {}])
  })
})
