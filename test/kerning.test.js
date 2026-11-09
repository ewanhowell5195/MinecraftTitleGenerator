import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { publishedFonts, readMask } from "../generator/fonts.js"
import { splitCells } from "../src/lib/font.js"
import { defaultBorder } from "../src/lib/settings.js"
import { collisionAmount, pairRank, suggestKerning } from "../src/lib/kerning.js"

describe("kerning suggestions", () => {
  const fonts = publishedFonts()

  function kerningStep(kerning) {
    const amounts = Object.values(kerning)
    return [8, 6, 4, 2].find(step => amounts.filter(amount => amount % step === 0).length >= amounts.length * 0.9) ?? 1
  }

  function glyphsOf(entry) {
    const { cells, capHeight } = readMask(entry, fonts)
    return { glyphs: splitCells(entry, fonts, cells).glyphs, capHeight, border: defaultBorder("top", entry) }
  }

  const ten = glyphsOf(fonts.find(font => font.id === "minecraft-ten"))
  const options = { capHeight: ten.capHeight, unit: 4, border: ten.border }
  const suggested = new Map(suggestKerning(ten.glyphs, options).map(item => [item.pair, item.amount]))

  test("suggestions follow the hand kerning of the published fonts", () => {
    let total = 0
    let exact = 0
    for (const entry of fonts.filter(font => !font.inherits && font.kerning)) {
      const { glyphs, capHeight, border } = glyphsOf(entry)
      const unit = kerningStep(entry.kerning)
      const amounts = new Map(suggestKerning(glyphs, { capHeight, unit, border }).map(item => [item.pair, item.amount]))
      for (const [pair, amount] of Object.entries(entry.kerning)) {
        const got = amounts.get(pair) ?? 0
        total++
        if (got === amount) exact++
        assert.ok(got <= amount + unit, `${entry.id} ${pair} suggested ${got}, kerned ${amount}`)
        assert.ok(amount <= collisionAmount(glyphs, pair, border), `${entry.id} ${pair} kerned ${amount}, past its collision`)
      }
    }
    assert.ok(exact / total > 0.85, `${exact} of ${total} match`)
  })

  test("two full height letters close the whole gap, short characters and single slashes about half", () => {
    assert.deepEqual(["lt", "//", "t.", "l-", "t/", "/j"].map(pair => suggested.get(pair)), [8, 16, 4, 8, 4, 8])
    for (const [pair, amount] of suggested) if (Array.from(pair).some(char => "._-,'".includes(char))) assert.ok(amount <= 8, `${pair} ${amount}`)
  })

  test("flat sided pairs and pairs already kerned are left out", () => {
    assert.ok(!suggested.has("ll"))
    assert.ok(!suggestKerning(ten.glyphs, options, { lt: 8 }).some(item => item.pair === "lt"))
  })

  test("letters come first, then numbers, then numbers with letters, then currency, brackets, slashes and question marks, then other symbols", () => {
    assert.deepEqual(["a-", "a/", "$4", "(]", "t?", "4a", "44", "lt", "\u{1F633}v"].map(pairRank), [4, 3, 3, 3, 3, 2, 1, 0, 0])
    const ranks = Array.from(suggested.keys(), pairRank)
    assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b))
  })

  test("a pair collides when its letters' outlines meet, and no suggestion goes past that", () => {
    assert.equal(collisionAmount(ten.glyphs, "lt", ten.border), 8)
    assert.equal(collisionAmount(ten.glyphs, "lt", 0), 12)
    for (const [pair, amount] of suggested) assert.ok(amount <= collisionAmount(ten.glyphs, pair, ten.border), pair)
    assert.equal(collisionAmount(ten.glyphs, "l ", ten.border), null)
  })

  test("a letter never slides more than a third of the narrower letter's width under the other", () => {
    function glyph(rows) {
      const mask = new Uint8Array(rows.length * rows[0].length)
      rows.forEach((line, index) => Array.from(line).forEach((char, column) => { mask[(rows.length - 1 - index) * line.length + column] = char === "#" ? 1 : 0 }))
      return { mask, width: rows[0].length, height: rows.length, bottom: 0, originX: 0, advance: rows[0].length + 1 }
    }
    const glyphs = {
      l: glyph(["##......", "##......", "##......", "##......", "##......", "##......", "########", "########"]),
      7: glyph(["########", "########", "......##", "......##", "......##", "......##", "......##", "......##"]),
      o: glyph(["########", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "########"])
    }
    assert.equal(collisionAmount(glyphs, "l7", 0), 7)
    assert.deepEqual(suggestKerning(glyphs, { capHeight: 8, unit: 1, border: 0 }), [{ pair: "l7", amount: 3 }])
  })

  test("letters with no rows near each other can slide the whole way past", () => {
    const low = { mask: new Uint8Array([1, 1]), width: 2, height: 1, bottom: 0, originX: 1, advance: 4 }
    const high = { mask: new Uint8Array([1, 1, 1]), width: 3, height: 1, bottom: 20, originX: 0, advance: 5 }
    assert.equal(collisionAmount({ ".": low, "'": high }, ".'", 2), 4)
    assert.equal(collisionAmount({ ".": low, "'": { ...high, width: 0 } }, ".'", 2), null)
    assert.deepEqual(suggestKerning({ ".": low, "'": high }, { capHeight: 8, unit: 1, border: 0 }), [])
  })

  test("amounts are whole squares", () => {
    for (const amount of suggested.values()) assert.equal(amount % 4, 0)
  })
})
