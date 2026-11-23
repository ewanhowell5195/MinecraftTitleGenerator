import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { quietStorage } from "../helpers/browser.js"

quietStorage()

const { shapeLine } = await import("../../src/lib/geometry/shapedLine.js")
const { baseKey, lookKey, paintKey } = await import("../../src/lib/texture/paint/keys.js")
const { stripDetail } = await import("../../src/lib/texture/paint/strip.js")
const { lookOf } = await import("../../src/render/objectLook.js")
const { createObject } = await import("../../src/lib/settings/objects.js")
const { LAYER } = await import("../../src/lib/settings/textureDefaults.js")

const CAP = 8
const PLAIN = { source: "texture", gradientAngle: 0, tileablePerCharacter: false, wordedFaces: false }
const NO_OVERLAYS = { overlays: [] }

function glyphOf(char) {
  return { char, width: 4, height: CAP, bottom: 0, top: CAP, advance: 5, originX: 0, stretch: null, mask: new Uint8Array(4 * CAP).fill(1) }
}

function sheetWith(spacing) {
  const font = { capHeight: CAP, kerning: {}, glyphs: { a: glyphOf("a") } }
  const cells = { glyphs: { a: { char: "a", x: 0, top: 0, up: 0, upHeight: 1, down: 0, downHeight: 1, width: 4, height: CAP } } }
  return shapeLine(font, cells, [{ text: "aaa", space: false }], 0, { depth: 4, spacing, kerning: true, arcMode: "stretch", arcTop: 0, arcBottom: 0, arcMove: 0, arcMarked: true, stretch: 1 }).sheet
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

  test("a cover needs the letters' places in the word", () => {
    assert.equal(alike({ ...PLAIN, source: "cover" }), false)
  })

  test("an overlay that reaches other letters needs where they are", () => {
    assert.equal(alike(PLAIN, { overlays: [{ layer: { distance: 3, blur: 0 }, source: { generated: "shadow" } }] }), false)
    const outlined = { overlays: [{ source: { generated: "outline" } }] }
    assert.notEqual(paintKey(sheetWith(-1), outlined, PLAIN), paintKey(sheetWith(0), outlined, PLAIN))
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

  test("another picture or another setting gives another key", () => {
    assert.notEqual(lookKey({ customTexture: picture }), lookKey({ customTexture: `${picture}B` }))
    assert.notEqual(lookKey({ customTexture: picture, hue: 1 }), lookKey({ customTexture: picture, hue: 2 }))
  })
})

describe("hidden overlays", () => {
  const list = { overlays: { dust: {}, scratches: {} }, edgeOverlays: { rim: {} }, textures: { flat: {} } }

  function lookWith(hidden) {
    return lookOf(createObject({ texture: "flat", overlayMode: "custom", overlays: [{ ...LAYER, overlay: "dust", hidden }, { ...LAYER, overlay: "scratches" }], edgeOverlayMode: "custom", edgeOverlays: [{ ...LAYER, overlay: "rim", hidden }] }), 0, null, list)
  }

  test("a hidden layer never reaches the painted look", () => {
    const look = lookWith(true)
    assert.deepEqual(look.overlays.map(layer => layer.overlay), ["scratches"])
    assert.deepEqual(look.edgeOverlays, [])
    assert.deepEqual(lookWith(false).overlays.map(layer => layer.overlay), ["dust", "scratches"])
  })

  test("hiding a layer repaints", () => {
    assert.notEqual(lookKey(lookWith(true)), lookKey(lookWith(false)))
  })
})

describe("baseKey", () => {
  const shape = { width: 16 }
  const tile = { width: 8 }
  const look = { font: "minecraft-ten", source: "tile", tileableScale: 1, edgeBrightness: 35, overlays: [], hue: 0, fade: false, customBorder: false }
  const assets = { shape, tile, border: "#000000", overlays: [], edgeOverlays: [] }

  test("overlay, colour and fade changes keep the base", () => {
    const changed = { ...look, overlays: [{ overlay: "cracks", opacity: 40 }], edgeOverlays: [{ overlay: "edge_outline" }], hue: 90, fade: true, customBorder: true }
    assert.equal(baseKey(changed, { ...assets, overlays: [{ layer: {}, source: { width: 16 } }] }), baseKey(look, assets))
  })

  test("a base setting changes the base", () => {
    assert.notEqual(baseKey({ ...look, tileableScale: 2 }, assets), baseKey(look, assets))
    assert.notEqual(baseKey({ ...look, edgeBrightness: 50 }, assets), baseKey(look, assets))
    assert.notEqual(baseKey({ ...look, font: "minecraft-five" }, assets), baseKey(look, assets))
  })

  test("another picture or border changes the base", () => {
    assert.notEqual(baseKey(look, { ...assets, tile: { width: 8 } }), baseKey(look, assets))
    assert.notEqual(baseKey(look, { ...assets, shape: { width: 16 } }), baseKey(look, assets))
    assert.notEqual(baseKey(look, { ...assets, fontOverlay: { width: 16 } }), baseKey(look, assets))
    assert.notEqual(baseKey(look, { ...assets, border: "#ffffff" }), baseKey(look, assets))
  })

  test("a strip keys on its picture and its layout", () => {
    const strip = { image: { width: 4 }, density: 1, snap: 1, top: 2, bottom: 2, depth: 22, tiling: "line", scale: false, slice: null, band: null, independent: false }
    const striped = { ...assets, tile: undefined, strip }
    assert.equal(baseKey(look, { ...striped, strip: { ...strip } }), baseKey(look, striped))
    assert.notEqual(baseKey(look, { ...striped, strip: { ...strip, image: { width: 4 } } }), baseKey(look, striped))
    assert.notEqual(baseKey(look, { ...striped, strip: { ...strip, slice: { from: 0, size: 2 } } }), baseKey(look, striped))
  })
})

describe("strip depth", () => {
  test("a strip as deep as the faces, or deeper, needs no extra detail", () => {
    assert.equal(stripDetail({ depth: 22, density: 1 }, 22), 1)
    assert.equal(stripDetail({ depth: 22, density: 1 }, 44), 1)
    assert.equal(stripDetail({ depth: 22, density: 1, slice: { size: 0.25 } }, 32), 1)
  })

  test("a stretched strip asks for the lowest detail that gives every row the same height", () => {
    assert.equal(stripDetail({ depth: 16, density: 1 }, 18), 2)
    assert.equal(stripDetail({ depth: 16, density: 2 }, 24), 1)
    assert.equal(stripDetail({ depth: 16, density: 1, slice: { size: 0.5 } }, 36), 2)
  })

  test("a stretched strip never asks for more detail than its own density makes up", () => {
    assert.equal(stripDetail({ depth: 22, density: 1 }, 24), 4)
    assert.equal(stripDetail({ depth: 16, density: 4 }, 24), 1)
    assert.equal(stripDetail({ depth: 22, density: 4 }, 52), 1)
    assert.equal(stripDetail({ depth: 22, density: 3 }, 52), 2)
  })

  test("a stretch no detail evens out asks for the most there is", () => {
    assert.equal(stripDetail({ depth: 22, density: 1 }, 24.0001), 4)
  })
})
