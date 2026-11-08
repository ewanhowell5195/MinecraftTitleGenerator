import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import opentype from "opentype.js"
import { publishedFonts, readMask } from "../generator/fonts.js"
import { parseMask, splitCells } from "../src/lib/font.js"
import { DEFAULT_ORDER } from "../src/lib/order.js"
import { CREEPER, REQUIRED_CHARACTERS, SPACE_CHAR, addCharacters, autoStretch, blankGlyph, blockAt, buildSheet, changeGlyph, charactersOf, createFont, exportJson, fillCells, fitGlyph, fontFromFiles, fontFromPublished, glyphOf, isBlank, isOptional, lineCells, lostPixels, paint, parseFontJson, rectangleCells, removeCharacter, resizeFont, rowOfY, setGlyph, setSquareSize, setStretch, sheetOrder, shiftGlyph, slug, squareSizeLoss, squaresOf, stripProblems, trimGlyph, widthOf, yOfRow } from "../src/lib/fontEditor.js"
import { fontFromAscii } from "../src/lib/asciiImport.js"
import { fontFromOutlines, parseFontFile } from "../src/lib/fontImport.js"

function drawn(font, char, cells) {
  return setGlyph(font, char, paint(glyphOf(font, char), cells, true))
}

function strokeCell(font, char, x, y) {
  const glyph = glyphOf(font, char)
  return drawn(font, char, [{ x, row: rowOfY(font, glyph, y) }])
}

function sheetOf(font) {
  const sheet = buildSheet(font)
  return { ...parseMask(sheet.data, sheet.width, sheet.height, sheetOrder(font), 0), sheet }
}

function comparable(cell) {
  return [cell.char, cell.advance, cell.originX, cell.bottom, cell.top, cell.width, cell.height, Array.from(cell.mask), cell.stretch ?? null]
}

describe("characters", () => {
  test("every font gets the forced list in order, with the creeper only on request", () => {
    assert.equal(charactersOf(createFont()).join(""), DEFAULT_ORDER.replace(CREEPER, ""))
    assert.equal(charactersOf({ ...createFont(), creeper: true }).join(""), DEFAULT_ORDER)
  })

  test("added characters go after the forced list and a space goes last", () => {
    const { font, added } = addCharacters(createFont(), "Бб a ")
    assert.deepEqual(added, ["б", " "])
    assert.deepEqual(charactersOf(font).slice(-2), ["б", " "])
  })

  test("removing an optional character drops its drawing and kerning", () => {
    let font = addCharacters({ ...createFont(), kerning: { "бa": 2, av: 1 } }, "б" + CREEPER).font
    font = strokeCell(font, "б", 0, 0)
    font = removeCharacter(removeCharacter(font, "б"), CREEPER)
    assert.ok(!charactersOf(font).includes("б") && !font.creeper && !font.glyphs["б"])
    assert.deepEqual(font.kerning, { av: 1 })
    assert.ok(isOptional(" ") && isOptional(CREEPER) && !isOptional("a"))
  })
})

describe("drawing", () => {
  const font = createFont({ height: 8, width: 8, grid: 2 })

  test("one click paints a whole grid block, lined up from the baseline", () => {
    const glyph = blankGlyph(font)
    const cells = blockAt(font, glyph, 3, rowOfY(font, glyph, 5))
    assert.deepEqual(cells.map(({ x, row }) => [x, yOfRow(font, glyph, row)]).sort(), [[2, 4], [2, 5], [3, 4], [3, 5]])
  })

  test("the grid stays lined up below the baseline", () => {
    const glyph = { ...blankGlyph(font), below: 4, rows: Array(12).fill("0".repeat(8)) }
    const cells = blockAt(font, glyph, 0, rowOfY(font, glyph, -1))
    assert.deepEqual(cells.map(({ row }) => yOfRow(font, glyph, row)).sort((a, b) => a - b), [-2, -2, -1, -1])
  })

  test("lines and rectangles work in blocks", () => {
    const glyph = blankGlyph(font)
    const line = lineCells(font, glyph, { x: 0, row: 7 }, { x: 7, row: 7 })
    assert.equal(line.length, 16)
    const box = rectangleCells(font, glyph, { x: 0, row: 7 }, { x: 3, row: 4 })
    assert.equal(box.length, 16)
  })

  test("fill stays inside a region", () => {
    const glyph = { ...blankGlyph(font), rows: ["11111111", "10000001", "10000001", "11111111", "00000000", "00000000", "00000000", "00000000"] }
    assert.equal(fillCells(glyph, 1, 1).length, 12)
    assert.equal(fillCells(glyph, 0, 7).length, 32)
  })

  test("painting off the edge is ignored", () => {
    const glyph = paint(blankGlyph(font), [{ x: -1, row: 0 }, { x: 99, row: 0 }, { x: 0, row: 99 }], true)
    assert.ok(isBlank(glyph))
  })

  test("stretch marks toggle a grid block of rows", () => {
    const glyph = blankGlyph(font)
    const marked = setStretch(font, glyph, rowOfY(font, glyph, 3), true)
    assert.deepEqual(marked.stretch, [2, 3])
    assert.deepEqual(setStretch(font, marked, rowOfY(font, marked, 2), false).stretch, [])
  })
})

