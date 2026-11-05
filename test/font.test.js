import { describe, test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { DEFAULT_ORDER, flattenFonts, fullOrder, hasMarks, parseMask, scanMask, sheetFolder, sheetLayout, solidMask, splitCells } from "../src/lib/font.js"
import { defaultDepth } from "../src/lib/settings.js"
import { readJson, readPng } from "../generator/common.js"
import { publishedFonts, readMask } from "../generator/fonts.js"

const COLOURS = { ".": [255, 255, 255], "#": [0, 0, 0], R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255] }

function mask(rows) {
  const width = rows[0].length
  const height = rows.length
  const data = new Uint8Array(width * height * 4)
  for (const [y, row] of rows.entries()) {
    for (const [x, char] of Array.from(row).entries()) data.set(COLOURS[char].concat(255), (y * width + x) * 4)
  }
  return { data, width, height }
}

function scan(rows) {
  const { data, width, height } = mask(rows)
  return scanMask(data, width, height)
}

function parse(rows, order, gap = 0) {
  const { data, width, height } = mask(rows)
  return parseMask(data, width, height, order, gap)
}

function alphaImage(rows) {
  const width = rows[0].length
  const data = new Uint8Array(width * rows.length * 4).fill(255)
  for (const [y, row] of rows.entries()) {
    for (const [x, alpha] of row.entries()) data[(y * width + x) * 4 + 3] = alpha
  }
  return { data, width }
}

const SHEET = [
  "RRRRRR",
  "B.#R.R",
  "R##R.R",
  "G.#R.R",
  "RRRRRR"
]

describe("scanMask", () => {
  test("reads the row bounds, guide lines and cells", () => {
    const { rows } = scan(SHEET)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].top, 1)
    assert.equal(rows[0].bottom, 3)
    assert.equal(rows[0].topline, 1)
    assert.equal(rows[0].baseline, 3)
    assert.deepEqual(rows[0].cells, [{ x: 1, width: 2, box: { minX: 1, minY: 1, maxX: 2, maxY: 3 } }, { x: 4, width: 1, box: null }])
  })

  test("falls back to the row edges without guide markers", () => {
    const { rows } = scan(["RRRR", "R#.R", "R##R", "RRRR"])
    assert.equal(rows[0].topline, 1)
    assert.equal(rows[0].baseline, 2)
  })

  test("reports glyph and stretch pixels by coordinate", () => {
    const { isGlyph, isStretch } = scan(SHEET)
    assert.equal(isGlyph(2, 1), true)
    assert.equal(isGlyph(1, 1), false)
    assert.equal(isStretch(0, 3), true)
    assert.equal(isStretch(0, 2), false)
  })

  test("finds every row between horizontal lines", () => {
    const { rows } = scan(["RRRR", "B#.R", "G#.R", "RRRR", "B.#R", "G##R", "RRRR"])
    assert.deepEqual(rows.map(row => [row.top, row.bottom]), [[1, 2], [4, 5]])
    assert.deepEqual(rows[1].cells[0].box, { minX: 1, minY: 4, maxX: 2, maxY: 5 })
  })

  test("skips the empty band between doubled lines", () => {
    const { rows } = scan(["RRR", "RRR", "R#R", "RRR"])
    assert.deepEqual(rows.map(row => row.top), [2])
  })

  test("skips a band with no vertical lines", () => {
    const { rows } = scan(["RRR", "...", "RRR", "R#R", "RRR"])
    assert.deepEqual(rows.map(row => row.top), [3])
  })

  test("names the position and colour of an unknown pixel", () => {
    const { data, width, height } = mask(SHEET)
    data.set([128, 64, 32], (1 * width + 1) * 4)
    assert.throws(() => scanMask(data, width, height), { message: "unexpected colour at 1,1: rgb(128, 64, 32)" })
  })

  test("throws with fewer than two horizontal lines", () => {
    assert.throws(() => scan(["RRR", "R#R"]), { message: "no horizontal grid lines found" })
  })
})

describe("hasMarks", () => {
  test("is false for a missing font or one without stretch rows", () => {
    assert.equal(hasMarks(null), false)
    assert.equal(hasMarks({}), false)
    assert.equal(hasMarks({ glyphs: { a: { stretch: null }, b: {} } }), false)
  })

  test("is true when any glyph has stretch rows", () => {
    assert.equal(hasMarks({ glyphs: { a: { stretch: null }, b: { stretch: [0, 1] } } }), true)
  })
})

