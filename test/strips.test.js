import assert from "node:assert/strict"
import path from "node:path"
import { describe, test } from "node:test"
import { readJson, readPng } from "../generator/common.js"
import { fontDir, fontTextureList, publishedFonts, readMask, readStripSet } from "../generator/fonts.js"
import { stripRange } from "../src/lib/assets.js"
import { stripsOf } from "../src/lib/font.js"
import { withGenerated } from "../src/lib/generated.js"
import { defaultDepth } from "../src/lib/settings.js"
import { centredOffset, layerSlice, mergeStrips, stackedStrip, stripItem, stripRows, stripUse, stripY } from "../src/lib/strips.js"

const SET = { id: "set", depth: 22, baseline: 30, textures: { shared: { authors: "a", variants: { kid: { authors: "b" } } }, other: { authors: "c" } } }

describe("mergeStrips", () => {
  test("adds shared strips after the font's own and tags where they came from", () => {
    const { textures } = mergeStrips({ textures: { flat: {} } }, [SET])
    assert.deepEqual(Object.keys(textures), ["flat", "shared", "other"])
    assert.equal(textures.shared.folder, "strips/set")
    assert.equal(textures.shared.variants.kid.folder, "strips/set")
    assert.equal(textures.flat.folder, undefined)
  })

  test("a font's own strip overrides a shared one", () => {
    const { textures } = mergeStrips({ textures: { shared: { authors: "mine" } } }, [SET])
    assert.deepEqual(textures.shared, { authors: "mine" })
  })

  test("a strip is left out when one of its ids is already a texture or variant", () => {
    const { textures } = mergeStrips({ textures: { entities: { variants: { shared: {} } }, kid: {} } }, [{ ...SET, textures: { ...SET.textures, lone: { variants: { kid: {} } } } }])
    assert.deepEqual(Object.keys(textures), ["entities", "kid", "other"])
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
    assert.deepEqual(stripRows({ stripSet: "set", stripDepth: 22, stripBaseline: 30 }, { top: 40, bottom: 0 }, 16), { depth: 22, top: 40, bottom: -8, rows: 92 })
  })

  test("a strip can be listed by id or as an object with an offset", () => {
    assert.deepEqual(stripUse("set"), { id: "set", offset: 0, layer: null })
    assert.deepEqual(stripUse({ id: "set", offset: 4 }), { id: "set", offset: 4, layer: null })
  })

  test("a strip set can be tied to one layer of the font", () => {
    assert.deepEqual(stripUse({ id: "set", layer: 2 }), { id: "set", offset: 0, layer: 2 })
    assert.deepEqual([stripItem("set"), stripItem("set", 3), stripItem("set", 0, 2)], ["set", { id: "set", offset: 3 }, { id: "set", layer: 2 }])
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, layer: 2, textures: { a: {} } }])
    assert.equal(textures.a.stripLayer, 1)
  })

  test("a font's own strip on a layered font holds one strip per layer, each as deep as its slice", () => {
    const shape = stripRows({}, range, 10)
    const layers = [1, 0.8]
    assert.deepEqual(stackedStrip(shape, layers, 0), { shape: { depth: 2, top: 40, bottom: -8, rows: 52 }, offset: 0, total: 116 })
    assert.deepEqual(stackedStrip(shape, layers, 1), { shape: { depth: 8, top: 40, bottom: -8, rows: 64 }, offset: 52, total: 116 })
    assert.deepEqual(layerSlice(layers, 0), { from: 0.8, size: 1 - 0.8 })
    assert.deepEqual(layerSlice(layers, 1), { from: 0, size: 0.8 })
  })

  test("an offset lifts the font's baseline above the strip's", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, offset: 8, textures: { a: {} } }])
    assert.equal(textures.a.stripOffset, 8)
    assert.deepEqual(stripRows(textures.a, { top: 32, bottom: 0 }, 22), { depth: 22, top: 32, bottom: -16, rows: 92 })
  })

  test("a strip with a height keeps its own size, and the offset picks which rows a shorter font uses", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, height: 40, textures: { a: {} } }])
    assert.deepEqual(stripRows(textures.a, { top: 32, bottom: 0 }, 22), { depth: 22, top: 40, bottom: -8, rows: 92 })
    assert.deepEqual(stripRows(textures.a, { top: 32, bottom: 0 }, 22, 32), { depth: 22, top: 36, bottom: -12, rows: 92 })
    assert.deepEqual(stripRows(textures.a, { top: 40, bottom: 0 }, 22, 40), { depth: 22, top: 40, bottom: -8, rows: 92 })
    assert.deepEqual(stripRows({ ...textures.a, stripOffset: 2 }, { top: 32, bottom: 0 }, 22, 32), { depth: 22, top: 34, bottom: -14, rows: 92 })
    assert.deepEqual(stripRows({ ...textures.a, stripOffset: 8 }, { top: 32, bottom: 0 }, 22), { depth: 22, top: 32, bottom: -16, rows: 92 })
  })

  test("a stretching strip fits its face between the font's baseline and topline", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, baseline: 30, height: 40, offset: 6, textures: { a: { stretch: true } } }])
    const rows = stripRows(textures.a, { top: 22, bottom: -4 }, 22, 20)
    assert.deepEqual(rows, { depth: 22, top: 40, bottom: -8, rows: 92, scale: { from: 20, to: 40 } })
    assert.deepEqual([-4, -1, 0, 1, 10, 19, 20, 21].map(y => stripY(rows, y)), [-4, -1, 0, 2, 20, 38, 40, 41])
    assert.throws(() => stripRows({ stretch: true, stripSet: "set", stripDepth: 22, stripBaseline: 30 }, { top: 20, bottom: 0 }, 22, 20), /need a height/)
  })

  test("a baseline left out falls back to the depth", () => {
    const { textures } = mergeStrips({ textures: {} }, [{ id: "set", depth: 22, textures: { a: {} } }])
    assert.deepEqual(stripRows(textures.a, { top: 42, bottom: 0 }, 22), { depth: 22, top: 42, bottom: 0, rows: 86 })
  })
})