describe("character overrides", () => {
  const font = strokeCell(createFont({ height: 4, width: 4, grid: 1 }), "a", 3, 0)

  test("width grows on the right and crops whichever side is empty", () => {
    assert.equal(widthOf(font, changeGlyph(font, "a", { width: 6 }).glyphs.a), 6)
    assert.equal(changeGlyph(font, "a", { width: 6 }).glyphs.a.rows[3], "000100")
    assert.equal(changeGlyph(font, "a", { width: 2 }).glyphs.a.rows[3], "01")
    const both = strokeCell(font, "a", 0, 0)
    assert.equal(changeGlyph(both, "a", { width: 2 }).glyphs.a.rows[3], "10")
  })

  test("trimming removes empty columns and empty extra rows", () => {
    const roomy = strokeCell(changeGlyph(font, "a", { width: 7, above: 2, below: 2 }), "a", 2, -1)
    const trimmed = trimGlyph(roomy, "a").glyphs.a
    assert.deepEqual([trimmed.width, trimmed.above, trimmed.below], [2, 0, 1])
    assert.deepEqual(trimmed.rows, ["00", "00", "00", "01", "10"])
    assert.equal(trimGlyph(font, "c"), font)
  })

  test("moving a drawing carries its stretch zones and stops at the edge", () => {
    const marked = setGlyph(font, "a", { ...font.glyphs.a, stretch: [0] })
    const moved = shiftGlyph(marked.glyphs.a, -2, 1)
    assert.deepEqual(moved.rows, ["0000", "0000", "0100", "0000"])
    assert.deepEqual(moved.stretch, [1])
    assert.equal(shiftGlyph(marked.glyphs.a, 1, 0), null)
    assert.equal(shiftGlyph(marked.glyphs.a, 0, -1), null)
  })

  test("going back to the default width clears the override", () => {
    const wide = changeGlyph(font, "a", { width: 6 })
    assert.equal(changeGlyph(wide, "a", { width: 4 }).glyphs.a.width, null)
  })

  test("extra rows keep the drawing on the same baseline", () => {
    const next = changeGlyph(font, "a", { above: 2, below: 1 }).glyphs.a
    assert.equal(next.rows.length, 7)
    assert.equal(next.rows[rowOfY(font, next, 0)], "0001")
    assert.equal(changeGlyph(changeGlyph(font, "a", { below: 1 }), "a", { below: 0 }).glyphs.a.rows[3], "0001")
  })

  test("marks outside the removed rows are dropped", () => {
    const tall = changeGlyph(font, "a", { above: 2 })
    const marked = setGlyph(tall, "a", { ...tall.glyphs.a, stretch: [0, 5] })
    assert.deepEqual(changeGlyph(marked, "a", { above: 0 }).glyphs.a.stretch, [0])
  })
})

describe("resizing a font", () => {
  const font = strokeCell(createFont({ height: 4, width: 4, grid: 1 }), "a", 0, 0)

  test("the baseline stays put when the height changes", () => {
    const next = resizeFont(font, { height: 6 })
    assert.equal(next.glyphs.a.rows.length, 6)
    assert.equal(next.glyphs.a.rows[5], "1000")
  })

  test("overridden widths are left alone", () => {
    const wide = changeGlyph(font, "a", { width: 7 })
    assert.equal(resizeFont(wide, { width: 3 }).glyphs.a.rows[0].length, 7)
  })

  test("reports the pixels a change would remove", () => {
    assert.equal(lostPixels(strokeCell(font, "b", 3, 3), { width: 3 }), 0)
    assert.equal(lostPixels(strokeCell(strokeCell(font, "b", 3, 3), "b", 0, 3), { width: 3 }), 1)
    assert.equal(lostPixels(strokeCell(font, "b", 3, 3), { height: 3 }), 1)
    assert.equal(lostPixels(font, { width: 9 }), 0)
  })
})

