import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseMask } from "../../src/lib/font/font.js"
import { CREEPER, DEFAULT_ORDER, OPENING_QUOTE } from "../../src/lib/font/order.js"
import { MULTICASE_CHARACTERS, REQUIRED_CHARACTERS, SPACE_CHAR, addCharacters, canDelete, chooseCharacters, setRequireCharacters, characterLabel, charactersOf, sameCharacter, setLetterCase, isOptional, removeCharacter } from "../../src/lib/font/editor/characters.js"
import { createFont } from "../../src/lib/font/editor/defaults.js"
import { depthCode, depthOf, fontLayers } from "../../src/lib/font/editor/depths.js"
import { exportJson, savedJson, slug } from "../../src/lib/font/editor/export.js"
import { blankGlyph, glyphOf, isBlank, rowOfY, setGlyph, widthOf, yOfRow } from "../../src/lib/font/editor/glyph.js"
import { changeGlyph, moveGlyph, reshapeGlyph, trimGlyph } from "../../src/lib/font/editor/glyphEditing.js"
import { fontFromFiles, parseFontJson } from "../../src/lib/font/editor/import.js"
import { blockAt, fillCells, lineCells, mirroredCells, paint, rectangleCells, setStretch, setStretchRange } from "../../src/lib/font/editor/painting.js"
import { autoStretch, buildSheet, savedCharacters, savedSheet, sheetOrder } from "../../src/lib/font/editor/sheet.js"
import { fitGlyph, lostPixels, resizeFont, setSquareSize, squareSizeLoss, squaresOf } from "../../src/lib/font/editor/sizes.js"
import { jsonText } from "../../src/lib/core/jsonText.js"
import { comparable, drawn, sheetOf } from "../helpers/fontEditor.js"

function strokeCell(font, char, x, y) {
  const glyph = glyphOf(font, char)
  return drawn(font, char, [{ x, row: rowOfY(font, glyph, y) }])
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

  test("typed text is combined before it is split", () => {
    const { added, refused } = addCharacters(createFont(), String.fromCodePoint(0x65, 0x301))
    assert.deepEqual([added, refused], [[String.fromCodePoint(0xe9)], []])
  })

  test("combining marks and invisible characters are refused and named", () => {
    const heart = addCharacters(createFont(), String.fromCodePoint(0x2764, 0xfe0f))
    assert.deepEqual([heart.added, heart.refused], [[String.fromCodePoint(0x2764)], [String.fromCodePoint(0xfe0f)]])
    const joined = addCharacters(createFont(), String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d))
    assert.deepEqual([joined.added, joined.refused], [[String.fromCodePoint(0x1f468), String.fromCodePoint(0x1f469)], [String.fromCodePoint(0x200d)]])
    const lone = addCharacters(createFont(), String.fromCodePoint(0x301))
    assert.deepEqual([lone.added, lone.refused, lone.font.extras], [[], [String.fromCodePoint(0x301)], []])
  })

  test("removing an optional character drops its drawing and kerning", () => {
    let font = addCharacters({ ...createFont(), kerning: { "бa": 2, av: 1 } }, "б" + CREEPER).font
    font = strokeCell(font, "б", 0, 0)
    font = removeCharacter(removeCharacter(font, "б"), CREEPER)
    assert.ok(!charactersOf(font).includes("б") && !font.creeper && !font.glyphs["б"])
    assert.deepEqual(font.kerning, { av: 1 })
    assert.ok(isOptional(" ") && isOptional(CREEPER) && !isOptional("a"))
  })

  test("default characters can only be deleted once they're no longer required", () => {
    const font = setLetterCase(createFont(), "both")
    assert.ok(!canDelete(font, "a"))
    const loose = setRequireCharacters(font, false)
    assert.ok(canDelete(loose, "A"))
    const removed = removeCharacter(strokeCell(loose, "a", 0, 0), "a")
    assert.ok(!charactersOf(removed).includes("a") && !charactersOf(removed).includes("A") && !removed.glyphs.a)
    assert.deepEqual(removed.omitted, ["a"])
    const back = addCharacters(removed, "A")
    assert.deepEqual([back.added, back.font.omitted, back.font.extras], [["A", "a"], [], []])
    const required = setRequireCharacters(removed, true)
    assert.ok(charactersOf(required).includes("a") && !required.omitted.length)
  })

  test("a custom character set leaves out the defaults it doesn't list", () => {
    const { font, added } = chooseCharacters(createFont(), "abc\nбб 0")
    assert.deepEqual(charactersOf(font), ["a", "b", "c", "0", "┫", "┣", "б"])
    assert.deepEqual([added, font.requireCharacters], [["б"], false])
    assert.ok(!canDelete(font, "┫") && !canDelete(font, "┣") && canDelete(font, "a"))
    const both = chooseCharacters(setLetterCase(createFont(), "both"), "Ab")
    assert.deepEqual(charactersOf(both.font), ["A", "a", "B", "b", "┫", "┣"])
    const quotes = charactersOf(chooseCharacters(createFont(), "a'").font)
    assert.ok(quotes.includes("'") && quotes.includes(OPENING_QUOTE))
    assert.ok(!charactersOf(chooseCharacters(createFont(), "a").font).includes(OPENING_QUOTE))
    const all = chooseCharacters(createFont(), REQUIRED_CHARACTERS.join("") + "é")
    assert.deepEqual([all.added, all.font.requireCharacters, all.font.omitted], [["é"], true, []])
  })
})

