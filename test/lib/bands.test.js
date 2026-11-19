import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { usePlatform } from "../../src/lib/core/platform.js"
import { bandOf, stripBand } from "../../src/lib/texture/bands.js"

function fakeCanvas() {
  const canvas = { width: 0, height: 0 }
  const ctx = { drawImage() {}, putImageData() {}, getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }
  canvas.getContext = () => ctx
  return canvas
}

usePlatform({ createCanvas: fakeCanvas })

describe("stripBand", () => {
  const strip = { width: 16, height: 40 }

  test("cuts each layer's band to its own height", () => {
    assert.equal(stripBand(strip, 0, 10).height, 10)
    assert.equal(stripBand(strip, 0, 20).height, 20)
  })

  test("reuses a band it already cut", () => {
    assert.equal(stripBand(strip, 10, 10), stripBand(strip, 10, 10))
  })
})

describe("bandOf", () => {
  const cell = { char: "g", width: 2, height: 2, bottom: 0, top: 2, advance: 2, originX: 0, mask: Uint8Array.from([1, 1, 1, 1]), depths: Uint8Array.from([1, 1, 0, 0]) }
  const stacked = { cells: [cell], capHeight: 2, depth: 4, layers: [1, 0.5] }
  const independent = { ...stacked, layerDepth: "independent" }

  test("splits one image into a band per layer", () => {
    const image = { width: 2, height: 11 }
    assert.notEqual(bandOf(image, 0, stacked), bandOf(image, 1, stacked))
    assert.equal(bandOf(image, 0, stacked), bandOf(image, 0, stacked))
  })

  test("splits the same image again for a font with other layer bands", () => {
    const image = { width: 2, height: 11 }
    bandOf(image, 0, stacked)
    assert.throws(() => bandOf(image, 0, independent), /doesn't hold this font's 2 layer bands/)
  })
})