describe("square size", () => {
  const font = createFont({ height: 4, width: 4, grid: 2 })
  const drawnBlock = drawn(font, "a", blockAt(font, glyphOf(font, "a"), 0, rowOfY(font, glyphOf(font, "a"), 0)))

  test("sizes are shown in squares", () => {
    assert.equal(squaresOf(font, font.height), 2)
    assert.equal(squaresOf({ ...font, grid: 4 }, 34), 8.5)
  })

  test("a bigger square scales the drawing and keeps the size in squares", () => {
    const next = setSquareSize(drawnBlock, 4)
    assert.deepEqual([next.grid, next.height, next.width], [4, 8, 8])
    assert.deepEqual(next.glyphs.a.rows, ["00000000", "00000000", "00000000", "00000000", "11110000", "11110000", "11110000", "11110000"])
    assert.equal(squareSizeLoss(drawnBlock, 4), 0)
  })

  test("spacing and kerning scale with the square size, depth and border don't", () => {
    const spaced = { ...drawnBlock, spaceWidth: 8, characterSpacing: 2, depth: 16, border: 2, terminatorSpaceWidth: 4, kerning: { lt: 12 } }
    const next = setSquareSize(spaced, drawnBlock.grid * 2)
    assert.deepEqual([next.spaceWidth, next.characterSpacing, next.depth, next.border, next.terminatorSpaceWidth, next.kerning.lt], [16, 4, 16, 2, 8, 24])
    assert.equal(setSquareSize({ ...spaced, terminatorSpaceWidth: null }, drawnBlock.grid * 2).terminatorSpaceWidth, null)
  })

  test("a smaller square only loses detail drawn finer than it", () => {
    assert.deepEqual(setSquareSize(drawnBlock, 1).glyphs.a.rows, ["00", "10"])
    assert.equal(squareSizeLoss(drawnBlock, 1), 0)
    assert.equal(squareSizeLoss(strokeCell(drawnBlock, "a", 3, 3), 1), 1)
    assert.equal(squareSizeLoss(strokeCell(drawnBlock, "a", 2, 2), 1), 3)
  })

  test("a copied character fits a font of another size", () => {
    const target = createFont({ height: 6, width: 3, grid: 1 })
    const pasted = fitGlyph(drawnBlock, drawnBlock.glyphs.a, target)
    assert.deepEqual(pasted.rows, ["000", "000", "000", "000", "000", "100"])
    assert.deepEqual(fitGlyph(drawnBlock, drawnBlock.glyphs.a, drawnBlock), drawnBlock.glyphs.a)
  })

  test("extra rows, width overrides, stretch zones and imported shapes scale too", () => {
    const tall = changeGlyph(drawnBlock, "a", { below: 2, width: 6 })
    const marked = setGlyph(tall, "a", { ...tall.glyphs.a, stretch: [-1, 2] })
    const next = setSquareSize({ ...marked, imported: { a: marked.glyphs.a } }, 4)
    assert.deepEqual([next.glyphs.a.below, next.glyphs.a.width, next.glyphs.a.rows.length], [4, 12, 12])
    assert.deepEqual(next.glyphs.a.stretch, [-2, -1, 4, 5])
    assert.deepEqual(next.imported.a, next.glyphs.a)
  })
})

