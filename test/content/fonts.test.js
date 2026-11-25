import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"
import { readJson, readPng } from "../../generator/common.js"
import { fontTextureList } from "../../generator/fonts.js"
import { thumbnailEntry, thumbnailList } from "../../generator/thumbnails.js"
import { titleCase } from "#lib/core/names.js"
import { fullOrder, sheetFolder, splitCells } from "#lib/font/catalog.js"
import { fontFromPublished } from "#lib/font/editor/import.js"
import { bandLayouts, independentLayers, layerCell } from "#lib/font/flatSheet.js"
import { collisionAmount } from "#lib/font/kerning.js"
import { DEFAULT_ORDER } from "#lib/font/order.js"
import { sheetLayout } from "#lib/font/sheet.js"
import { parseMask, solidMask } from "#lib/font/sheetParse.js"
import { stripLayout, stripRange } from "#lib/font/strips.js"
import { readTitleBytes, writeLines } from "#lib/link/linkKeys.js"
import { defaultBorder, defaultDepth } from "#lib/settings/defaults.js"
import { FACE_PANELS, LAYERS, perLayerDefault, textureFaces } from "#lib/settings/textureDefaults.js"
import { decodePng } from "#lib/core/png.js"
import { fontMeasure } from "#lib/submissions/kinds/stripFit.js"
import { comparable, sheetOf } from "../helpers/fontEditor.js"
import { fonts, maskOf, sheets } from "../helpers/published.js"
import { publicContext } from "../helpers/site.js"

const context = publicContext(fonts.map(item => ({ ...item, name: item.name ?? titleCase(item.id) })))

describe("published font sheets", () => {
  for (const entry of sheets) {
    test(entry.id, async () => {
      const { png, cells, capHeight, layers, folder } = maskOf(entry)

      const order = Array.from(fullOrder(entry, fonts))
      const chars = cells.map(cell => cell.char)
      assert.deepEqual(chars.slice(0, order.length), order)
      assert.ok(chars.length === order.length || chars.length === order.length + 1 && chars.at(-1) === " ")
      for (const glyph of cells.filter(cell => cell.width)) {
        assert.equal(glyph.mask.length, glyph.width * glyph.height, glyph.char)
        assert.equal(glyph.top - glyph.bottom, glyph.height, glyph.char)
        assert.ok(glyph.mask.subarray(0, glyph.width).some(Boolean), `${glyph.char} bottom row`)
        assert.ok(glyph.mask.subarray(glyph.mask.length - glyph.width).some(Boolean), `${glyph.char} top row`)
      }

      const depth = defaultDepth(entry)
      const density = readJson(path.join(folder, "textures.json")).textures.flat?.density ?? 1
      const flat = readPng(path.join(folder, "textures", "flat.png"))
      const independent = independentLayers(entry)
      const bands = layers ? bandLayouts(cells, capHeight, depth, layers, independent) : [{ layout: sheetLayout(cells, capHeight, depth), offset: 0 }]
      for (const [layer, band] of bands.entries()) {
        for (const [glyph, at] of band.layout) {
          const own = layers ? layerCell(glyph, layer, independent) : glyph
          assert.deepEqual(solidMask(flat.data, flat.width, density, at.x + (own.left ?? 0), at.top + glyph.top - own.top + band.offset, own.width, own.height), own.mask, `flat ${glyph.char} layer ${layer + 1}`)
        }
      }

      const { glyphs } = splitCells(entry, fonts, cells)
      const border = defaultBorder("top", entry)
      for (const [pair, amount] of Object.entries(entry.kerning ?? {})) assert.ok(amount <= collisionAmount(glyphs, pair, border), `${pair} kerned ${amount}, past its collision`)

      const zero = parseMask(png.data, png.width, png.height, chars.join(""), 0)
      const unspaced = splitCells(entry, fonts, zero.list).glyphs
      const font = fontFromPublished({ ...entry, name: entry.name ?? entry.id }, Object.values(unspaced), zero.capHeight)
      assert.equal(font.height, zero.capHeight)
      assert.ok(font.basedOn === entry.id)
      const after = sheetOf(font)
      for (const char of Array.from(DEFAULT_ORDER)) {
        const before = unspaced[char]
        const cell = after.glyphs[char]
        if (!before) assert.ok(!cell?.width, `the editor should start ${char} blank`)
        else assert.deepEqual(comparable(cell), comparable({ ...before, stretch: before.stretch ?? null }), `the editor changes ${char}`)
      }

      const textures = fontTextureList(entry, fonts)
      const count = layers?.length ?? 1
      for (const [id, texture] of Object.entries(textures.textures)) {
        for (const variant of [null].concat(Object.keys(texture.variants ?? {}))) {
          const object = { textureSource: "premade", texture: id, textureVariant: variant }
          const merged = variant ? { ...texture, ...texture.variants[variant] } : texture
          for (const key of LAYERS.concat(FACE_PANELS)) {
            if (perLayerDefault(merged[key], key)) assert.equal(merged[key].length, count, `${variant ?? id} gives ${key} for ${merged[key].length} layers, but the font has ${count}`)
          }
          for (let layer = 0; layer < count; layer++) {
            for (const name of FACE_PANELS) textureFaces(textures, object, name, layer)
          }
        }
      }

      const mine = await decodePng(new Uint8Array(fs.readFileSync(path.join(folder, "font.png"))))
      assert.deepEqual(Buffer.from(mine.data), png.data, "the submission PNG decoder reads font.png differently to pngjs")
      const stacked = layers?.length > 1 ? stripLayout({}, { ...entry, cells, capHeight, layers }, depth, 0).total : null
      assert.deepEqual(await fontMeasure(context, entry), { range: stripRange({ cells, capHeight }), capHeight, depth, stacked }, "strip submissions measure the font differently to the thumbnails")
    })
  }

  test("an inheriting variant gets exactly the characters of its order", () => {
    const entry = fonts.find(font => font.id === "minecraft-ten")
    const variant = fonts.find(font => font.id === "minecraft-ten-v2")
    const { glyphs, alternates } = splitCells(entry, fonts, maskOf(entry).cells)
    assert.deepEqual(Object.keys(alternates[variant.id]).sort(), Array.from(variant.order).sort())
    assert.notEqual(alternates[variant.id].e, glyphs.e)
    assert.equal(sheetFolder(variant, fonts), "fonts/minecraft-ten")
  })
})

describe("published ids", () => {
  test("every font is stored compactly in links by its id", () => {
    for (const id of fonts.map(entry => entry.id).concat("a-font-added-later")) {
      assert.notEqual(writeLines([{ font: id }])[2], 0, id)
      assert.equal(readTitleBytes(writeLines([{ font: id }])).lines[0].font, id)
    }
  })

  test("no published font and PNG shape share an id", () => {
    const list = thumbnailList()
    for (const entry of list) assert.equal(thumbnailEntry(list, entry.id), entry)
  })
})
