import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { STRIP_ANCHORS, anchorShift, bandEntry, layerSlice, mergeStrips, placedStrips, stripCovers, stripPlacements, stackedStrip, stripItem, stripRange, stripRows, stripUse, stripY } from "#lib/font/strips.js"

const SET = { id: "set", depth: 22, baseline: 30, textures: { shared: { authors: "a", variants: { kid: { authors: "b" } } }, other: { authors: "c" } } }

describe("mergeStrips", () => {
  test("adds shared strips after the font's own and tags where they came from", () => {
    const { textures } = mergeStrips({ textures: { flat: {} } }, [SET])
    assert.deepEqual(Object.keys(textures), ["flat", "shared", "other"])
    assert.equal(textures.shared.folder, "strips/set")
    assert.equal(textures.shared.variants.kid.folder, "strips/set")
    assert.equal(textures.flat.folder, undefined)
  })

  test("a font can skip a shared strip", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ ...SET, skip: ["shared"] }])
    assert.deepEqual(Object.keys(textures), ["other"])
    assert.deepEqual(stripUse({ id: "set", skip: ["shared"] }).skip, ["shared"])
  })

  test("a font's own strip overrides a shared one", () => {
    const { textures } = mergeStrips({ textures: { shared: { authors: "mine" } } }, [SET])
    assert.deepEqual(textures.shared, { authors: "mine" })
  })

  test("a strip is left out when one of its ids is already a texture or variant", () => {
    const { textures } = mergeStrips({ textures: { entities: { variants: { shared: {} } }, kid: {} } }, [{ ...SET, textures: { ...SET.textures, lone: { variants: { kid: {} } } } }])
    assert.deepEqual(Object.keys(textures), ["entities", "kid", "other"])
  })

  test("strips listed once per layer keep a band for each layer", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ ...SET, layer: 1 }, { ...SET, layer: 2 }])
    assert.equal(textures.shared.stripLayer, null)
    assert.deepEqual(Object.keys(textures.shared.stripBands), ["0", "1"])
    assert.equal(bandEntry(textures.shared, 1).stripLayer, 1)
    assert.deepEqual(Object.keys(textures.shared.variants.kid.stripBands), ["0", "1"])
    assert.ok(stripCovers(textures.shared, null, 2))
    assert.ok(stripCovers(textures.shared, 0, 2))
  })

  test("using strips on every layer lists them once for all layers", () => {
    const placed = new Set([1, 2])
    assert.deepEqual(placedStrips(["other"], "set", placed, 2), ["other", "set"])
    assert.deepEqual(stripPlacements(["set"], "set", 2), placed)
  })

  test("strips on some layers are listed once per layer", () => {
    const strips = placedStrips(["set", "other"], "set", new Set([2]), 3)
    assert.deepEqual(strips, [{ id: "set", layer: 2 }, "other"])
    assert.deepEqual(Array.from(stripPlacements(strips, "set", 3)), [2])
  })

  test("a single layer font lists strips without a layer", () => {
    assert.deepEqual(placedStrips([], "set", new Set([1]), 1), ["set"])
  })

  test("strips on one layer only cover that layer", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ ...SET, layer: 2 }])
    assert.equal(textures.shared.stripLayer, 1)
    assert.equal(stripCovers(textures.shared, null, 2), false)
    assert.equal(stripCovers(textures.shared, 0, 2), false)
    assert.ok(stripCovers(textures.shared, 1, 2))
  })

  test("the first listed strips win an id", () => {
    const second = { id: "second", depth: 22, textures: { shared: { authors: "late" }, extra: { authors: "d" } } }
    const { textures } = mergeStrips({ textures: {} }, [SET, second])
    assert.equal(textures.shared.authors, "a")
    assert.equal(textures.extra.folder, "strips/second")
  })

  test("a font can attach its own variants to a shared strip", () => {
    const { textures } = mergeStrips({ textures: { shared: { strip: "set", variants: { mine: { type: "sheet" } } } } }, [SET])
    assert.equal(textures.shared.authors, "a")
    assert.equal(textures.shared.folder, "strips/set")
    assert.equal(textures.shared.strip, undefined)
    assert.equal(textures.shared.variants.kid.folder, "strips/set")
    assert.deepEqual(textures.shared.variants.mine, { type: "sheet", folder: null, stripSet: null })
  })

  test("attaching to strips the font doesn't list, or a strip they don't have, fails loudly", () => {
    assert.throws(() => mergeStrips({ textures: { shared: { strip: "missing" } } }, [SET]), /missing/)
    assert.throws(() => mergeStrips({ textures: { nothing: { strip: "set" } } }, [SET]), /no nothing/)
  })
})

