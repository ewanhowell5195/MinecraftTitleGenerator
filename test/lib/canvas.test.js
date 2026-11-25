import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { fadeStops, largestTexture } from "#lib/texture/canvas.js"

describe("fadeStops", () => {
  const positions = fade => fadeStops("edge", "clear", fade).map(stop => [stop.position, stop.colour])

  test("fades across the whole face at 0", () => {
    assert.deepEqual(positions(0), [[0, "clear"], [0, "clear"], [1, "edge"], [1, "edge"]])
  })

  test("brings the full edge colour forward when positive", () => {
    assert.deepEqual(positions(0.25), [[0, "clear"], [0, "clear"], [0.75, "edge"], [1, "edge"]])
  })

  test("starts the fade further back and makes it shorter when negative", () => {
    assert.deepEqual(positions(-0.25), [[0, "clear"], [0.25, "clear"], [1, "edge"], [1, "edge"]])
    assert.deepEqual(positions(-1), [[0, "clear"], [1, "clear"], [1, "edge"], [1, "edge"]])
  })
})

describe("largestTexture", () => {
  test("stops at 8192 even when the GPU and canvas go further", () => {
    assert.equal(largestTexture(16384, () => true), 8192)
  })

  test("keeps to a smaller GPU limit", () => {
    assert.equal(largestTexture(4096, () => true), 4096)
  })

  test("keeps to the largest square canvas that draws", () => {
    assert.equal(largestTexture(16384, size => size <= 4096), 4096)
  })

  test("assumes the ceiling when the GPU size is unknown", () => {
    assert.equal(largestTexture(0, () => true), 8192)
  })

  test("falls back to 2048 when nothing bigger draws", () => {
    assert.equal(largestTexture(16384, () => false), 2048)
  })
})