describe("the sheet", () => {
  test("a blank font parses with every character and the right cap height", () => {
    const { list, capHeight } = sheetOf(createFont())
    assert.equal(capHeight, 40)
    assert.equal(list.length, Array.from(DEFAULT_ORDER).length - 1)
  })

  test("uses only the sheet's exact colours", () => {
    const { data } = buildSheet(strokeCell(createFont(), "a", 0, 0))
    const colours = new Set()
    for (let i = 0; i < data.length; i += 4) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
    const allowed = new Set(["0,0,0,255", "0,255,0,255", "0,0,255,255", "255,0,0,255", "255,255,255,255"])
    for (const colour of colours) assert.ok(allowed.has(colour), colour)
  })

  test("wraps long rows and keeps cap height on every row", () => {
    const { sheet, capHeight } = sheetOf(createFont({ height: 10, width: 200, grid: 1 }))
    assert.equal(capHeight, 10)
    assert.ok(sheet.width <= 560)
  })

  test("a drawn character reads back in the right place, with no space either side", () => {
    let font = createFont({ height: 8, width: 6, grid: 1 })
    font = changeGlyph(font, "g", { below: 2 })
    font = strokeCell(font, "g", 2, -2)
    font = strokeCell(font, "g", 3, 7)
    const cell = sheetOf(font).glyphs.g
    assert.equal(cell.bottom, -2)
    assert.equal(cell.top, 8)
    assert.equal(cell.originX, 0)
    assert.equal(cell.advance, 2)
  })

  test("characters that go above the topline keep the same cap height", () => {
    let font = createFont({ height: 8, width: 6, grid: 1 })
    font = changeGlyph(font, "t", { above: 3 })
    font = strokeCell(font, "t", 0, 10)
    const { capHeight, glyphs } = sheetOf(font)
    assert.equal(capHeight, 8)
    assert.equal(glyphs.t.top, 11)
  })

  test("stretch marks read back as marked rows", () => {
    let font = createFont({ height: 8, width: 6, grid: 1 })
    font = strokeCell(font, "a", 0, 0)
    font = setGlyph(font, "a", { ...font.glyphs.a, stretch: [2, 3] })
    assert.deepEqual(sheetOf(font).glyphs.a.stretch, [2, 3])
  })

  test("density multiplies everything", () => {
    let font = createFont({ height: 10, width: 6, grid: 1, density: 4 })
    font = strokeCell(font, "a", 1, 2)
    font = setGlyph(font, "a", { ...font.glyphs.a, stretch: [2] })
    const { capHeight, glyphs } = sheetOf(font)
    assert.equal(capHeight, 40)
    assert.equal(glyphs.a.advance, 4)
    assert.equal(glyphs.a.originX, 0)
    assert.equal(glyphs.a.bottom, 8)
    assert.equal(glyphs.a.top, 12)
    assert.deepEqual(glyphs.a.stretch, [8, 9, 10, 11])
  })

  test("the same drawing at height 40 grid 4 and height 10 density 4 exports the same letters", () => {
    let big = createFont({ height: 40, width: 24, grid: 4 })
    big = drawn(big, "a", blockAt(big, blankGlyph(big), 4, rowOfY(big, blankGlyph(big), 8)))
    let small = createFont({ height: 10, width: 6, grid: 1, density: 4 })
    small = strokeCell(small, "a", 1, 2)
    assert.deepEqual(comparable(sheetOf(big).glyphs.a), comparable(sheetOf(small).glyphs.a))
  })

  test("a space character gets its own cell when defined", () => {
    let font = { ...createFont({ height: 8, width: 6, grid: 1 }), defineSpace: true }
    font = strokeCell(font, SPACE_CHAR, 0, 0)
    assert.equal(sheetOf(font).glyphs[" "].width, 1)
  })
})