describe("depth", () => {
  function drawn() {
    let font = createFont({ height: 2, width: 3, grid: 1 })
    const half = depthCode(font, 0.5)
    font = half.font
    const glyph = paint(paint(blankGlyph(font), [{ x: 0, row: 1 }, { x: 2, row: 1 }], true), [{ x: 1, row: 1 }], half.code)
    return { font: setGlyph(font, "a", glyph), code: half.code }
  }

  test("a shallower pixel gets its own code, and the same depth reuses it", () => {
    const { font, code } = drawn()
    assert.notEqual(code, "1")
    assert.equal(depthCode(font, 0.5).code, code)
    assert.equal(depthCode(font, 0.5).font, font)
    assert.equal(depthOf(font, code), 0.5)
  })

  test("moving and trimming a character keeps each pixel's depth", () => {
    const { font, code } = drawn()
    const moved = moveGlyph(font, glyphOf(font, "a"), 0, 1)
    assert.equal(moved.glyph.rows[0], `1${code}1`)
  })

  test("the sheet stores depth as grey, and opening it brings the depths back", () => {
    const { font, code } = drawn()
    const { glyphs } = parseMask(buildSheet(font).data, buildSheet(font).width, buildSheet(font).height, sheetOrder(font), 0)
    assert.deepEqual(Array.from(glyphs.a.depths), [0, 1, 0])
    const reopened = fontFromFiles({ sheet: savedSheet(font) })
    const char = Object.keys(reopened.glyphs).find(key => !isBlank(reopened.glyphs[key]))
    assert.equal(reopened.glyphs[char].rows.find(row => row !== "000"), `1${code}1`)
    assert.deepEqual(reopened.depths, [0.5])
  })

  test("independent layer depth is only saved for a font with layers", () => {
    const { font } = drawn()
    assert.equal(exportJson({ ...font, layerDepth: "independent" }, "").layerDepth, "independent")
    assert.equal(exportJson(font, "").layerDepth, undefined)
    assert.equal(exportJson({ ...createFont(), layerDepth: "independent" }, "").layerDepth, undefined)
    assert.equal(fontFromFiles({ json: exportJson({ ...font, layerDepth: "independent" }, "") }).layerDepth, "independent")
  })

  test("a font drawn only at full depth has no layers", () => {
    const font = setGlyph(createFont({ height: 2, width: 3, grid: 1 }), "a", paint(blankGlyph(createFont({ height: 2, width: 3, grid: 1 })), [{ x: 0, row: 0 }], true))
    assert.equal(fontLayers(font), null)
  })
})