describe("parseMask", () => {
  test("measures a glyph against the baseline", () => {
    const { glyphs, capHeight } = parse(SHEET, "ab", 1)
    assert.equal(capHeight, 3)
    assert.equal(glyphs.a.advance, 4)
    assert.equal(glyphs.a.originX, 1)
    assert.equal(glyphs.a.bottom, 0)
    assert.equal(glyphs.a.top, 3)
    assert.equal(glyphs.a.width, 2)
    assert.equal(glyphs.a.height, 3)
  })

  test("stores the mask bottom row first", () => {
    const { glyphs } = parse(SHEET, "ab")
    assert.deepEqual(Array.from(glyphs.a.mask), [0, 1, 1, 1, 0, 1])
  })

  test("gives an empty cell an advance and no shape", () => {
    const { glyphs } = parse(SHEET, "ab", 1)
    assert.equal(glyphs.b.advance, 3)
    assert.equal(glyphs.b.width, 0)
    assert.equal(glyphs.b.height, 0)
    assert.equal(glyphs.b.mask.length, 0)
  })

  test("offsets the origin by the blank space in the cell plus the gap", () => {
    const { glyphs } = parse(["RRRR", "R.#R", "RRRR"], "a", 2)
    assert.equal(glyphs.a.originX, 3)
    assert.equal(glyphs.a.advance, 6)
  })

  test("gives a descender a negative bottom", () => {
    const { glyphs, capHeight } = parse(["RRRR", "B##R", "G##R", "R#.R", "RRRR"], "a")
    assert.equal(capHeight, 2)
    assert.equal(glyphs.a.bottom, -1)
    assert.equal(glyphs.a.top, 2)
    assert.deepEqual(Array.from(glyphs.a.mask), [1, 0, 1, 1, 1, 1])
  })

  test("gives a floating glyph a positive bottom", () => {
    const { glyphs } = parse(["RRR", "B#R", "R.R", "G.R", "RRR"], "a")
    assert.equal(glyphs.a.bottom, 2)
    assert.equal(glyphs.a.top, 3)
    assert.equal(glyphs.a.height, 1)
  })

  test("reads stretch rows from the cell's right line, sorted upwards", () => {
    const { glyphs } = parse(["RRRRR", "B#G#R", "R#R#R", "G#G#G", "RRRRR"], "ab")
    assert.deepEqual(glyphs.a.stretch, [0, 2])
    assert.deepEqual(glyphs.b.stretch, [0])
  })

  test("leaves stretch null on an unmarked glyph", () => {
    assert.equal(parse(SHEET, "ab").glyphs.a.stretch, null)
  })

  test("records row and column across rows", () => {
    const { list } = parse(["RRRRR", "B#R#R", "G#R#R", "RRRRR", "B#R.R", "G#R.R", "RRRRR"], "abc")
    assert.deepEqual(list.map(glyph => [glyph.char, glyph.row, glyph.column]), [["a", 0, 0], ["b", 0, 1], ["c", 1, 0]])
  })

  test("counts an astral character as one cell", () => {
    const { glyphs, list } = parse(SHEET, "\u{1F633}b")
    assert.equal(list.length, 2)
    assert.equal(glyphs["\u{1F633}"].width, 2)
  })

  test("ignores cells past the end of the order", () => {
    assert.deepEqual(parse(SHEET, "a").list.map(glyph => glyph.char), ["a"])
  })

  test("throws when the order is longer than the cells", () => {
    assert.throws(() => parse(SHEET, "abc"), { message: "mask has 2 cells but the order lists 3 characters" })
  })

  test("throws when rows disagree on cap height", () => {
    assert.throws(() => parse(["RRR", "B#R", "G#R", "RRR", "B#R", "R#R", "G#R", "RRR"], "ab"), { message: "rows disagree on cap height: 2, 3" })
  })
})

describe("solidMask", () => {
  test("thresholds alpha above 127 and stores the bottom row first", () => {
    const { data, width } = alphaImage([[255, 0, 0], [0, 128, 127]])
    assert.deepEqual(Array.from(solidMask(data, width, 1, 0, 0, 3, 2)), [0, 1, 0, 1, 0, 0])
  })

  test("reads only the requested region", () => {
    const { data, width } = alphaImage([[255, 0, 0], [0, 128, 127]])
    assert.deepEqual(Array.from(solidMask(data, width, 1, 1, 1, 2, 1)), [1, 0])
  })

  test("counts a unit as solid when any pixel in it is", () => {
    const { data, width } = alphaImage([[0, 200, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 200]])
    assert.deepEqual(Array.from(solidMask(data, width, 2, 0, 0, 2, 2)), [0, 1, 1, 0])
  })

  test("scales the region by the density", () => {
    const { data, width } = alphaImage([[0, 200, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 200]])
    assert.deepEqual(Array.from(solidMask(data, width, 2, 1, 0, 1, 1)), [0])
    assert.deepEqual(Array.from(solidMask(data, width, 2, 1, 1, 1, 1)), [1])
  })
})

