import assert from "node:assert/strict"
import { describe, test } from "node:test"
import opentype from "opentype.js"
import { compress } from "woff2-encoder"
import { publishedFonts, readMask } from "../../generator/fonts.js"
import { parseMask } from "../../src/lib/font/sheetParse.js"
import { splitCells } from "../../src/lib/font/catalog.js"
import { CREEPER } from "../../src/lib/font/order.js"
import { REQUIRED_CHARACTERS, SPACE_CHAR, addCharacters } from "../../src/lib/font/editor/characters.js"
import { exportJson } from "../../src/lib/font/editor/export.js"
import { glyphOf, isBlank } from "../../src/lib/font/editor/glyph.js"
import { fontFromFiles, fontFromPublished, parseFontJson } from "../../src/lib/font/editor/import.js"
import { resizeFont, squaresOf } from "../../src/lib/font/editor/sizes.js"
import { asciiRows, fontFromAscii } from "../../src/lib/font/asciiImport.js"
import { fontFromOutlines, parseFontFile, suggestedSize } from "../../src/lib/font/fontImport.js"
import { templateGlyphs, withTemplateGlyphs } from "../../src/fontEditor/template.js"
import { gridShift, lineUnits, rasterise } from "../../src/lib/font/fontOutline.js"
import { drawn, sheetOf } from "../helpers/fontEditor.js"