describe("saving and reopening", () => {
  function roundTrip(font, parts) {
    const sheet = buildSheet(font)
    const json = JSON.parse(JSON.stringify(exportJson(font, "data:image/png;base64,AAAA")))
    return fontFromFiles({ sheet: parts.includes("sheet") ? sheet : null, json: parts.includes("json") ? json : null })
  }

  let original = { ...createFont({ height: 10, width: 6, grid: 2, density: 4 }), creeper: true, name: "My Own Font", author: "someone", description: "words", depth: 16, border: 3, spaceWidth: 12, characterSpacing: 2, forcedTerminators: true, terminatorSpace: true, autoBorder: true, flat: true, overlay: true, strips: ["minecraft-ten"], kerning: { av: 4 }, basedOn: "minecraft-ten" }
  original = strokeCell(original, "a", 1, 2)
  original = changeGlyph(original, "g", { below: 2, width: 8 })
  original = strokeCell(original, "g", 7, -2)
  original = setGlyph(original, "a", { ...original.glyphs.a, stretch: [2] })

  test("the JSON holds the settings and the texture", () => {
    const entry = exportJson(original, "data:image/png;base64,AAAA")
    assert.equal(entry.id, "my-own-font")
    assert.equal(entry.editor.texture, "data:image/png;base64,AAAA")
    assert.equal(entry.height, undefined)
    assert.equal(entry.order, undefined)
    assert.deepEqual(entry.kerning, { av: 4 })
  })

  test("kerning pairs set to 0 are left out of the JSON", () => {
    assert.deepEqual(exportJson({ ...createFont(), kerning: { av: 4, lt: 0 } }, "t").kerning, { av: 4 })
    assert.equal(exportJson({ ...createFont(), kerning: { lt: 0 } }, "t").kerning, undefined)
  })

  test("defaults are left out of the JSON", () => {
    assert.deepEqual(Object.keys(exportJson({ ...createFont(), creeper: true, terminatorSpace: false }, "t")), ["id", "name", "editor"])
  })

  test("new fonts leave a space beside the terminators, opened fonts without the setting do not", () => {
    assert.equal(createFont().terminatorSpace, true)
    assert.equal(exportJson({ ...createFont(), creeper: true }, "t").terminatorSpace, true)
    assert.equal(fontFromFiles({ json: { id: "t", name: "T" } }).terminatorSpace, false)
  })

  test("a terminator space width is saved only while the space is on and no space is drawn", () => {
    const font = { ...createFont(), creeper: true, terminatorSpaceWidth: 4 }
    assert.equal(exportJson(font, "t").terminatorSpaceWidth, 4)
    assert.equal(exportJson({ ...font, terminatorSpace: false }, "t").terminatorSpaceWidth, undefined)
    assert.equal(exportJson({ ...font, defineSpace: true }, "t").terminatorSpaceWidth, undefined)
    assert.equal(exportJson({ ...font, terminatorSpaceWidth: null }, "t").terminatorSpaceWidth, undefined)
    assert.equal(exportJson({ ...font, terminatorSpaceWidth: font.spaceWidth }, "t").terminatorSpaceWidth, undefined)
    assert.equal(fontFromFiles({ json: { id: "t", name: "T", terminatorSpace: true, terminatorSpaceWidth: 6 } }).terminatorSpaceWidth, 6)
  })

  test("any change to the characters lists the order", () => {
    assert.equal(exportJson({ ...createFont(), creeper: true, defineSpace: true }, "t").order, `${DEFAULT_ORDER} `)
    assert.equal(exportJson(createFont(), "t").order, DEFAULT_ORDER.replace(CREEPER, ""))
  })

  test("added characters and a missing creeper survive saving", () => {
    const font = strokeCell(addCharacters(createFont({ height: 8, width: 4, grid: 1 }), "б").font, "б", 1, 1)
    const restored = roundTrip(font, ["sheet", "json"])
    assert.deepEqual([restored.creeper, restored.extras], [false, ["б"]])
    assert.deepEqual(sheetOf(restored).list.map(comparable), sheetOf(font).list.map(comparable))
    assert.deepEqual([fontFromFiles({ sheet: buildSheet(createFont()) }).creeper, fontFromFiles({ sheet: buildSheet({ ...createFont(), creeper: true }) }).creeper], [false, true])
  })

  test("both files restore everything", () => {
    const restored = roundTrip(original, ["sheet", "json"])
    for (const key of ["name", "author", "description", "height", "width", "grid", "density", "depth", "border", "spaceWidth", "characterSpacing", "forcedTerminators", "terminatorSpace", "autoBorder", "flat", "overlay", "basedOn"]) assert.deepEqual(restored[key], original[key], key)
    assert.deepEqual(restored.strips, original.strips)
    assert.deepEqual(restored.kerning, original.kerning)
    assert.deepEqual(sheetOf(restored).list.map(comparable), sheetOf(original).list.map(comparable))
  })

  test("only the sheet works everything else out", () => {
    let font = createFont({ height: 40, width: 24, grid: 4 })
    font = drawn(font, "a", blockAt(font, blankGlyph(font), 4, rowOfY(font, blankGlyph(font), 8)))
    const restored = roundTrip(font, ["sheet"])
    assert.equal(restored.height, 40)
    assert.equal(restored.width, 24)
    assert.equal(restored.grid, 4)
    assert.equal(restored.density, 1)
    assert.equal(restored.depth, 22)
    assert.deepEqual(sheetOf(restored).list.map(comparable), sheetOf(font).list.map(comparable))
  })

  test("the JSON keeps a default width that most characters override", () => {
    let font = createFont({ height: 8, width: 6, grid: 1 })
    for (const char of REQUIRED_CHARACTERS.slice(0, 60)) {
      font = changeGlyph(font, char, { width: 3 })
      font = strokeCell(strokeCell(font, char, 0, 0), char, 2, 0)
    }
    const both = roundTrip(font, ["sheet", "json"])
    assert.deepEqual([both.width, both.glyphs.a.width, both.glyphs[REQUIRED_CHARACTERS[65]].width], [6, 3, null])
    const sheetOnly = roundTrip(font, ["sheet"])
    assert.deepEqual([sheetOnly.width, sheetOnly.glyphs.a.width, sheetOnly.glyphs[REQUIRED_CHARACTERS[65]].width], [3, null, 6])
    assert.deepEqual(sheetOf(both).list.map(comparable), sheetOf(font).list.map(comparable))
  })

  test("a JSON order turns on the creeper, the space and added characters", () => {
    const restored = fontFromFiles({ json: { order: `${CREEPER}abc ` + "б" } })
    assert.deepEqual([restored.creeper, restored.defineSpace, restored.extras], [true, true, ["б"]])
  })

  test("only the JSON keeps settings with empty characters", () => {
    const restored = roundTrip(original, ["json"])
    assert.equal(restored.name, "My Own Font")
    assert.equal(restored.height, 10)
    assert.equal(restored.density, 4)
    assert.deepEqual(restored.glyphs, {})
  })

  test("a JSON with nothing useful still opens with defaults", () => {
    const restored = fontFromFiles({ json: { id: "bare-font" } })
    assert.equal(restored.name, "Bare Font")
    assert.equal(restored.height, 40)
  })

  test("nothing at all fails loudly", () => {
    assert.throws(() => fontFromFiles({}), /choose/)
  })

  test("bad JSON fails loudly", () => {
    assert.throws(() => parseFontJson("{nope"), /can't be read/)
    assert.throws(() => parseFontJson("[]"), /isn't a font entry/)
  })

  test("a sheet with fewer cells than the list still opens, with the rest blank", () => {
    const font = strokeCell(createFont({ height: 8, width: 6, grid: 1 }), "a", 0, 0)
    const sheet = buildSheet(font)
    const restored = fontFromFiles({ sheet, json: { order: "abc" } })
    assert.deepEqual(Object.keys(restored.glyphs).sort(), ["a", "b", "c"])
    assert.ok(isBlank(glyphOf(restored, "z")))
  })

  test("a sheet that can't divide by its density fails loudly", () => {
    const sheet = buildSheet(createFont({ height: 7, width: 6, grid: 1 }))
    assert.throws(() => fontFromFiles({ sheet, json: { editor: { density: 2 } } }), /density 2/)
  })

  test("a sheet with other colours fails loudly", () => {
    const sheet = buildSheet(createFont({ height: 8, width: 6, grid: 1 }))
    sheet.data[1] = 255
    assert.throws(() => fontFromFiles({ sheet }), /unexpected colour/)
  })
})

describe("starting from a published font", () => {
  const fonts = publishedFonts()

  function copyOf(id) {
    const entry = fonts.find(item => item.id === id)
    const { png, cells } = readMask(entry, fonts)
    const zero = parseMask(png.data, png.width, png.height, cells.map(cell => cell.char).join(""), 0)
    const { glyphs } = splitCells(entry, fonts, zero.list)
    return { entry, glyphs, capHeight: zero.capHeight, font: fontFromPublished({ ...entry, name: entry.name ?? entry.id }, Object.values(glyphs), zero.capHeight) }
  }

  for (const entry of fonts.filter(item => !item.inherits)) {
    test(`${entry.id} comes through with its forced characters unchanged`, () => {
      const { glyphs, capHeight, font } = copyOf(entry.id)
      assert.equal(font.height, capHeight)
      const after = sheetOf(font)
      for (const char of Array.from(DEFAULT_ORDER)) {
        const before = glyphs[char]
        const cell = after.glyphs[char]
        if (!before) {
          assert.ok(!cell?.width, `${entry.id} ${char} should start blank`)
          continue
        }
        assert.deepEqual(comparable(cell), comparable({ ...before, stretch: before.stretch ?? null }), `${entry.id} ${char}`)
      }
      assert.ok(font.basedOn === entry.id)
    })
  }

  test("finds Ten's 4 pixel grid", () => {
    assert.equal(copyOf("minecraft-ten").font.grid, 4)
  })

  test("the depth, border, flat setting and strips come across, the author and description do not", () => {
    const { font } = copyOf("minecraft-ten-outline")
    assert.deepEqual([font.name, font.depth, font.border, font.flat, font.author, font.description, font.overlay], ["minecraft-ten-outline Copy", 0, 0, true, "", "", false])
    assert.deepEqual(copyOf("minecraft-ten").font.strips, ["minecraft-ten"])
  })
})

describe("importing a font file", () => {
  function square(unitsPerEm, char, size) {
    const path = new opentype.Path()
    path.moveTo(0, 0)
    path.lineTo(size, 0)
    path.lineTo(size, size)
    path.lineTo(0, size)
    path.close()
    return new opentype.Glyph({ name: char, unicode: char.codePointAt(0), advanceWidth: size + 100, path })
  }

  function testFont(chars = "ABH") {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const built = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(Array.from(chars).map(char => square(1000, char, 700))) })
    return parseFontFile(built.toArrayBuffer())
  }

  test("letters become pixels at the chosen height, with no creeper", () => {
    const font = fontFromOutlines(testFont(), { height: 21 })
    assert.equal(font.height, 21)
    assert.equal(glyphOf(font, "a").rows.length, 21)
    assert.ok(!isBlank(glyphOf(font, "a")))
    assert.ok(!font.creeper && !font.glyphs[CREEPER])
  })

  test("characters the file doesn't have start blank and are listed", () => {
    const font = fontFromOutlines(testFont(), { height: 21 })
    assert.ok(isBlank(glyphOf(font, "z")))
    assert.ok(font.missing.includes("z"))
    assert.ok(!font.missing.includes("a"))
  })

  test("keeps the imported shapes to go back to, including space", () => {
    const font = fontFromOutlines(testFont(), { height: 21 })
    assert.deepEqual(font.imported.a.rows, font.glyphs.a.rows)
    assert.ok(font.imported[SPACE_CHAR])
    assert.equal(font.glyphs[SPACE_CHAR], undefined)
  })

  test("a file with none of the characters still opens, blank at half the height wide", () => {
    const font = fontFromOutlines(testFont(""), { height: 21 })
    assert.equal(font.width, 11)
    assert.deepEqual(font.missing, REQUIRED_CHARACTERS)
    assert.ok(REQUIRED_CHARACTERS.every(char => isBlank(glyphOf(font, char))))
  })

  test("the result builds a sheet the real parser reads", () => {
    const font = fontFromOutlines(testFont(), { height: 21 })
    assert.equal(sheetOf(font).capHeight, 21)
  })

  test("a real font file lands on its pixel grid with stretch marks", { skip: !fs.existsSync("C:/Users/ewanh/Downloads/MINECRAFTTEN.TTF") }, () => {
    const data = fs.readFileSync("C:/Users/ewanh/Downloads/MINECRAFTTEN.TTF")
    const font = fontFromOutlines(parseFontFile(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)), { height: 40 })
    assert.equal(font.height, 40)
    assert.equal(font.grid, 4)
    assert.ok(!isBlank(glyphOf(font, "m")))
    assert.ok(glyphOf(font, "m").stretch.length > 0)
  })

  test("collections are refused with a clear message", () => {
    const buffer = new TextEncoder().encode("ttcf0000").buffer
    assert.throws(() => parseFontFile(buffer), /collections/)
  })
})