describe("sheetLayout", () => {
  const a = { char: "a", width: 3, top: 5, bottom: 0, row: 0, column: 0 }
  const b = { char: "b", width: 2, top: 6, bottom: -2, row: 0, column: 1 }
  const c = { char: "c", width: 1, top: 5, bottom: 0, row: 1, column: 0 }

  test("aligns faces on a shared baseline and shares strips across a row", () => {
    const layout = sheetLayout([a, b], 5, 2)
    assert.deepEqual(layout.get(a), { x: 0, top: 3, up: 0, down: 10 })
    assert.deepEqual(layout.get(b), { x: 5, top: 2, up: 0, down: 10 })
  })

  test("starts the next row after the strips and the gap", () => {
    assert.deepEqual(sheetLayout([a, b, c], 5, 2).get(c), { x: 0, top: 16, up: 14, down: 21 })
  })

  test("reserves the cap height for a row of short glyphs", () => {
    const short = { char: "x", width: 1, top: 2, bottom: 0, row: 0, column: 0 }
    assert.deepEqual(sheetLayout([short], 5, 1).get(short), { x: 0, top: 4, up: 0, down: 6 })
  })

  test("places by column whatever the input order, without reordering it", () => {
    const cells = [b, a]
    const layout = sheetLayout(cells, 5, 2)
    assert.equal(layout.get(a).x, 0)
    assert.equal(layout.get(b).x, 5)
    assert.deepEqual(cells, [b, a])
  })

  test("leaves out empty cells and rows", () => {
    const space = { char: " ", width: 0, top: 0, bottom: 0, row: 0, column: 0 }
    const after = { char: "d", width: 1, top: 5, bottom: 0, row: 1, column: 0 }
    const layout = sheetLayout([space, after], 5, 2)
    assert.equal(layout.has(space), false)
    assert.deepEqual(layout.get(after), { x: 0, top: 2, up: 0, down: 7 })
  })
})

describe("splitCells", () => {
  const base = { id: "base", order: "ab" }
  const alt = { id: "alt", variant: "base", inherits: true, order: "a" }
  const more = { id: "more", variant: "base", inherits: true, order: "bc" }
  const list = [base, alt, more, { id: "own", variant: "base", order: "z" }, { id: "other", variant: "elsewhere", inherits: true, order: "q" }]
  const cells = ["a", "b", "a", "b", "c"].map((char, index) => ({ char, index }))

  test("keeps the base order's cells as the glyphs", () => {
    const { glyphs } = splitCells(base, list, cells)
    assert.equal(glyphs.a, cells[0])
    assert.equal(glyphs.b, cells[1])
    assert.equal(glyphs.c, undefined)
  })

  test("hands each inheriting variant its own run of cells", () => {
    const { alternates } = splitCells(base, list, cells)
    assert.deepEqual(Object.keys(alternates), ["alt", "more"])
    assert.equal(alternates.alt.a, cells[2])
    assert.equal(alternates.more.b, cells[3])
    assert.equal(alternates.more.c, cells[4])
  })

  test("uses the default order when the font has none", () => {
    const characters = Array.from(DEFAULT_ORDER)
    const extra = { char: "a", index: characters.length }
    const entry = { id: "plain" }
    const { glyphs, alternates } = splitCells(entry, [entry, { id: "alt", variant: "plain", inherits: true, order: "a" }], characters.map(char => ({ char })).concat(extra))
    assert.equal(Object.keys(glyphs).length, characters.length)
    assert.equal(alternates.alt.a, extra)
  })

  test("counts an astral character in an order as one cell", () => {
    const entry = { id: "e", order: "\u{1F633}b" }
    const { glyphs, alternates } = splitCells(entry, [entry, { id: "alt", variant: "e", inherits: true, order: "c" }], [{ char: "\u{1F633}" }, { char: "b" }, { char: "c" }])
    assert.equal(glyphs["\u{1F633}"].char, "\u{1F633}")
    assert.equal(glyphs.b.char, "b")
    assert.equal(alternates.alt.c.char, "c")
  })

  test("keeps each alternate's own metrics after parsing", () => {
    const rows = ["RRRRRRRR", "B##R.R.R", "R##R#R.R", "G##R#R#R", "RRRRRRRR"]
    const entry = { id: "base", order: "ab" }
    const all = [entry, { id: "alt", variant: "base", inherits: true, order: "a" }]
    const { list: parsed } = parse(rows, fullOrder(entry, all))
    const { glyphs, alternates } = splitCells(entry, all, parsed)
    assert.equal(glyphs.a.width, 2)
    assert.equal(glyphs.a.top, 3)
    assert.equal(glyphs.b.top, 2)
    assert.equal(alternates.alt.a.width, 1)
    assert.equal(alternates.alt.a.top, 1)
    assert.equal(alternates.alt.a.column, 2)
  })
})

