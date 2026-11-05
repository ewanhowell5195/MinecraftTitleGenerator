import { describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { flatSheet, writeStarterTextures } from "../generator/flat.js"
import { solidMask } from "../src/lib/font.js"

const FACE = [255, 255, 255, 255]
const UP = [176, 176, 176, 255]
const DOWN = [84, 84, 84, 255]
const CLEAR = [0, 0, 0, 0]

function pixel(sheet, x, y) {
  const i = (y * sheet.width + x) * 4
  return Array.from(sheet.data.subarray(i, i + 4))
}

function grid(sheet) {
  return Array.from({ length: sheet.height }, (_, y) => Array.from({ length: sheet.width }, (_, x) => pixel(sheet, x, y)))
}

function cell(char, width, height, mask, extra = {}) {
  return { char, width, height, mask: new Uint8Array(mask), bottom: 0, top: height, row: 0, column: 0, ...extra }
}

function solid(char, width, height, extra) {
  return cell(char, width, height, new Array(width * height).fill(1), extra)
}

describe("flatSheet", () => {
  const notched = cell("a", 2, 2, [1, 0, 1, 1])

  test("paints the face flipped upright with strips from its end rows", () => {
    const { sheet, width, height } = flatSheet([notched], 2, 1)
    assert.equal(width, 2)
    assert.equal(height, 4)
    assert.deepEqual(grid(sheet), [[UP, UP], [FACE, FACE], [FACE, CLEAR], [DOWN, CLEAR]])
  })

  test("repeats the strips across the depth", () => {
    const { sheet, height } = flatSheet([notched], 2, 2)
    assert.equal(height, 6)
    assert.deepEqual(grid(sheet), [[UP, UP], [UP, UP], [FACE, FACE], [FACE, CLEAR], [DOWN, CLEAR], [DOWN, CLEAR]])
  })

  test("scales every pixel by the density", () => {
    const { sheet, width, height } = flatSheet([notched], 2, 1, 2)
    assert.equal(width, 2)
    assert.equal(height, 4)
    assert.equal(sheet.width, 4)
    assert.equal(sheet.height, 8)
    for (const [x, y, colour] of [[0, 0, UP], [3, 1, UP], [3, 2, FACE], [1, 5, FACE], [2, 4, CLEAR], [3, 5, CLEAR], [0, 7, DOWN], [2, 6, CLEAR]]) assert.deepEqual(pixel(sheet, x, y), colour, `${x},${y}`)
  })

  test("sizes the sheet around every row", () => {
    const a = solid("a", 3, 5)
    const b = solid("b", 2, 8, { top: 6, bottom: -2, column: 1 })
    const c = solid("c", 1, 5, { row: 1 })
    const { sheet, width, height, layout } = flatSheet([a, b, c], 5, 2)
    assert.equal(width, 7)
    assert.equal(height, 23)
    assert.equal(sheet.width, 7)
    assert.equal(sheet.height, 23)
    assert.deepEqual(layout.get(c), { x: 0, top: 16, up: 14, down: 21 })
  })

  test("leaves the gap between glyphs transparent", () => {
    const a = solid("a", 1, 2)
    const b = solid("b", 1, 2, { column: 1 })
    const { sheet } = flatSheet([a, b], 2, 1)
    assert.equal(sheet.width, 4)
    for (let y = 0; y < sheet.height; y++) {
      assert.deepEqual(pixel(sheet, 1, y), CLEAR)
      assert.deepEqual(pixel(sheet, 2, y), CLEAR)
    }
  })

  test("skips empty cells", () => {
    const space = cell(" ", 0, 0, [], { top: 0 })
    const { layout, width } = flatSheet([space, solid("a", 2, 2, { column: 1 })], 2, 1)
    assert.equal(layout.has(space), false)
    assert.equal(width, 2)
  })

  test("round trips through solidMask at any density", () => {
    const hooked = cell("g", 3, 4, [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1], { top: 2, bottom: -2, column: 1 })
    const cells = [notched, hooked, cell("h", 2, 3, [1, 1, 0, 1, 1, 0], { row: 1 })]
    for (const density of [1, 2, 3]) {
      const { sheet, layout } = flatSheet(cells, 2, 2, density)
      for (const [glyph, at] of layout) assert.deepEqual(solidMask(sheet.data, sheet.width, density, at.x, at.top, glyph.width, glyph.height), glyph.mask, `${glyph.char} at density ${density}`)
    }
  })
})

describe("writeStarterTextures", () => {
  test("writes a flat texture entry when the file is missing", t => {
    t.mock.method(fs, "existsSync", () => false)
    const write = t.mock.method(fs, "writeFileSync", () => {})
    writeStarterTextures("some/folder")
    assert.equal(write.mock.callCount(), 1)
    const [file, text] = write.mock.calls[0].arguments
    assert.equal(file, path.join("some/folder", "textures.json"))
    assert.deepEqual(JSON.parse(text), { textures: { flat: { border: "#000000" } }, overlays: {} })
  })

  test("leaves an existing file alone", t => {
    t.mock.method(fs, "existsSync", () => true)
    const write = t.mock.method(fs, "writeFileSync", () => {})
    writeStarterTextures("some/folder")
    assert.equal(write.mock.callCount(), 0)
  })
})