describe("starting from a published font", () => {
  const fonts = publishedFonts()

  const copies = new Map()

  function copyOf(id) {
    if (copies.has(id)) return copies.get(id)
    const entry = fonts.find(item => item.id === id)
    const { png, cells } = readMask(entry, fonts)
    const zero = parseMask(png.data, png.width, png.height, cells.map(cell => cell.char).join(""), 0)
    const { glyphs } = splitCells(entry, fonts, zero.list)
    copies.set(id, { entry, glyphs, capHeight: zero.capHeight, font: fontFromPublished({ ...entry, name: entry.name ?? entry.id }, Object.values(glyphs), zero.capHeight) })
    return copies.get(id)
  }

  test("a font that kept its editor settings opens with them", () => {
    const { font } = copyOf("minecraft-wiki")
    assert.deepEqual([font.grid, font.width, squaresOf(font, font.height), font.density], [2, 40, 26, 1])
  })

  test("the editor's density divides the published sheet back down", () => {
    const { entry, glyphs, capHeight } = copyOf("minecraft-ten")
    const doubled = Object.values(glyphs).map(glyph => ({ ...glyph, advance: glyph.advance * 2, originX: glyph.originX * 2, top: glyph.top * 2, bottom: glyph.bottom * 2, width: glyph.width * 2, height: glyph.height * 2, mask: Uint8Array.from({ length: glyph.width * glyph.height * 4 }, (_, i) => glyph.mask[Math.floor(Math.floor(i / (glyph.width * 2)) / 2) * glyph.width + Math.floor((i % (glyph.width * 2)) / 2)]), stretch: glyph.stretch && glyph.stretch.flatMap(row => [row * 2, row * 2 + 1]) }))
    const font = fontFromPublished({ ...entry, name: entry.id, editor: { grid: 4, density: 2 } }, doubled, capHeight * 2)
    assert.deepEqual([font.height, font.density, font.grid], [capHeight, 2, 4])
    assert.deepEqual(glyphOf(font, "a").rows, glyphOf(copyOf("minecraft-ten").font, "a").rows)
  })

  test("the depth, border, flat setting, strips and grid come across, the author and description do not", () => {
    const { font } = copyOf("minecraft-ten-outline")
    assert.deepEqual([font.name, font.depth, font.border, font.flat, font.authors, font.description, font.overlay], ["minecraft-ten-outline Copy", 0, 0, true, [], "", false])
    assert.deepEqual([copyOf("minecraft-ten").font.strips, copyOf("minecraft-ten").font.grid], [["minecraft-ten"], 4])
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

  test("letters become pixels at the chosen height, with no creeper", async () => {
    const font = fontFromOutlines(await testFont(), { height: 21 })
    assert.equal(font.height, 21)
    assert.equal(glyphOf(font, "a").rows.length, 21)
    assert.ok(!isBlank(glyphOf(font, "a")))
    assert.ok(!font.creeper && !font.glyphs[CREEPER])
  })

  test("characters the file doesn't have start blank", async () => {
    const font = fontFromOutlines(await testFont(), { height: 21 })
    assert.ok(isBlank(glyphOf(font, "z")))
  })

  test("keeps the imported shapes to go back to, including space", async () => {
    const font = fontFromOutlines(await testFont(), { height: 21 })
    assert.deepEqual(font.imported.a.rows, font.glyphs.a.rows)
    assert.ok(font.imported[SPACE_CHAR])
    assert.equal(font.glyphs[SPACE_CHAR], undefined)
  })

  test("a file with none of the characters still opens, blank at half the height wide", async () => {
    const font = fontFromOutlines(await testFont(""), { height: 21 })
    assert.equal(font.width, 11)
    assert.ok(REQUIRED_CHARACTERS.every(char => isBlank(glyphOf(font, char))))
  })

  test("the result builds a sheet the real parser reads", async () => {
    const font = fontFromOutlines(await testFont(), { height: 21 })
    assert.equal(sheetOf(font).capHeight, 21)
  })

  function pixelArtFont(letters, { rows, nudge = 0 }) {
    const unit = 700 / rows
    let turn = 0
    const at = value => value * unit + (nudge ? (turn++ % 3 - 1) * nudge : 0)
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const glyphs = Object.entries(letters).map(([char, art]) => {
      const path = new opentype.Path()
      art.forEach((line, index) => Array.from(line).forEach((cell, x) => {
        if (cell !== "#") return
        const y = art.length - 1 - index
        path.moveTo(at(x), at(y))
        path.lineTo(at(x + 1), at(y))
        path.lineTo(at(x + 1), at(y + 1))
        path.lineTo(at(x), at(y + 1))
        path.close()
      }))
      return new opentype.Glyph({ name: char, unicode: char.codePointAt(0), advanceWidth: (art[0].length + 1) * unit, path })
    })
    return opentype.parse(new opentype.Font({ familyName: "Pixels", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(glyphs) }).toArrayBuffer())
  }

  function blockLetters(rows) {
    const bar = "#".repeat(6)
    const sides = `##${".".repeat(2)}##`
    const tall = Array.from({ length: rows }, (_, row) => row === Math.floor(rows / 2) ? bar : sides)
    const short = Array.from({ length: rows }, (_, row) => row < rows / 2 ? "......" : row === Math.ceil(rows / 2) ? bar : sides)
    return { H: tall, M: tall.map((line, row) => row === 1 ? "##..##".replace("..", "##") : line), m: short, n: short }
  }

  test("a pixel art font suggests its rows at the square size nearest 40 pixels, even with loosely rounded points", () => {
    assert.deepEqual(suggestedSize(pixelArtFont(blockLetters(10), { rows: 10 })), { rows: 10, square: 4, pixel: true })
    assert.deepEqual(suggestedSize(pixelArtFont(blockLetters(16), { rows: 16, nudge: 2 })), { rows: 16, square: 2, pixel: true })
  })

  test("a smooth font suggests enough rows for its thin strokes", () => {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const thin = Array.from("HIL").map(char => {
      const path = new opentype.Path()
      path.moveTo(0, 0)
      path.lineTo(40, 0)
      path.quadraticCurveTo(60, 350, 40, 700)
      path.lineTo(0, 700)
      path.quadraticCurveTo(20, 350, 0, 0)
      path.close()
      return new opentype.Glyph({ name: char, unicode: char.codePointAt(0), advanceWidth: 200, path })
    })
    const smooth = suggestedSize(opentype.parse(new opentype.Font({ familyName: "Thin", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(thin) }).toArrayBuffer()))
    assert.ok(!smooth.pixel && smooth.rows > 20)
  })

  test("a pixel art font lands on its own grid with stretch marks", () => {
    const font = fontFromOutlines(pixelArtFont(blockLetters(10), { rows: 10 }), { height: 40 })
    assert.equal(font.height, 40)
    assert.equal(font.grid, 4)
    assert.ok(!isBlank(glyphOf(font, "m")))
    assert.ok(glyphOf(font, "H").stretch.length > 0)
  })

  test("the cap height comes from the H, not a font's own cap height setting", async () => {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const built = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(Array.from("ABH").map(char => square(1000, char, 700))) })
    built.tables.os2 = { ...built.tables.os2, sCapHeight: 950 }
    const font = fontFromOutlines(opentype.parse(built.toArrayBuffer()), { height: 21 })
    assert.deepEqual(font.glyphs.A.rows, fontFromOutlines(await testFont(), { height: 21 }).glyphs.A.rows)
  })

  function templateOf(chars = "ABH", size = 1) {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const built = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(Array.from(chars).map(char => square(1000, char, 700))) })
    return { name: "Test.ttf", data: `data:font/ttf;base64,${Buffer.from(built.toArrayBuffer()).toString("base64")}`, square: size }
  }

  test("the template font is saved in the JSON and read back", async () => {
    const template = templateOf()
    const font = { ...fontFromOutlines(await testFont(), { height: 21 }), template }
    const json = exportJson(font, "")
    assert.deepEqual(json.editor.template, template)
    assert.deepEqual(fontFromFiles({ json: parseFontJson(JSON.stringify(json)) }).template, template)
    assert.equal(exportJson(fontFromOutlines(await testFont(), { height: 21 }), "").editor.template, undefined)
    assert.throws(() => fontFromFiles({ json: { ...json, editor: { ...json.editor, template: { name: "Test.ttf", data: "nope", square: 1 } } } }), /template font isn't valid/)
  })

  test("added characters are drawn from the template at the font's height", async () => {
    const font = { ...fontFromOutlines(await testFont("ABHÄ"), { height: 21 }), template: templateOf("ABHÄ") }
    const { font: next, added } = addCharacters(font, "äz")
    const generated = await templateGlyphs(next, added)
    assert.deepEqual(Object.keys(generated), ["Ä"])
    assert.deepEqual(generated.Ä.rows, font.glyphs.A.rows)
    assert.ok(withTemplateGlyphs(next, generated).glyphs.Ä.stretch.length > 0)
    const taller = resizeFont(font, { height: 25 })
    assert.equal((await templateGlyphs(taller, ["A"])).A.rows.length, 25)
  })

  test("a font with no template generates nothing", async () => {
    assert.deepEqual(await templateGlyphs(fontFromOutlines(await testFont(), { height: 21 }), ["A"]), {})
  })

  test("the topline and baseline come from the edges most capitals share, not drips or a stray letter", () => {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    function dripping(char, depth) {
      const path = new opentype.Path()
      for (const [x, y, w, h] of [[0, 0, 700, 700], [100, -depth, 100, depth]]) {
        path.moveTo(x, y)
        path.lineTo(x, y + h)
        path.lineTo(x + w, y + h)
        path.lineTo(x + w, y)
        path.close()
      }
      return new opentype.Glyph({ name: char, unicode: char.codePointAt(0), advanceWidth: 800, path })
    }
    const tall = new opentype.Path()
    tall.moveTo(0, 0)
    tall.lineTo(0, 950)
    tall.lineTo(700, 950)
    tall.lineTo(700, 0)
    tall.close()
    const glyphs = [notdef].concat(Array.from("ABCDEFGH", (char, index) => dripping(char, 100 * (index % 3 + 1))), new opentype.Glyph({ name: "Q", unicode: 81, advanceWidth: 800, path: tall }))
    const built = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -300, glyphs })
    built.tables.os2 = { ...built.tables.os2, sCapHeight: 950 }
    assert.deepEqual(lineUnits(opentype.parse(built.toArrayBuffer())), { top: 700, base: 0 })
  })

  test("a font that sits above zero is moved down onto the baseline", async () => {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const raised = Array.from("ABH", char => {
      const path = new opentype.Path()
      path.moveTo(0, 200)
      path.lineTo(0, 900)
      path.lineTo(700, 900)
      path.lineTo(700, 200)
      path.close()
      return new opentype.Glyph({ name: char, unicode: char.codePointAt(0), advanceWidth: 800, path })
    })
    const built = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 1000, descender: 0, glyphs: [notdef].concat(raised) })
    const font = fontFromOutlines(opentype.parse(built.toArrayBuffer()), { height: 21 })
    assert.equal(font.glyphs.A.below, 0)
    assert.deepEqual(font.glyphs.A.rows, fontFromOutlines(await testFont(), { height: 21 }).glyphs.A.rows)
  })

  test("a woff2 file imports the same as the font it was made from", async () => {
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
    const built = new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(Array.from("ABH").map(char => square(1000, char, 700))) })
    const woff2 = await compress(new Uint8Array(built.toArrayBuffer()))
    const font = fontFromOutlines(await parseFontFile(woff2.buffer.slice(woff2.byteOffset, woff2.byteOffset + woff2.byteLength)), { height: 21 })
    assert.deepEqual(font.glyphs.a.rows, fontFromOutlines(await testFont(), { height: 21 }).glyphs.a.rows)
  })

  test("a 45 degree edge through pixel corners steps one pixel every row", () => {
    const path = new opentype.Path()
    path.moveTo(-600, 0)
    path.lineTo(1500, 2100)
    path.lineTo(2000, 2100)
    path.lineTo(-100, 0)
    path.close()
    const shape = rasterise(new opentype.Glyph({ name: "slash", unicode: 47, advanceWidth: 2000, path }), 0.02, 0)
    for (let row = 0; row < shape.height; row++) {
      const filled = Array.from(shape.mask.slice(row * shape.width, (row + 1) * shape.width))
      assert.equal(filled.indexOf(1), shape.height - 1 - row, `row ${row}`)
      assert.equal(filled.filter(Boolean).length, 10, `row ${row}`)
    }
  })

  test("a mirror symmetric letter stays symmetric wherever it sits off the pixel grid", () => {
    for (const offset of [0, 13, 29, 41]) {
      const path = new opentype.Path()
      path.moveTo(offset, 0)
      path.lineTo(offset + 310, 1000)
      path.lineTo(offset + 690, 1000)
      path.lineTo(offset + 1000, 0)
      path.close()
      const glyph = new opentype.Glyph({ name: "trapezoid", unicode: 65, advanceWidth: 1100, path })
      const scale = 0.0263
      const shape = rasterise(glyph, scale, gridShift(glyph, null, scale))
      for (let row = 0; row < shape.height; row++) {
        const filled = Array.from(shape.mask.slice(row * shape.width, (row + 1) * shape.width))
        assert.deepEqual(filled, filled.toReversed(), `offset ${offset} row ${row}`)
      }
    }
  })

  test("collections are refused with a clear message", async () => {
    const buffer = new TextEncoder().encode("ttcf0000").buffer
    await assert.rejects(parseFontFile(buffer), /collections/)
  })

  test("an empty file is refused with a clear message", async () => {
    await assert.rejects(parseFontFile(new ArrayBuffer(0)), /empty or too short/)
  })

  test("a font with no usable names is called Imported Font", async () => {
    const source = await testFont()
    source.names = {}
    const font = fontFromOutlines(source, { height: 21 })
    assert.deepEqual([font.name, font.authors], ["Imported Font", []])
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
    assert.equal(font.glyphs.A.rows[0].length, 12)
    assert.equal(font.glyphs.A.rows.length, 42)
    assert.ok(isBlank(glyphOf(font, "b")) && isBlank(glyphOf(font, "B")))
  })

  test("the row count is the texture's cap height in pixels", () => {
    assert.equal(asciiRows(image), 7)
  })

  test("both cases come from their own cells, and descenders go below the baseline", () => {
    const font = fontFromAscii(image, { height: 7 })
    assert.equal(font.letterCase, "both")
    assert.equal(font.glyphs.A.width, 2)
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
