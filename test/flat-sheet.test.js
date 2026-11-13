import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { flatPixels, stripLimits } from "../src/lib/flatSheet.js"

function cellOf(rows, bottom) {
  const width = rows[0].length
  const mask = Uint8Array.from(rows.slice().reverse().join(""), cell => Number(cell))
  return { char: "g", width, height: rows.length, bottom, top: bottom + rows.length, advance: width, originX: 0, mask }
}

function stripRow(sheet, y) {
  return Array.from({ length: sheet.width }, (_, x) => sheet.data[(y * sheet.width + x) * 4 + 3] ? "1" : "0").join("")
}

describe("flat sheet strips", () => {
  test("the top and bottom lines fall back to the letter's own highest and lowest faces", () => {
    assert.deepEqual(stripLimits([6, 4], [0, 2], 10), { topline: 6, baseline: 0 })
    assert.deepEqual(stripLimits([12, 10], [-3, 0], 10), { topline: 10, baseline: 0 })
  })

  test("the bottom strip covers every face at or below the baseline, drips and all", () => {
    const rows = new Array(6).fill("111111").concat(["100100", "000100"])
    const sheet = flatPixels([cellOf(rows, -2)], 6, 2)
    const [[, at]] = sheet.layout
    assert.equal(stripRow(sheet, at.down).slice(at.x, at.x + 6), "111111")
    assert.equal(stripRow(sheet, at.up).slice(at.x, at.x + 6), "111111")
  })

  test("faces between the lines are left for the inner face colour", () => {
    const rows = ["110011", "110011", "111111", "111111"]
    const sheet = flatPixels([cellOf(rows, 0)], 6, 2)
    const [[, at]] = sheet.layout
    assert.equal(stripRow(sheet, at.up).slice(at.x, at.x + 6), "110011")
  })
})