describe("letter case", () => {
  const both = { ...createFont(), letterCase: "both" }

  test("a font with both cases lists each capital just before its lowercase letter", () => {
    assert.equal(charactersOf(both).join(""), Array.from("abcdefghijklmnopqrstuvwxyz", char => char.toUpperCase() + char).join("") + DEFAULT_ORDER.replace(CREEPER, "").slice(26))
    assert.deepEqual(MULTICASE_CHARACTERS, charactersOf(both))
  })

  test("added letters get both cases, and typing either case finds the same character", () => {
    const { font, added } = addCharacters(both, "Éb3")
    assert.deepEqual([added, font.extras], [["É", "é"], ["é"]])
    assert.deepEqual(addCharacters(font, "é").added, [])
    assert.deepEqual(addCharacters(createFont(), "É").added, ["é"])
    assert.ok(!isOptional("B") && isOptional("É"))
  })

  test("removing a letter removes both cases and their kerning", () => {
    let font = addCharacters({ ...both, kerning: { "Éa": 2, "éb": 1, ab: 3 } }, "é").font
    font = strokeCell(strokeCell(font, "É", 0, 0), "é", 0, 0)
    font = removeCharacter(font, "é")
    assert.ok(!font.glyphs["É"] && !font.glyphs["é"] && !font.extras.length)
    assert.deepEqual(font.kerning, { ab: 3 })
  })

  test("one case hides the other, and switching back brings it back", () => {
    let font = strokeCell(strokeCell({ ...both, kerning: { AV: 2, av: 1 } }, "A", 0, 0), "a", 1, 0)
    const upper = setLetterCase(font, "upper")
    assert.equal(charactersOf(upper).join(""), DEFAULT_ORDER.replace(CREEPER, ""))
    assert.deepEqual(upper.glyphs.a, font.glyphs.A)
    assert.deepEqual(upper.kerning, { av: 2 })
    const lower = setLetterCase(upper, "lower")
    assert.deepEqual([lower.glyphs.a, lower.kerning], [font.glyphs.a, { av: 1 }])
    const again = setLetterCase(lower, "both")
    assert.deepEqual([again.glyphs.A, again.glyphs.a, again.kerning], [font.glyphs.A, font.glyphs.a, { AV: 2, av: 1 }])
    assert.equal(characterLabel("a", "upper"), "A")
    assert.deepEqual([sameCharacter("a", "upper", "both"), sameCharacter("A", "both", "upper"), sameCharacter("a", "both", "upper"), sameCharacter("A", "both", "lower")], ["A", "a", "a", "a"])
  })

  test("hidden letters are resized with the rest", () => {
    const font = setLetterCase(strokeCell(both, "a", 0, 0), "upper")
    const back = setLetterCase(setSquareSize(resizeFont(font, { height: 44 }), 2), "both")
    assert.equal(back.glyphs.a.rows.length, 22)
    assert.ok(!isBlank(back.glyphs.a))
  })

  test("saving marks a font with both cases, and reopening it keeps them", () => {
    const font = strokeCell(strokeCell(both, "A", 0, 0), "a", 1, 0)
    const json = exportJson(font, "")
    assert.equal(json.multicase, true)
    assert.ok(json.order.startsWith("AaBb"))
    const sheet = buildSheet(font)
    const opened = fontFromFiles({ sheet, json })
    assert.equal(opened.letterCase, "both")
    assert.deepEqual([opened.glyphs.A.rows, opened.glyphs.a.rows], [font.glyphs.A.rows, font.glyphs.a.rows])
    assert.deepEqual(opened.extras, [])
  })

  test("a lowercase font says so in its JSON, and older fonts open as capitals", () => {
    const lower = setLetterCase(both, "lower")
    assert.equal(exportJson(lower, "").editor.letterCase, "lower")
    assert.equal(fontFromFiles({ json: exportJson(lower, "") }).letterCase, "lower")
    assert.equal(fontFromFiles({ json: { name: "Old" } }).letterCase, "upper")
    assert.equal(exportJson(createFont(), "").multicase, undefined)
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

  test("a run of stretch marks covers every block between its ends, either way round", () => {
    const glyph = blankGlyph(font)
    const marked = setStretchRange(font, glyph, rowOfY(font, glyph, 1), rowOfY(font, glyph, 6), true)
    assert.deepEqual(marked.stretch, [0, 1, 2, 3, 4, 5, 6, 7])
    assert.deepEqual(setStretchRange(font, marked, rowOfY(font, marked, 5), rowOfY(font, marked, 2), false).stretch, [0, 1, 6, 7])
  })

  test("mirroring paints the matching cells on the other side", () => {
    const glyph = blankGlyph(font)
    const painted = paint(glyph, mirroredCells(glyph, rectangleCells(font, glyph, { x: 0, row: 0 }, { x: 1, row: 1 })), true)
    assert.deepEqual(painted.rows.slice(0, 2), ["11000011", "11000011"])
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

  test("moving a drawing carries its stretch zones", () => {
    const marked = setGlyph(font, "a", { ...font.glyphs.a, stretch: [0] })
    const moved = moveGlyph(marked, marked.glyphs.a, -2, 1)
    assert.deepEqual(moved.glyph.rows, ["0000", "0000", "0100", "0000"])
    assert.deepEqual(moved.glyph.stretch, [1])
    assert.deepEqual(moved.outside, { cells: [], stretch: [] })
  })

  test("moving off the edge and back keeps what went outside", () => {
    const marked = setGlyph(font, "a", { ...font.glyphs.a, stretch: [0] })
    const out = moveGlyph(marked, marked.glyphs.a, 1, -1)
    assert.ok(isBlank(out.glyph))
    assert.deepEqual(out.glyph.stretch, [])
    const back = moveGlyph(marked, out.glyph, -1, 1, out.outside)
    assert.deepEqual(back.glyph.rows, marked.glyphs.a.rows)
    assert.deepEqual(back.glyph.stretch, [0])
  })

  test("narrowing and widening again keeps what was cropped", () => {
    const both = strokeCell(font, "a", 0, 0)
    const narrow = reshapeGlyph(both, "a", { width: 2 })
    assert.equal(narrow.font.glyphs.a.rows[3], "10")
    const wide = reshapeGlyph(narrow.font, "a", { width: 4 }, narrow.outside)
    assert.equal(wide.font.glyphs.a.rows[3], "1001")
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
    const json = parseFontJson(jsonText(exportJson(font, "data:image/png;base64,AAAA")))
    return fontFromFiles({ sheet: parts.includes("sheet") ? sheet : null, json: parts.includes("json") ? json : null })
  }

  let original = { ...createFont({ height: 10, width: 6, grid: 2, density: 4 }), creeper: true, name: "My Own Font", authors: ["someone", "Friend"], description: "words", depth: 16, border: 3, spaceWidth: 12, characterSpacing: 2, forcedTerminators: true, terminatorSpace: true, autoBorder: true, flat: true, overlay: true, strips: ["minecraft-ten"], kerning: { av: 4 }, basedOn: "minecraft-ten" }
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
    assert.deepEqual(entry.kerning, { 4: ["av"] })
  })

  test("deleted default characters stay deleted when the font is reopened", () => {
    const font = removeCharacter(removeCharacter(setRequireCharacters(original, false), "b"), "'")
    const entry = exportJson(font, "t")
    assert.deepEqual([entry.editor.requireCharacters, entry.editor.omitted], [false, "b'"])
    const reopened = roundTrip(font, ["sheet", "json"])
    assert.deepEqual([reopened.requireCharacters, reopened.omitted], [false, ["b", "'"]])
    assert.ok(!charactersOf(reopened).includes("b") && charactersOf(reopened).includes("a"))
    assert.equal(exportJson(original, "t").editor.requireCharacters, undefined)
  })

  test("kerning pairs set to 0 are left out of the JSON", () => {
    assert.deepEqual(exportJson({ ...createFont(), kerning: { av: 4, lt: 0 } }, "t").kerning, { 4: ["av"] })
    assert.equal(exportJson({ ...createFont(), kerning: { lt: 0 } }, "t").kerning, undefined)
  })

  test("kerning is saved grouped by amount, one line per amount", () => {
    const entry = exportJson({ ...createFont(), kerning: { lt: 8, av: 4, ly: 8, "a-": -2 } }, "t")
    assert.deepEqual(entry.kerning, { 4: ["av"], 8: ["lt", "ly"], "-2": ["a-"] })
    assert.ok(jsonText(entry).includes(`"8": ["lt", "ly"]`))
    assert.deepEqual(parseFontJson(jsonText(entry)).kerning, { lt: 8, av: 4, ly: 8, "a-": -2 })
  })

  test("kerning that isn't grouped by amount is refused", () => {
    assert.throws(() => parseFontJson(JSON.stringify({ id: "t", kerning: { lt: 8 } })), /grouped by amount/)
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

  test("any change to the characters lists the order, except a drawn space after the default ones", () => {
    assert.equal(exportJson({ ...createFont(), creeper: true, defineSpace: true }, "t").order, undefined)
    assert.equal(exportJson(createFont(), "t").order, DEFAULT_ORDER.replace(CREEPER, ""))
  })

  test("a saved font leaves out the characters with nothing drawn, and reopening it brings the required ones back blank", () => {
    let font = addCharacters(createFont({ height: 8, width: 4, grid: 1 }), "бж").font
    font = strokeCell(strokeCell(strokeCell(font, "a", 1, 1), "7", 2, 3), "б", 1, 1)
    font = changeGlyph(font, "q", { width: 9 })
    const sheet = savedSheet(font)
    const entry = savedJson(font, () => "t")
    assert.deepEqual(savedCharacters(font), ["a", "7", "б"])
    assert.equal(entry.order, "a7б")
    assert.equal(entry.editor.canvas?.q, undefined)
    assert.deepEqual(parseMask(sheet.data, sheet.width, sheet.height, entry.order, 0).list.map(cell => cell.char), ["a", "7", "б"])
    const restored = fontFromFiles({ sheet, json: parseFontJson(jsonText(entry)) })
    assert.deepEqual(charactersOf(restored), REQUIRED_CHARACTERS.concat("б"))
    assert.deepEqual(charactersOf(restored).filter(char => !isBlank(glyphOf(restored, char))), ["a", "7", "б"])
    assert.deepEqual(sheetOf(restored).list.filter(cell => cell.width).map(comparable), sheetOf(font).list.filter(cell => cell.width).map(comparable))
  })

  test("a font with nothing drawn is saved whole", () => {
    assert.deepEqual(savedCharacters(createFont()), REQUIRED_CHARACTERS)
    assert.equal(savedJson(createFont(), () => "t").order, REQUIRED_CHARACTERS.join(""))
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
    for (const key of ["name", "authors", "description", "height", "width", "grid", "density", "depth", "border", "spaceWidth", "characterSpacing", "forcedTerminators", "terminatorSpace", "autoBorder", "flat", "overlay", "basedOn"]) assert.deepEqual(restored[key], original[key], key)
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

  test("canvases with room around the drawing come back as they were", () => {
    for (const density of [1, 3]) {
      let font = createFont({ height: 10, width: 24, grid: 2, density })
      font = drawn(font, "i", [8, 9, 10, 11].map(x => ({ x, row: 5 })))
      font = strokeCell(changeGlyph(font, "g", { width: 30, above: 3, below: 4 }), "g", 12, -2)
      font = changeGlyph(font, "b", { above: 2, below: 1 })
      font = strokeCell(changeGlyph(font, "l", { above: 2 }), "l", 0, 4)
      font = setGlyph(font, "l", { ...font.glyphs.l, stretch: [4, 11] })
      font = strokeCell(changeGlyph(font, "t", { width: 1 }), "t", 0, 0)
      const restored = roundTrip(font, ["sheet", "json"])
      for (const char of Object.keys(font.glyphs)) assert.deepEqual(restored.glyphs[char], font.glyphs[char], `${char} at density ${density}`)
      assert.equal(restored.glyphs.i.rows[5], "000000001111000000000000")
      assert.deepEqual(Object.keys(exportJson(font, "t").editor.canvas), ["b", "g", "i", "l"])
      assert.deepEqual(sheetOf(restored).list.map(comparable), sheetOf(font).list.map(comparable))
    }
  })

  test("characters that fill their canvas save no canvas", () => {
    const font = strokeCell(strokeCell(createFont({ height: 8, width: 2, grid: 1 }), "a", 0, 0), "a", 1, 7)
    assert.equal(exportJson(font, "t").editor.canvas, undefined)
  })

  test("a saved canvas that can't hold its character fails loudly", () => {
    const font = drawn(createFont({ height: 8, width: 6, grid: 1 }), "a", [{ x: 1, row: 3 }, { x: 4, row: 3 }])
    const json = parseFontJson(jsonText(exportJson(font, "t")))
    assert.throws(() => fontFromFiles({ sheet: buildSheet(font), json: { ...json, editor: { ...json.editor, canvas: { a: { width: 3, left: 0, above: 0, below: 0 } } } } }), /canvas for a doesn't fit/)
    assert.throws(() => fontFromFiles({ sheet: buildSheet(font), json: { ...json, editor: { ...json.editor, canvas: { a: { width: null, left: 1.5, above: 0, below: 0 } } } } }), /canvas for a doesn't fit/)
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
})
