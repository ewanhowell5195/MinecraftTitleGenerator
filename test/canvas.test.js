import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { largestTexture } from "../src/lib/texture/canvas.js"

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
