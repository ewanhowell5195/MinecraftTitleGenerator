import assert from "node:assert/strict"
import path from "node:path"
import { describe, test } from "node:test"
import { readJson, readPng } from "../generator/common.js"
import { fontDir, fontTextureList, publishedFonts, readMask, readStripSet } from "../generator/fonts.js"
import { stripRange } from "../src/lib/assets.js"
import { stripsOf } from "../src/lib/font.js"
import { withGenerated } from "../src/lib/generated.js"
import { defaultDepth } from "../src/lib/settings.js"
import { mergeStrips, stripRows } from "../src/lib/strips.js"

const SET = { id: "set", depth: 22, baseline: 30, textures: { shared: { author: "a", variants: { kid: { author: "b" } } }, other: { author: "c" } } }

describe("mergeStrips", () => {
  test("adds shared strips after the font's own and tags where they came from", () => {
    const { textures } = mergeStrips({ textures: { flat: {} } }, [SET])
    assert.deepEqual(Object.keys(textures), ["flat", "shared", "other"])
    assert.equal(textures.shared.folder, "strips/set")
    assert.equal(textures.shared.variants.kid.folder, "strips/set")
    assert.equal(textures.flat.folder, undefined)
  })

  test("a font's own strip overrides a shared one", () => {
    const { textures } = mergeStrips({ textures: { shared: { author: "mine" } } }, [SET])
    assert.deepEqual(textures.shared, { author: "mine" })
  })

  test("the first listed strips win an id", () => {
    const second = { id: "second", depth: 22, textures: { shared: { author: "late" }, extra: { author: "d" } } }
    const { textures } = mergeStrips({ textures: {} }, [SET, second])
    assert.equal(textures.shared.author, "a")
    assert.equal(textures.extra.folder, "strips/second")
  })

  test("a font can attach its own variants to a shared strip", () => {
    const { textures } = mergeStrips({ textures: { shared: { strip: "set", variants: { mine: { type: "sheet" } } } } }, [SET])
    assert.equal(textures.shared.author, "a")
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
      const names = Object.entries(set.textures).flatMap(([name, data]) => [name].concat(Object.keys(data.variants ?? {})))
      sets.set(id, { ...set, heights: names.map(name => [name, readPng(path.join(set.folder, "textures", `${name}.png`)).height]) })
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
      for (const id of stripsOf(font, fonts)) {
        const set = setOf(id)
        const baseline = set.baseline ?? set.depth
        assert.ok(defaultDepth(font) <= set.depth, `${font.id} is deeper than the ${id} strips`)
        assert.ok(-range.bottom <= baseline - set.depth, `${font.id} goes further below the baseline than the ${id} strips`)
        for (const [name, height] of set.heights) {
          const resolution = height / (baseline + range.top + set.depth)
          assert.ok(Number.isInteger(Math.log2(resolution)), `${font.id} is the wrong height for ${id}.${name}: resolution ${resolution}`)
        }
      }
    }
  })

  test("a font's entry on a shared strip exists only to add variants", () => {
    for (const font of fonts.filter(entry => !entry.inherits)) {
      for (const [id, data] of Object.entries(readJson(path.join(fontDir(font), "textures.json")).textures)) {
        if (!data.strip) continue
        assert.ok(Object.keys(data.variants ?? {}).length, `${font.id}.${id} attaches to ${data.strip} with no variants`)
        assert.ok(stripsOf(font, fonts).includes(data.strip), `${font.id}.${id} attaches to ${data.strip}, which it doesn't list`)
        assert.ok(setOf(data.strip).textures[id], `${font.id}.${id} attaches to ${data.strip}, which has no ${id}`)
      }
    }
  })

  test("strips only default to overlays every font has", () => {
    const generated = withGenerated({})
    for (const font of users) {
      for (const id of stripsOf(font, fonts)) {
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
