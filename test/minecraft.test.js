import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { blockName, blockTexturePaths, isOpaque, pngSize, usableVersions } from "../src/lib/minecraft.js"

describe("blockTexturePaths", () => {
  test("finds the modern block folder", () => {
    assert.deepEqual(Array.from(blockTexturePaths(["assets/minecraft/textures/block/stone.png"])), [["stone", "assets/minecraft/textures/block/stone.png"]])
  })

  test("finds the older blocks folder", () => {
    assert.deepEqual(Array.from(blockTexturePaths(["assets/minecraft/textures/blocks/stone.png"])), [["stone", "assets/minecraft/textures/blocks/stone.png"]])
  })

  test("finds the blocks folder of a version with no assets folder", () => {
    assert.deepEqual(Array.from(blockTexturePaths(["textures/blocks/stone.png"])), [["stone", "textures/blocks/stone.png"]])
  })

  test("skips everything else", () => {
    const paths = ["assets/minecraft/textures/item/stick.png", "assets/minecraft/textures/block/stone.png.mcmeta", "assets/minecraft/textures/block/nested/stone.png", "assets/realms/textures/block/stone.png", "data/minecraft/textures/block/stone.png", "assets/minecraft/models/block/stone.json"]
    assert.equal(blockTexturePaths(paths).size, 0)
  })
})

describe("pngSize", () => {
  test("reads the size from the header", () => {
    const bytes = new Uint8Array(24)
    new DataView(bytes.buffer).setUint32(16, 16)
    new DataView(bytes.buffer).setUint32(20, 320)
    assert.deepEqual(pngSize(bytes), { width: 16, height: 320 })
  })

  test("reads from a view that does not start at the buffer's start", () => {
    const whole = new Uint8Array(34)
    new DataView(whole.buffer).setUint32(26, 32)
    new DataView(whole.buffer).setUint32(30, 64)
    assert.deepEqual(pngSize(whole.subarray(10)), { width: 32, height: 64 })
  })
})

describe("blockName", () => {
  test("splits a number from the word before it", () => {
    assert.equal(blockName("cartography_table_side1"), "Cartography Table Side 1")
  })

  test("splits the camel case of old versions", () => {
    assert.equal(blockName("activatorRail_powered"), "Activator Rail Powered")
  })

  test("keeps a number that is already separate", () => {
    assert.equal(blockName("destroy_stage_0"), "Destroy Stage 0")
  })

  test("leaves a plain name alone", () => {
    assert.equal(blockName("stone"), "Stone")
  })
})

describe("isOpaque", () => {
  test("is true when every pixel is solid", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), true)
  })

  test("is false when a pixel is fully clear", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0])), false)
  })

  test("is false when a pixel is partly clear", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([1, 2, 3, 254, 4, 5, 6, 255])), false)
  })

  test("colour values of 0 do not count as clear", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([0, 0, 0, 255])), true)
  })
})

describe("usableVersions", () => {
  test("keeps the versions from when the block folders first appeared", () => {
    const versions = [{ id: "26.3", releaseTime: "2026-09-01T00:00:00+00:00" }, { id: "1.5", releaseTime: "2013-03-13T00:00:00+00:00" }, { id: "1.4.7", releaseTime: "2012-12-28T00:00:00+00:00" }, { id: "b1.8.1", releaseTime: "2011-09-19T00:00:00+00:00" }]
    assert.deepEqual(usableVersions(versions).map(version => version.id), ["26.3", "1.5"])
  })
})
