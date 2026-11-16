import assert from "node:assert/strict"
import { describe, test } from "node:test"
import opentype from "opentype.js"
import { parseFontFile } from "../../src/lib/font/fontImport.js"
import { glyphFor } from "../../src/lib/font/fontOutline.js"
import { casedCharacters, characterGroups, codeOf, drawnCharacters, matchesSearch } from "../../src/lib/font/editor/coverage.js"

function glyph(char, drawn = true) {
  const path = new opentype.Path()
  if (drawn) {
    path.moveTo(0, 0)
    path.lineTo(500, 0)
    path.lineTo(500, 500)
    path.close()
  }
  return new opentype.Glyph({ name: `u${char.codePointAt(0)}`, unicode: char.codePointAt(0), advanceWidth: 600, path })
}

function fontOf(glyphs) {
  const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
  return parseFontFile(new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef].concat(glyphs) }).toArrayBuffer())
}

describe("characters a font draws", () => {
  test("lists the characters with a drawn glyph in code point order", async () => {
    const source = await fontOf(["b", "a", "é", "Ж"].map(char => glyph(char)).concat(glyph("c", false)))
    assert.deepEqual(await drawnCharacters(source), ["a", "b", "é", "Ж"])
  })

  test("leaves out spaces, combining marks and control characters", async () => {
    const source = await fontOf([" ", "́", "‍", "\u0007", "x"].map(char => glyph(char)))
    assert.deepEqual(await drawnCharacters(source), ["x"])
  })

  test("hides emoji but keeps text symbols", async () => {
    const source = await fontOf(["😀", "⌚", "©", "™", "x"].map(char => glyph(char)))
    assert.deepEqual(await drawnCharacters(source), ["x", "©", "™"])
  })

  test("hides double and curly quotes, which titles never use", async () => {
    const source = await fontOf(["'", "\"", "‘", "’", "“", "”", "x"].map(char => glyph(char)))
    assert.deepEqual(await drawnCharacters(source), ["'", "x"])
  })

  test("a closing curly quote stands in for a missing straight one", async () => {
    const source = await fontOf(["’", "x"].map(char => glyph(char)))
    assert.deepEqual(await drawnCharacters(source), ["'", "x"])
    assert.equal(glyphFor(source, "'").unicode, 0x2019)
  })

  test("a straight quote is used over a curly one when the font has both", async () => {
    const source = await fontOf(["'", "’"].map(char => glyph(char)))
    assert.equal(glyphFor(source, "'").unicode, 0x27)
  })

  test("keeps only the letters a single case would use", () => {
    const chars = ["A", "a", "1", "ä", "Ä"]
    assert.deepEqual(casedCharacters(chars, "both"), chars)
    assert.deepEqual(casedCharacters(chars, "upper"), ["A", "1", "Ä"])
    assert.deepEqual(casedCharacters(chars, "lower"), ["a", "1", "ä"])
  })
})

describe("grouping and search", () => {
  test("groups by script, then numbers, punctuation and symbols", () => {
    const groups = characterGroups(["a", "1", "!", "€", "Ж", "α", "é", "あ", "中"])
    assert.deepEqual(groups.map(group => [group.id, group.chars.join("")]), [["latin", "aé"], ["numbers", "1"], ["punctuation", "!"], ["symbols", "€"], ["greek", "α"], ["cyrillic", "Ж"], ["hiragana", "あ"], ["han", "中"]])
  })

  test("letters from scripts without a group go together at the end", () => {
    assert.deepEqual(characterGroups(["ᚠ", "a"]).map(group => group.id), ["latin", "other"])
  })

  test("search matches the typed characters or a code point", () => {
    assert.ok(matchesSearch("é", ""))
    assert.ok(matchesSearch("é", "aé"))
    assert.ok(matchesSearch("é", "U+00E9"))
    assert.ok(matchesSearch("é", "e9"))
    assert.ok(!matchesSearch("é", "e"))
    assert.ok(!matchesSearch("é", "U+00E8"))
  })

  test("codes are written the usual way", () => {
    assert.equal(codeOf("é"), "U+00E9")
    assert.equal(codeOf("😀"), "U+1F600")
  })
})