describe("automatic stretch zones", () => {
  test("the gap left at the top of a zone is one square, even with thick strokes", () => {
    let font = createFont({ height: 40, width: 8, grid: 4 })
    font = drawn(font, "l", Array.from({ length: 40 * 8 }, (_, index) => ({ x: index % 8, row: Math.floor(index / 8) })))
    assert.equal(Math.max(...autoStretch(font, ["l"]).glyphs.l.stretch), 35)
  })

  test("marks a plain tall stroke", () => {
    let font = createFont({ height: 8, width: 4, grid: 1 })
    font = drawn(font, "i", Array.from({ length: 8 }, (_, row) => ({ x: 1, row })).concat(Array.from({ length: 8 }, (_, row) => ({ x: 2, row }))))
    assert.ok(autoStretch(font, ["i"]).glyphs.i.stretch.length > 0)
  })

  test("only touches the characters asked for", () => {
    let font = createFont({ height: 8, width: 4, grid: 1 })
    font = drawn(font, "i", Array.from({ length: 8 }, (_, row) => ({ x: 1, row })))
    font = drawn(font, "l", Array.from({ length: 8 }, (_, row) => ({ x: 1, row })))
    const marked = autoStretch(font, ["i"])
    assert.deepEqual(marked.glyphs.l.stretch, [])
  })

  test("marks stay in font rows at higher densities", () => {
    let font = createFont({ height: 8, width: 4, grid: 1, density: 2 })
    font = drawn(font, "i", Array.from({ length: 8 }, (_, row) => ({ x: 1, row })))
    for (const y of autoStretch(font, ["i"]).glyphs.i.stretch) assert.ok(y >= 0 && y < 8)
  })
})

