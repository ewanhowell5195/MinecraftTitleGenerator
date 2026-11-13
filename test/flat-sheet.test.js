import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { expandBands, flatLayers, flatPixels, layerSlices, stripLimits } from "../src/lib/flatSheet.js"

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

describe("layer bands", () => {
  const cell = { ...cellOf(["11", "11"], 0), depths: Uint8Array.from([1, 1, 0, 0]) }
  const layers = [1, 0.5]

  test("each band's strips only hold its own slice of the depth", () => {
    assert.deepEqual(layerSlices(layers, 4), [{ from: 2, rows: 2 }, { from: 0, rows: 2 }])
    assert.equal(flatLayers([cell], 2, 4, layers, 1, true).height, 12)
  })

  test("each band is darker the further back its layer sits", () => {
    const sheet = flatLayers([cell], 2, 4, layers, 1, true)
    const red = (x, y) => sheet.data[(y * sheet.width + x) * 4]
    assert.deepEqual([red(0, 0), red(0, 2), red(0, 6), red(0, 8)], [176, 255, 88, 128])
  })

  test("expanding puts each slice at its depth and stretches its end rows over the rest", () => {
    const sheet = flatLayers([cell], 2, 4, layers, 1, true)
    const source = new Uint8ClampedArray(sheet.data.length)
    for (let y = 0; y < sheet.height; y++) source.fill(y, y * 2 * 4, (y + 1) * 2 * 4)
    const { data, height } = expandBands(source, 2, [cell], 2, 4, layers)
    assert.equal(height, 20)
    const column = Array.from({ length: height }, (_, y) => data[y * 2 * 4])
    assert.deepEqual(column, [0, 0, 0, 1, 2, 3, 4, 5, 5, 5, 6, 7, 7, 7, 8, 9, 10, 10, 10, 11])
  })
})
