import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"
import { readJson } from "../../generator/common.js"
import { fontDir, fontTextureList, readStripSet } from "../../generator/fonts.js"
import { stripsOf } from "#lib/font/catalog.js"
import { basedOnParts, findEntry, fontCredit } from "#lib/font/credits.js"
import { STRIP_ANCHORS, mergeStrips, stripUse } from "#lib/font/strips.js"
import { pngSize } from "#lib/minecraft/minecraft.js"
import { withGenerated } from "#lib/texture/overlays/settings.js"
import { creditsHtml } from "#src/site/credits/build.js"
import { fonts, sheets } from "../helpers/published.js"

describe("published strips", () => {
  const users = fonts.filter(font => stripsOf(font, fonts).length && !font.inherits)
  const sets = new Map()

  function setOf(id) {
    if (!sets.has(id)) {
      const set = readStripSet(id)
      const names = Object.entries(set.textures).flatMap(([name, data]) => [name].concat(Object.keys(data.variants ?? {})))
      sets.set(id, { ...set, heights: names.map(name => [name, pngSize(fs.readFileSync(path.join(set.folder, "textures", `${name}.png`))).height]) })
    }
    return sets.get(id)
  }

  test("every strip type a font uses has a height its strips line up with", () => {
    assert.ok(users.length)
    for (const font of users) {
      for (const { id } of stripsOf(font, fonts).map(stripUse)) {
        const set = setOf(id)
        assert.ok(Number.isInteger(set.height), `the ${id} strips need a height`)
        for (const [name, height] of set.heights) {
          const resolution = height / ((set.baseline ?? set.depth) + set.height + set.depth)
          assert.ok(Number.isInteger(Math.log2(resolution)), `${id}.${name} is the wrong height: resolution ${resolution}`)
        }
      }
    }
  })

  test("every strip that doesn't stretch has a known anchor, and stretching strips have none", () => {
    for (const font of users) {
      for (const { id } of stripsOf(font, fonts).map(stripUse)) {
        for (const [name, data] of Object.entries(setOf(id).textures)) {
          for (const [variant, own] of [[name, {}]].concat(Object.entries(data.variants ?? {}))) {
            const entry = { ...data, ...own }
            if (entry.stretch) assert.equal(entry.anchor, undefined, `${id}.${variant} stretches, so it has no anchor`)
            else assert.ok(entry.anchor === undefined || STRIP_ANCHORS.includes(entry.anchor), `${id}.${variant} has an unknown anchor`)
          }
        }
      }
    }
  })

  test("a font's entry on a shared strip exists only to add variants", () => {
    for (const font of sheets) {
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

describe("published credits", () => {
  test("every font's based on is in the font list", () => {
    const listed = fonts.map(font => ({ ...font, name: font.name ?? font.id }))
    for (const font of listed) fontCredit(font, listed)
    assert.equal(fontCredit(listed.find(font => font.id === "minecraft-ten-rounded"), listed), "Ewan Howell, based on minecraft-ten")
  })

  const lists = new Map()

  function listOf(owner) {
    if (!lists.has(owner)) {
      if (owner.startsWith("strips.")) lists.set(owner, mergeStrips({ textures: {}, overlays: {} }, [readStripSet(owner.slice("strips.".length))]))
      else {
        const entry = fonts.find(font => font.id === owner)
        assert.ok(entry, `no font ${owner}`)
        lists.set(owner, fontTextureList(entry, fonts))
      }
    }
    return lists.get(owner)
  }

  function entries(id) {
    const list = listOf(id)
    return [list.textures, list.overlays].flatMap(group => Object.entries(group ?? {}).flatMap(([key, data]) => [[key, data, null]].concat(Object.entries(data.variants ?? {}).map(([variant, value]) => [variant, value, key]))))
  }

  function resolve(data, owner, seen) {
    if (data.authors || !data.basedOn) return data.authors ?? null
    const target = basedOnParts(data.basedOn, data.stripSet ? `strips.${data.stripSet}` : owner)
    const key = `${target.owner}.${target.id}`
    assert.ok(!seen.has(key), `${key} is in a loop`)
    const entry = findEntry(listOf(target.owner), target.id)
    assert.ok(entry, `${key} does not exist`)
    return resolve(entry, target.owner, new Set(seen).add(key))
  }

  test("every based on points at something that ends in an author", () => {
    for (const font of sheets) {
      for (const [id, data] of entries(font.id)) {
        if (!data.basedOn) continue
        assert.ok(resolve(data, font.id, new Set([`${font.id}.${id}`])), `${font.id}.${id} has no author`)
      }
    }
  })

  test("a variant is never based on its own parent", () => {
    for (const font of sheets) {
      for (const [id, data, parent] of entries(font.id)) {
        if (parent && data.basedOn) assert.notEqual(data.basedOn, parent, `${font.id}.${id}`)
      }
    }
  })

  test("the credits page builds from the published fonts and textures, splitting shared credits", () => {
    const html = creditsHtml(path.resolve(import.meta.dirname, "../..")).contributors
    const people = Array.from(html.matchAll(/<h2>([^<]+)<\/h2><p>/g), match => match[1])
    assert.ok(people.length > 1)
    assert.equal(new Set(people).size, people.length)
    assert.ok(people.every(person => !/[,&]/.test(person)), people.filter(person => /[,&]/.test(person)).join(", "))
  })
})
