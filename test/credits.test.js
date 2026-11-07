import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"
import { fontDir, publishedFonts } from "../generator/fonts.js"
import { credit, findEntry, fontCredit } from "../src/lib/credits.js"
import { usePlatform } from "../src/lib/platform.js"

const FONTS = [{ id: "base", name: "Base Font" }, { id: "port", name: "Port Font" }]
const LISTS = {
  "font/base/textures.json": { textures: { cracked: { author: "original", variants: { cracked_old: { author: "older" }, cracked_left: {} } }, chain: { basedOn: "cracked" }, sibling: { author: "porter", basedOn: "cracked" }, sameAsSibling: { basedOn: "sibling" }, away: { author: "porter", basedOn: "port.shape" } }, overlays: { glass: { author: "glazier" } } },
  "font/port/textures.json": { textures: {}, overlays: {} }
}

usePlatform({ fetch: async url => ({ ok: url in LISTS, json: async () => LISTS[url] }) })

async function settled(read) {
  read()
  await new Promise(resolve => setTimeout(resolve))
  return read()
}

describe("credit", () => {
  test("shows a plain author", () => {
    assert.equal(credit({ author: "someone" }, "port", FONTS), "someone")
    assert.equal(credit({}, "port", FONTS), null)
  })

  test("names the font when the original is in another font", () => {
    assert.equal(credit({ author: "porter", basedOn: "base.oak_planks" }, "port", FONTS), "porter, based on Base Font: Oak Planks")
  })

  test("leaves the font out when the original is in the same font", () => {
    assert.equal(credit({ author: "porter", basedOn: "grass_side" }, "base", FONTS), "porter, based on Grass Side")
  })

  test("based on with no author is just the original's author", async () => {
    assert.equal(await settled(() => credit({ basedOn: "base.cracked" }, "port", FONTS)), "original")
    assert.equal(await settled(() => credit({ basedOn: "cracked" }, "base", FONTS)), "original")
  })

  test("follows a chain and finds variants and overlays", async () => {
    assert.equal(await settled(() => credit({ basedOn: "base.chain" }, "port", FONTS)), "original")
    assert.equal(await settled(() => credit({ basedOn: "base.cracked_old" }, "port", FONTS)), "older")
    assert.equal(await settled(() => credit({ basedOn: "base.cracked_left" }, "port", FONTS)), "original")
    assert.equal(await settled(() => credit({ basedOn: "base.glass" }, "port", FONTS)), "glazier")
  })

  test("a chain keeps the link of the first original that has its own author", async () => {
    assert.equal(await settled(() => credit({ basedOn: "base.sibling" }, "port", FONTS)), "porter, based on Base Font: Cracked")
    assert.equal(await settled(() => credit({ basedOn: "base.sameAsSibling" }, "port", FONTS)), "porter, based on Base Font: Cracked")
    assert.equal(await settled(() => credit({ basedOn: "sibling" }, "base", FONTS)), "porter, based on Cracked")
    assert.equal(await settled(() => credit({ basedOn: "base.away" }, "port", FONTS)), "porter, based on Shape")
  })

  test("a variant uses its parent's credit unless it has its own", () => {
    const parent = { author: "porter", basedOn: "base.cracked" }
    assert.equal(credit({}, "port", FONTS, parent), "porter, based on Base Font: Cracked")
    assert.equal(credit({ author: "other" }, "port", FONTS, parent), "other")
  })

  test("an unknown font or texture fails loudly", async () => {
    assert.throws(() => credit({ author: "a", basedOn: "missing.cracked" }, "port", FONTS), /missing/)
    assert.throws(() => credit({ basedOn: "missing.cracked" }, "port", FONTS), /missing/)
    await settled(() => credit({ basedOn: "base.cracked" }, "port", FONTS))
    assert.throws(() => credit({ basedOn: "base.nothing" }, "port", FONTS), /base\.nothing/)
  })
})

describe("fontCredit", () => {
  const fonts = [{ id: "base", name: "Base Font", author: "original" }, { id: "plain", name: "Plain" }, { id: "port", name: "Port Font", author: "porter", basedOn: "plain" }, { id: "copy", name: "Copy", basedOn: "base" }, { id: "copy2", name: "Copy 2", basedOn: "port" }]
  const of = id => fontCredit(fonts.find(font => font.id === id), fonts)

  test("follows the same rules as textures", () => {
    assert.equal(of("base"), "original")
    assert.equal(of("plain"), null)
    assert.equal(of("port"), "porter, based on Plain")
    assert.equal(of("copy"), "original")
    assert.equal(of("copy2"), "porter, based on Plain")
  })

  test("an unknown font fails loudly", () => {
    assert.throws(() => fontCredit({ id: "a", basedOn: "missing" }, fonts), /missing/)
  })
})

describe("published credits", () => {
  const fonts = publishedFonts()

  test("every font's based on is in the font list", () => {
    const listed = fonts.map(font => ({ ...font, name: font.name ?? font.id }))
    for (const font of listed) fontCredit(font, listed)
    assert.equal(fontCredit(listed.find(font => font.id === "minecraft-ten-rounded"), listed), "Ewan Howell, based on minecraft-ten")
  })

  const lists = new Map()

  function listOf(id) {
    if (!lists.has(id)) {
      const entry = fonts.find(font => font.id === id)
      assert.ok(entry, `no font ${id}`)
      const owner = entry.inherits ? fonts.find(font => font.id === entry.variant) : entry
      lists.set(id, JSON.parse(fs.readFileSync(path.join(fontDir(owner), "textures.json"), "utf8")))
    }
    return lists.get(id)
  }

  function entries(id) {
    const list = listOf(id)
    return [list.textures, list.overlays].flatMap(group => Object.entries(group ?? {}).flatMap(([key, data]) => [[key, data, null]].concat(Object.entries(data.variants ?? {}).map(([variant, value]) => [variant, value, key]))))
  }

  function resolve(data, fontId, seen) {
    if (data.author || !data.basedOn) return data.author ?? null
    const [first, second] = data.basedOn.split(".")
    const target = second ? first : fontId
    const key = `${target}.${second ?? first}`
    assert.ok(!seen.has(key), `${key} is in a loop`)
    const entry = findEntry(listOf(target), second ?? first)
    assert.ok(entry, `${key} does not exist`)
    return resolve(entry, target, new Set(seen).add(key))
  }

  test("every based on points at something that ends in an author", () => {
    for (const font of fonts.filter(entry => !entry.inherits)) {
      for (const [id, data] of entries(font.id)) {
        if (!data.basedOn) continue
        assert.ok(resolve(data, font.id, new Set([`${font.id}.${id}`])), `${font.id}.${id} has no author`)
      }
    }
  })

  test("a variant is never based on its own parent", () => {
    for (const font of fonts.filter(entry => !entry.inherits)) {
      for (const [id, data, parent] of entries(font.id)) {
        if (parent && data.basedOn) assert.notEqual(data.basedOn, parent, `${font.id}.${id}`)
      }
    }
  })
})