describe("helpers", () => {
  test("slug", () => {
    assert.equal(slug("My Cool Font!"), "my-cool-font")
  })

  test("strip problems", () => {
    const set = { depth: 22, baseline: 30 }
    assert.deepEqual(stripProblems({ top: 40, bottom: -8 }, 22, set, 92), [])
    assert.deepEqual(stripProblems({ top: 40, bottom: 0 }, 16, set, 46), [])
    assert.equal(stripProblems({ top: 44, bottom: 0 }, 22, set, 92).length, 1)
    assert.equal(stripProblems({ top: 40, bottom: -12 }, 22, set, 92).length, 1)
    assert.equal(stripProblems({ top: 40, bottom: 0 }, 30, set, 92).length, 1)
  })

  test("strips with a height fit any font that stays inside them", () => {
    const set = { depth: 22, baseline: 30, height: 40 }
    for (const offset of [0, 4, 8]) assert.deepEqual(stripProblems({ top: 32, bottom: 0 }, 22, set, 92, offset), [])
    assert.equal(stripProblems({ top: 32, bottom: 0 }, 22, set, 92, 9).length, 1)
    assert.equal(stripProblems({ top: 44, bottom: 0 }, 22, set, 92).length, 1)
  })

  test("an offset lets a shorter font fit the strips", () => {
    const set = { depth: 22, baseline: 30 }
    assert.equal(stripProblems({ top: 32, bottom: 0 }, 22, set, 92).length, 1)
    assert.deepEqual(stripProblems({ top: 32, bottom: 0 }, 22, set, 92, 8), [])
    assert.deepEqual(stripProblems({ top: 32, bottom: -16 }, 22, set, 92, 8), [])
  })
})

