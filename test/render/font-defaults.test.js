import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { applyFontDefaults } from "../../src/render/fontDefaults.js"
import { loadedFont } from "../../src/lib/state/scene.js"
import { layerTarget, separateLayers } from "../../src/lib/settings/layers.js"
import { createObject } from "../../src/lib/settings/objects.js"

const before = { primary: "stone", overlays: { dust: {}, glow: {} }, edgeOverlays: {}, textures: { flat: {}, stone: {} } }
const after = { primary: "gold", overlays: { glow: {} }, edgeOverlays: {}, textures: { flat: {}, gold: {} } }
const oldFont = { id: "old", layers: [{}, {}, {}] }
const newFont = { id: "new", layers: [{}, {}, {}] }

function layered(values = {}) {
  const object = createObject({ textureSource: "premade", texture: "stone", ...values })
  loadedFont.set(object, oldFont.id)
  return object
}

function switchFont(object) {
  applyFontDefaults(object, newFont, after, before)
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