describe("published strips", () => {
  const fonts = publishedFonts()
  const users = fonts.filter(font => stripsOf(font, fonts).length && !font.inherits)
  const sets = new Map()

  function setOf(id) {
    if (!sets.has(id)) {
      const set = readStripSet(id)
      const names = Object.entries(set.textures).flatMap(([name, data]) => [[name, !!data.stretch]].concat(Object.keys(data.variants ?? {}).map(variant => [variant, !!data.stretch])))
      sets.set(id, { ...set, heights: names.map(([name, stretch]) => [name, readPng(path.join(set.folder, "textures", `${name}.png`)).height, stretch]) })
    }
    return sets.get(id)
  }

  test("something uses the strips", () => {
    assert.ok(users.length)
  })

  test("a font fits every strip it lists", () => {
    for (const font of users) {
      const { cells, capHeight } = readMask(font, fonts)
      const range = stripRange({ cells, capHeight })
      for (const use of stripsOf(font, fonts).map(stripUse)) {
        const { id } = use
        const set = setOf(id)
        const offset = centredOffset(set.height, capHeight) + use.offset
        const baseline = set.baseline ?? set.depth
        assert.ok(defaultDepth(font) <= set.depth, `${font.id} is deeper than the ${id} strips`)
        assert.ok(-range.bottom <= baseline - set.depth + offset, `${font.id} goes further below the baseline than the ${id} strips`)
        if (set.height) assert.ok(range.top + offset <= set.height || set.heights.every(([, , stretch]) => stretch), `${font.id} reaches above the ${id} strips' topline`)
        for (const [name, height, stretch] of set.heights) {
          const resolution = height / (baseline + (set.height ?? range.top + offset) + set.depth)
          assert.ok(Number.isInteger(Math.log2(resolution)), `${font.id} is the wrong height for ${id}.${name}: resolution ${resolution}`)
          if (stretch) assert.ok(set.height, `${id}.${name} stretches, so the ${id} strips need a height`)
        }
      }
    }
  })

  test("a font's entry on a shared strip exists only to add variants", () => {
    for (const font of fonts.filter(entry => !entry.inherits)) {
      for (const [id, data] of Object.entries(readJson(path.join(fontDir(font), "textures.json")).textures)) {
        if (!data.strip) continue
        assert.ok(Object.keys(data.variants ?? {}).length, `${font.id}.${id} attaches to ${data.strip} with no variants`)
        assert.ok(stripsOf(font, fonts).map(item => stripUse(item).id).includes(data.strip), `${font.id}.${id} attaches to ${data.strip}, which it doesn't list`)
        assert.ok(setOf(data.strip).textures[id], `${font.id}.${id} attaches to ${data.strip}, which has no ${id}`)
      }
    }
  })

  test("strips only default to overlays every font has", () => {
    const generated = withGenerated({})
    for (const font of users) {
      for (const { id } of stripsOf(font, fonts).map(stripUse)) {
        for (const [name, data] of Object.entries(setOf(id).textures)) {
          for (const entry of [data].concat(Object.values(data.variants ?? {}))) {
            for (const layer of entry.overlays ?? []) assert.ok(generated[layer.overlay], `${id}.${name} uses ${layer.overlay}, which is not a generated overlay`)
          }
        }
      }
    }
  })

  test("every font's texture list loads", () => {
    for (const font of fonts) assert.ok(fontTextureList(font, fonts).textures)
  })
})