describe("ascii.png import", () => {
  function sheet(cell, glyphs) {
    const size = cell * 16
    const data = new Uint8ClampedArray(size * size * 4)
    for (const [index, rows] of Object.entries(glyphs)) {
      rows.forEach((row, y) => Array.from(row).forEach((char, x) => {
        if (char === "#") data[((Math.floor(index / 16) * cell + y) * size + index % 16 * cell + x) * 4 + 3] = 255
      }))
    }
    return { data, width: size, height: size }
  }

  const image = sheet(8, {
    65: ["##", "##", "##", "##", "##", "##", "##"],
    97: ["", "", "#", "#", "#", "#", "#"],
    103: ["", "", "###", "#.#", "#.#", "###", "..#", "###"]
  })

  test("capitals fill the cap height, each texture pixel becomes one square", () => {
    const font = fontFromAscii(image, { height: 40 })
    assert.equal(font.grid, 6)
    assert.equal(font.height, 42)
    assert.equal(font.width, 12)
    assert.equal(font.glyphs.a.width, null)
    assert.equal(font.glyphs.a.rows[0].length, 12)
    assert.equal(font.glyphs.a.rows.length, 42)
    assert.ok(font.missing.includes("b"))
  })

  test("lowercase letters can be used instead, and descenders go below the baseline", () => {
    const font = fontFromAscii(image, { height: 7, lowercase: true })
    assert.equal(font.glyphs.a.width, 1)
    assert.equal(font.glyphs.g.below, 1)
    assert.equal(font.glyphs.g.rows.length, 8)
  })

  test("the pound sign and both quotes come from their own cells", () => {
    const font = fontFromAscii(sheet(8, { 39: ["", "#", "#"], 156: ["", "####", "#..#", "####"] }), { height: 7 })
    assert.equal(font.glyphs["£"].width, 4)
    assert.deepEqual(font.glyphs["\u{1F629}"], font.glyphs["'"])
    assert.ok(!isBlank(font.glyphs["'"]))
  })

  test("a texture that isn't a 16 by 16 grid is refused", () => {
    assert.throws(() => fontFromAscii({ data: new Uint8ClampedArray(100 * 100 * 4), width: 100, height: 100 }), /16 by 16/)
    assert.throws(() => fontFromAscii({ data: new Uint8ClampedArray(160 * 160 * 4), width: 160, height: 160 }), /multiple of 8/)
  })
})
