import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { hexOf, rgbOf } from "../src/lib/colour.js"

describe("rgbOf", () => {
  test("reads each channel from a hex colour", () => {
    assert.deepEqual(rgbOf("#ff8000"), [255, 128, 0])
    assert.deepEqual(rgbOf("#0a141e"), [10, 20, 30])
  })

  test("reads upper case digits", () => {
    assert.deepEqual(rgbOf("#FFAA0B"), [255, 170, 11])
  })

  test("reads the extremes", () => {
    assert.deepEqual(rgbOf("#000000"), [0, 0, 0])
    assert.deepEqual(rgbOf("#ffffff"), [255, 255, 255])
  })

  test("ignores an alpha pair", () => {
    assert.deepEqual(rgbOf("#11223344"), [17, 34, 51])
  })
})

describe("hexOf", () => {
  test("writes lower case digits", () => {
    assert.equal(hexOf([255, 170, 11]), "#ffaa0b")
  })

  test("pads single digit channels", () => {
    assert.equal(hexOf([0, 1, 15]), "#00010f")
  })

  test("rounds fractional channels from averaged colours", () => {
    assert.equal(hexOf([127.5, 0.4, 254.6]), "#8000ff")
  })

  test("rounds a channel just under the top up to ff", () => {
    assert.equal(hexOf([254.5, 254.5, 254.5]), "#ffffff")
  })
})

describe("round trip", () => {
  test("every channel value survives hex and back", () => {
    for (let value = 0; value < 256; value++) {
      const rgb = [value, 255 - value, value >> 1]
      assert.deepEqual(rgbOf(hexOf(rgb)), rgb)
    }
  })

  test("a lower case hex colour comes back unchanged", () => {
    for (const hex of ["#000000", "#ffffff", "#ff8000", "#0a141e", "#00010f"]) assert.equal(hexOf(rgbOf(hex)), hex)
  })
})