describe("fullOrder", () => {
  test("appends only the variants that inherit from this font", () => {
    const base = { id: "base", order: "ab" }
    assert.equal(fullOrder(base, [base, { id: "x", variant: "base", inherits: true, order: "c" }, { id: "own", variant: "base", order: "d" }, { id: "y", variant: "base", inherits: true, order: "e" }, { id: "z", variant: "other", inherits: true, order: "f" }]), "abce")
  })

  test("starts from the default order", () => {
    const base = { id: "base" }
    assert.equal(fullOrder(base, [base, { id: "x", variant: "base", inherits: true, order: "c" }]), `${DEFAULT_ORDER}c`)
  })
})

describe("flattenFonts", () => {
  test("lists each font before its variants and tags them with the parent", () => {
    const flat = flattenFonts([{ id: "a", height: 1, variants: [{ id: "b", inherits: true }, { id: "c" }] }, { id: "d" }])
    assert.deepEqual(flat, [{ id: "a", height: 1 }, { id: "b", inherits: true, variant: "a" }, { id: "c", variant: "a" }, { id: "d" }])
  })

  test("leaves the input alone", () => {
    const input = [{ id: "a", variants: [{ id: "b" }] }]
    flattenFonts(input)
    assert.deepEqual(input, [{ id: "a", variants: [{ id: "b" }] }])
  })
})

describe("sheetFolder", () => {
  const parent = { id: "parent" }
  const own = { id: "own", variant: "parent" }
  const partial = { id: "partial", variant: "parent", inherits: true }
  const list = [parent, own, partial]

  test("is the font's own folder for a top level font", () => {
    assert.equal(sheetFolder(parent, list), "font/parent")
  })

  test("nests a standalone variant under its parent", () => {
    assert.equal(sheetFolder(own, list), "font/parent/own")
  })

  test("uses the parent's folder for an inheriting variant", () => {
    assert.equal(sheetFolder(partial, list), "font/parent")
  })

  test("falls back to the variant's folder when the parent is missing", () => {
    assert.equal(sheetFolder(partial, [partial]), "font/parent/partial")
  })
})

describe("published fonts", () => {
  const fonts = publishedFonts()
  const sheets = fonts.filter(entry => !entry.inherits)

  test("every sheet parses into one tight glyph per character", () => {
    for (const entry of sheets) {
      const { cells } = readMask(entry, fonts)
      assert.equal(cells.length, Array.from(fullOrder(entry, fonts)).length, entry.id)
      for (const glyph of cells.filter(cell => cell.width)) {
        assert.equal(glyph.mask.length, glyph.width * glyph.height, `${entry.id} ${glyph.char}`)
        assert.equal(glyph.top - glyph.bottom, glyph.height, `${entry.id} ${glyph.char}`)
        assert.ok(glyph.mask.subarray(0, glyph.width).some(Boolean), `${entry.id} ${glyph.char} bottom row`)
        assert.ok(glyph.mask.subarray(glyph.mask.length - glyph.width).some(Boolean), `${entry.id} ${glyph.char} top row`)
      }
    }
  })

  test("each flat sheet matches its layout and masks", () => {
    for (const entry of sheets) {
      const { folder, cells, capHeight } = readMask(entry, fonts)
      const depth = defaultDepth(entry)
      const density = readJson(path.join(folder, "textures.json")).textures.flat?.density ?? 1
      const flat = readPng(path.join(folder, "textures", "flat.png"))
      for (const [glyph, at] of sheetLayout(cells, capHeight, depth)) {
        assert.deepEqual(solidMask(flat.data, flat.width, density, at.x, at.top, glyph.width, glyph.height), glyph.mask, `${entry.id} ${glyph.char}`)
      }
    }
  })

  test("an inheriting variant gets exactly the characters of its order", () => {
    const entry = fonts.find(font => font.id === "minecraft-ten")
    const variant = fonts.find(font => font.id === "minecraft-ten-v2")
    const { cells } = readMask(entry, fonts)
    const { glyphs, alternates } = splitCells(entry, fonts, cells)
    assert.deepEqual(Object.keys(alternates[variant.id]).sort(), Array.from(variant.order).sort())
    assert.notEqual(alternates[variant.id].e, glyphs.e)
    assert.equal(sheetFolder(variant, fonts), "font/minecraft-ten")
  })
})