describe("stripRows", () => {
  const range = { top: 40, bottom: -8 }

  test("a font's own strip uses the font's measurements", () => {
    assert.deepEqual(stripRows({}, range, 22), { depth: 22, top: 40, bottom: -8, rows: 92 })
  })

  test("a shared strip uses its own depth and baseline", () => {
    assert.deepEqual(stripRows({ stripSet: "set", stripDepth: 22, stripBaseline: 30, stripHeight: 40 }, { top: 40, bottom: 0 }, 16), { depth: 22, top: 40, bottom: -8, rows: 92 })
  })

  test("a strip can be listed by id or as an object", () => {
    assert.deepEqual(stripUse({ id: "set" }), { id: "set", layer: null })
    assert.deepEqual(stripUse("set"), { id: "set", layer: null })
  })

  test("a strip set can be tied to one layer of the font", () => {
    assert.deepEqual(stripUse({ id: "set", layer: 2 }), { id: "set", layer: 2 })
    assert.deepEqual([stripItem("set"), stripItem("set", 2)], ["set", { id: "set", layer: 2 }])
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, layer: 2, textures: { a: {} } }])
    assert.equal(textures.a.stripLayer, 1)
  })

  test("a font's own strip on a layered font holds one strip per layer, each as deep as its slice and as tall as its layer", () => {
    const cells = [{ char: "a", row: 0, column: 0, width: 1, height: 4, top: 4, bottom: 0, mask: Uint8Array.from([1, 1, 1, 1]), depths: Uint8Array.from([1, 0, 0, 1]) }]
    const shape = stripRows({}, { top: 4, bottom: 0 }, 10)
    const layers = [1, 0.8]
    assert.deepEqual(stackedStrip(shape, layers, 0, cells), { shape: { depth: 2, top: 3, bottom: 1, rows: 6 }, offset: 0, total: 26 })
    assert.deepEqual(stackedStrip(shape, layers, 1, cells), { shape: { depth: 8, top: 4, bottom: 0, rows: 20 }, offset: 6, total: 26 })
    assert.deepEqual(layerSlice(layers, 0), { from: 0.8, size: 1 - 0.8 })
    assert.deepEqual(layerSlice(layers, 1), { from: 0, size: 0.8 })
  })

  test("a strip keeps its own size and centres a shorter font by default", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, height: 40, textures: { a: {} } }])
    assert.deepEqual(stripRows(textures.a, { top: 32, bottom: 0 }, 22), { depth: 22, top: 40, bottom: -8, rows: 92 })
    assert.deepEqual(stripRows(textures.a, { top: 32, bottom: 0 }, 22, 32), { depth: 22, top: 36, bottom: -12, rows: 92 })
    assert.deepEqual(stripRows(textures.a, { top: 40, bottom: 0 }, 22, 40), { depth: 22, top: 40, bottom: -8, rows: 92 })
  })

  test("a strip's anchor lines up the font's topline, middle or baseline with its own", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, height: 40, textures: { top: { anchor: "top" }, middle: {}, base: { anchor: "base" } } }])
    const rows = name => stripRows(textures[name], { top: 32, bottom: 0 }, 22, 32)
    assert.deepEqual(["top", "middle", "base"].map(name => [rows(name).top, rows(name).bottom]), [[32, -16], [36, -12], [40, -8]])
    assert.deepEqual(STRIP_ANCHORS.map(anchor => anchorShift({ anchor, stripHeight: 40 }, 48)), [-8, -4, 0])
  })

  test("a centred strip snaps the font to the nearest whole one of its pixels, down on a tie", () => {
    assert.equal(anchorShift({ stripHeight: 40 }, 34), 3)
    assert.equal(anchorShift({ stripHeight: 40, snap: 4 }, 34), 4)
    assert.equal(anchorShift({ stripHeight: 40, snap: 2 }, 34), 2)
    assert.equal(anchorShift({ stripHeight: 40 }, 33), 3)
    assert.equal(anchorShift({ stripHeight: 40, snap: 3 }, 48), -3)
    assert.equal(anchorShift({ anchor: "top", stripHeight: 40, snap: 4 }, 34), 6)
  })

  test("strip types need a height", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, textures: { a: {} } }])
    assert.throws(() => stripRows(textures.a, { top: 32, bottom: 0 }, 22, 32), /need a height/)
  })

  test("a stretching strip fits its face between the font's baseline and topline, and repeats its last rows past its own", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, height: 40, textures: { a: { stretch: true } } }])
    const rows = stripRows(textures.a, { top: 22, bottom: -4 }, 22, 20)
    assert.deepEqual(rows, { depth: 22, top: 40, bottom: -8, rows: 92, scale: { from: 20, to: 40, base: 0 } })
    assert.deepEqual([-12, -9, -8, -4, -1, 0, 1, 10, 19, 20, 21].map(y => stripY(rows, y)), [-8, -8, -8, -8, -2, 0, 2, 20, 38, 39, 39])
    assert.throws(() => stripRows({ stretch: true, stripSet: "set", stripDepth: 22, stripBaseline: 30 }, { top: 20, bottom: 0 }, 22, 20), /need a height/)
  })

  test("a stretching strip on a layer fits between that layer's own baseline and topline", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, height: 40, textures: { a: { stretch: true } } }])
    const rows = stripRows(textures.a, { top: 22, bottom: -4, lines: { base: 2, top: 22 } }, 22, 24)
    assert.deepEqual(rows.scale, { from: 20, to: 40, base: 2 })
    assert.deepEqual([1, 2, 12, 21, 22].map(y => stripY(rows, y)), [-2, 0, 20, 38, 39])
  })

  test("a layer's baseline and topline come from its ordinary letters", () => {
    const depths = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1])
    const letter = { char: "a", width: 3, height: 3, bottom: 0, top: 3, mask: new Uint8Array(9).fill(1), depths }
    const tall = { char: "$", width: 3, height: 5, bottom: 0, top: 5, mask: new Uint8Array(15).fill(1), depths: new Uint8Array(15) }
    assert.deepEqual(stripRange({ cells: [letter, tall], capHeight: 3 }, 0), { top: 5, bottom: 0, highest: "$", lowest: "$", lines: { base: 1, top: 2 } })
  })

  test("a baseline left out falls back to the depth", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, height: 42, textures: { a: {} } }])
    assert.deepEqual(stripRows(textures.a, { top: 42, bottom: 0 }, 22), { depth: 22, top: 42, bottom: 0, rows: 86 })
  })
})
