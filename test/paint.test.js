import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { quietStorage } from "./helpers/browser.js"

quietStorage()

const { arcLayout } = await import("../src/lib/arc.js")
const { lookKey, paintKey } = await import("../src/lib/paint.js")

const CAP = 8
const PLAIN = { source: "texture", gradientAngle: 0, tileablePerCharacter: false, wordedFaces: false }
const NO_OVERLAYS = { overlays: [] }

function glyphOf(char) {
  return { char, width: 4, height: CAP, bottom: 0, top: CAP, advance: 5, originX: 0, stretch: null, mask: new Uint8Array(4 * CAP).fill(1) }
}

function sheetWith(spacing) {
  const font = { capHeight: CAP, kerning: {}, glyphs: { a: glyphOf("a") } }
  const cells = { glyphs: { a: { char: "a", x: 0, top: 0, up: 0, upHeight: 1, down: 0, downHeight: 1, width: 4, height: CAP } } }
  return arcLayout(font, cells, [{ text: "aaa", space: false }], 0, { depth: 4, spacing, kerning: true, arcMode: "stretch", arcTop: 0, arcBottom: 0, arcMove: 0, arcMarked: true, stretch: 1 }).sheet
}

function alike(look, assets = NO_OVERLAYS) {
  return paintKey(sheetWith(0), assets, look) === paintKey(sheetWith(3), assets, look)
}

describe("paintKey", () => {
  test("a sheet paints the same after its letters are spaced out under a plain texture", () => {
    assert.equal(alike(PLAIN), true)
  })

  test("a gradient straight up the letters ignores where they sit", () => {
    assert.equal(alike({ ...PLAIN, source: "gradient", gradientAngle: 180 }), true)
  })

  test("an angled gradient needs the letters' places in the word", () => {
    assert.equal(alike({ ...PLAIN, source: "gradient", gradientAngle: 45 }), false)
  })

  test("a face gradient along the word needs them too", () => {
    assert.equal(alike({ ...PLAIN, wordedFaces: true }), false)
  })

  test("a tileable laid across the line needs the letters' places in the line", () => {
    assert.equal(alike({ ...PLAIN, source: "tile" }), false)
    assert.equal(alike({ ...PLAIN, source: "tile", tileablePerCharacter: true }), true)
  })

  test("a strip laid across the line needs them as well", () => {
    assert.equal(alike(PLAIN, { overlays: [], strip: { tiling: "line" } }), false)
    assert.equal(alike(PLAIN, { overlays: [], strip: { tiling: "character" } }), true)
  })

  test("a shine overlay needs where the letters were placed", () => {
    assert.equal(alike(PLAIN, { overlays: [{ source: { generated: "shine" } }] }), false)
    assert.equal(alike(PLAIN, { overlays: [{ source: { generated: "outline" } }] }), true)
  })

  test("a sheet kept under a plain texture is not the same once the look needs positions", () => {
    const old = sheetWith(0)
    const fresh = sheetWith(3)
    assert.equal(paintKey(old, NO_OVERLAYS, PLAIN), paintKey(fresh, NO_OVERLAYS, PLAIN))
    assert.notEqual(paintKey(old, NO_OVERLAYS, { ...PLAIN, source: "gradient", gradientAngle: 90 }), paintKey(fresh, NO_OVERLAYS, { ...PLAIN, source: "gradient", gradientAngle: 90 }))
  })
})

describe("lookKey", () => {
  const picture = `data:image/png;base64,${"A".repeat(4000)}`

  test("stands a short token in for a data URL", () => {
    const key = lookKey({ customTexture: picture, overlays: [{ file: picture, opacity: 50 }] })
    assert.ok(key.length < 200)
    assert.equal(key.includes("base64"), false)
  })

  test("the same picture gives the same key", () => {
    assert.equal(lookKey({ customTexture: picture, hue: 1 }), lookKey({ customTexture: `${picture}`, hue: 1 }))
  })

  test("another picture or another setting gives another key", () => {
    assert.notEqual(lookKey({ customTexture: picture }), lookKey({ customTexture: `${picture}B` }))
    assert.notEqual(lookKey({ customTexture: picture, hue: 1 }), lookKey({ customTexture: picture, hue: 2 }))
  })

  test("other values are keyed as they are", () => {
    assert.equal(lookKey({ texture: "cracked", stops: [{ colour: "#ffffff", position: 0 }] }), JSON.stringify({ texture: "cracked", stops: [{ colour: "#ffffff", position: 0 }] }))
  })
})
