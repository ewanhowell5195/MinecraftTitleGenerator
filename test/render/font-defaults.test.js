import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { applyFontDefaults } from "#render/fontDefaults.js"
import { loadedFont } from "#lib/title/objects.js"
import { layerTarget, separateLayers } from "#lib/settings/layers.js"
import { createObject } from "#lib/settings/objects.js"

const before = { primary: "stone", overlays: { dust: {}, glow: {} }, edgeOverlays: {}, textures: { flat: {}, stone: {} } }
const after = { primary: "gold", overlays: { glow: {} }, edgeOverlays: {}, textures: { flat: {}, gold: {} } }
const oldFont = { id: "old", layers: [{}, {}, {}] }
const newFont = { id: "new", layers: [{}, {}, {}] }

function layered(values = {}) {
  const object = createObject({ textureSource: "premade", texture: "stone", ...values })
  loadedFont.set(object, oldFont.id)
  return object
}

function now(change) {
  change()
}

function switchFont(object) {
  applyFontDefaults(object, newFont, after, before, now)
}

describe("font defaults", () => {
  test("a custom texture that isn't tileable goes back to premade on every separate layer", () => {
    const object = layered()
    separateLayers(object, "texture", true, 3)
    object.layerSettings[0].textureSource = "custom"
    object.layerSettings[0].customTexture = "data:image/png;base64,AAAA"
    object.layerSettings[1].textureSource = "custom"
    object.layerSettings[1].customTexture = "data:image/png;base64,BBBB"
    object.layerSettings[1].customTextureMode = "tileable"
    switchFont(object)
    assert.equal(layerTarget(object, 0).textureSource, "premade")
    assert.equal(layerTarget(object, 0).texture, "gold")
    assert.equal(layerTarget(object, 1).textureSource, "premade")
    assert.equal(layerTarget(object, 1).texture, "gold")
    assert.equal(layerTarget(object, 2).textureSource, "custom")
    assert.equal(layerTarget(object, 2).customTexture, "data:image/png;base64,BBBB")
  })

  test("the line's own custom texture still goes back to premade", () => {
    const object = layered({ textureSource: "custom", customTexture: "data:image/png;base64,AAAA" })
    switchFont(object)
    assert.equal(object.textureSource, "premade")
    assert.equal(object.texture, "gold")
  })

  test("word and terminator spacing go back to the new font's", () => {
    const object = layered({ spaceWidth: 5, terminatorSpace: 3 })
    switchFont(object)
    assert.equal(object.spaceWidth, null)
    assert.equal(object.terminatorSpace, null)
  })

  test("a texture the new font also has is kept", () => {
    const object = layered({ texture: "flat" })
    switchFont(object)
    assert.equal(object.texture, "flat")
  })

  test("a variant the new font doesn't have falls back to its texture", () => {
    const shared = { primary: "stone", overlays: {}, edgeOverlays: {}, textures: { stone: { variants: { mossy: {} } } } }
    const object = layered({ textureVariant: "mossy" })
    applyFontDefaults(object, newFont, structuredClone(shared), shared, now)
    assert.deepEqual([object.texture, object.textureVariant], ["stone", "mossy"])
    loadedFont.set(object, oldFont.id)
    applyFontDefaults(object, newFont, { ...shared, textures: { stone: {} } }, shared, now)
    assert.deepEqual([object.texture, object.textureVariant], ["stone", null])
  })

  test("a kept texture only takes the new font's face defaults where they differ", () => {
    const list = (sides, inner) => ({ primary: "stone", overlays: {}, edgeOverlays: {}, textures: { stone: { sides, inner } } })
    const object = layered({ customInternal: true, internalColour: "#abcdef" })
    applyFontDefaults(object, newFont, list("#222222", "#333333"), list("#111111", "#333333"), now)
    assert.deepEqual([object.customSide, object.sideColour], [true, "#222222"])
    assert.deepEqual([object.customInternal, object.internalColour], [true, "#abcdef"])
  })

  test("every separate layer drops overlays the new font doesn't have", () => {
    const object = layered()
    object.overlayMode = "custom"
    object.overlays = [{ overlay: "dust" }, { overlay: "glow" }]
    separateLayers(object, "overlays", true, 3)
    object.layerSettings[1].overlays = [{ overlay: "dust" }, { source: "file", file: "data:image/png;base64,AAAA" }]
    switchFont(object)
    assert.deepEqual(layerTarget(object, 0).overlays, [{ overlay: "glow" }])
    assert.deepEqual(layerTarget(object, 1).overlays, [{ overlay: "glow" }])
    assert.deepEqual(layerTarget(object, 2).overlays, [{ source: "file", file: "data:image/png;base64,AAAA" }])
  })
})
