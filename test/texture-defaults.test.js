import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { publishedFonts, fontTextureList, readMask } from "../generator/fonts.js"
import { FACE_PANELS, LAYERS, activeOverlays, isModified, layerTarget, layerView, perLayerDefault, resetPanel, separateForDefaults, separateLayers, setTexture, textureFaces } from "../src/lib/settings.js"
import { createObject } from "../src/lib/objects.js"

const list = {
  overlays: { dust: {}, glow: {} },
  edgeOverlays: { rim: {} },
  textures: {
    plain: {},
    flatFaces: { faces: "#575757", inner: "#111111" },
    red: { sides: "#ff0000" },
    blue: { sides: "#0000ff" },
    flatFacesCopy: { faces: "#575757", inner: "#111111" },
    layered: { sides: ["#575757", "#242424"], overlays: [[{ overlay: "dust" }], [{ overlay: "glow" }]], variants: { bare: { sides: null, overlays: null } } },
    notColour: { sides: { sideColour: "#575757" } },
    shortHex: { sides: "#fff" },
    layeredOverlays: { overlays: [[{ overlay: "dust" }], [{ overlay: "glow" }]] },
    flatOverlays: { overlays: [{ overlay: "dust" }] },
    bad: { sides: { sideFaces: true } }
  }
}

function premade(texture) {
  return createObject({ textureSource: "premade", texture })
}

describe("texture face defaults", () => {
  test("a flat default applies to the object when the texture is picked", () => {
    const object = premade("plain")
    setTexture(object, { texture: "flatFaces" }, { before: list })
    assert.equal(object.customEdge, true)
    assert.equal(object.edgeColour, "#575757")
    assert.equal(object.customInternal, true)
    assert.equal(object.internalColour, "#111111")
    assert.equal(object.separateColour, false)
  })

  test("a per-layer default separates the colour layers and sets each one", () => {
    const object = premade("plain")
    setTexture(object, { texture: "layered" }, { before: list })
    assert.equal(object.separateColour, true)
    assert.equal(layerTarget(object, 0).sideColour, "#575757")
    assert.equal(layerTarget(object, 1).sideColour, "#242424")
    assert.equal(layerTarget(object, 1).customSide, true)
  })

  test("a panel resets when the new texture's defaults for it differ", () => {
    const object = premade("plain")
    setTexture(object, { texture: "flatFaces" }, { before: list })
    object.edgeColour = "#ff0000"
    object.internalBrightness = 10
    setTexture(object, { texture: "plain" }, { before: list })
    assert.equal(object.edgeColour, createObject().edgeColour)
    assert.equal(object.customEdge, createObject().customEdge)
    assert.equal(object.internalBrightness, createObject().internalBrightness)
  })

  test("a panel keeps the user's changes when the new texture's defaults for it match", () => {
    const object = premade("plain")
    object.sideColour = "#ff0000"
    object.customSide = true
    setTexture(object, { texture: "flatFaces" }, { before: list })
    assert.equal(object.sideColour, "#ff0000")
    assert.equal(object.customSide, true)
    object.edgeColour = "#00ff00"
    setTexture(object, { texture: "flatFaces", textureVariant: null }, { before: list })
    setTexture(object, { texture: "flatFacesCopy" }, { before: list })
    assert.equal(object.edgeColour, "#00ff00")
  })

  test("settings from the font or type stay when a panel resets", () => {
    const object = premade("plain")
    object.internalFaces = true
    object.fadeInternal = false
    setTexture(object, { texture: "flatFaces" }, { before: list })
    assert.equal(object.internalFaces, true)
    assert.equal(object.fadeInternal, false)
  })

  test("with separate textures, picking one layer's texture only changes that layer's colours", () => {
    const object = premade("plain")
    separateLayers(object, "texture", true, 2)
    separateLayers(object, "colour", true, 2)
    setTexture(layerView(object, 0, "texture"), { texture: "red" }, { before: list })
    setTexture(layerView(object, 1, "texture"), { texture: "blue" }, { before: list })
    assert.equal(layerTarget(object, 0).sideColour, "#ff0000")
    assert.equal(layerTarget(object, 1).sideColour, "#0000ff")
  })

  test("reset and modified follow the texture's defaults, per layer", () => {
    const object = premade("plain")
    setTexture(object, { texture: "layered" }, { before: list })
    const back = layerView(object, 1, "colour")
    assert.equal(isModified(back, "sides", { list, layer: 1 }), false)
    back.sideColour = "#000000"
    assert.equal(isModified(back, "sides", { list, layer: 1 }), true)
    resetPanel(back, "sides", { list, layer: 1 })
    assert.equal(back.sideColour, "#242424")
    assert.equal(object.sideColour, "#575757")
  })

  test("a colour turns on the panel's custom colour", () => {
    assert.deepEqual(textureFaces(list, premade("layered"), "sides", 1), { customSide: true, sideColour: "#242424" })
    assert.deepEqual(textureFaces(list, premade("flatFaces"), "faces", 1), { customEdge: true, edgeColour: "#575757" })
  })

  test("a variant can switch off a default it would inherit with null", () => {
    const object = createObject({ textureSource: "premade", texture: "layered", textureVariant: "bare" })
    assert.deepEqual(textureFaces(list, object, "sides", 1), {})
    assert.deepEqual(activeOverlays(list, object, "overlays", 1), [])
  })

  test("a face default has to be a #rrggbb colour", () => {
    assert.throws(() => textureFaces(list, premade("notColour"), "sides"), /#rrggbb/)
    assert.throws(() => textureFaces(list, premade("shortHex"), "sides"), /#rrggbb/)
  })
})

describe("texture overlay defaults", () => {
  test("a flat list of overlays applies to every layer", () => {
    const object = premade("flatOverlays")
    assert.deepEqual(activeOverlays(list, object, "overlays", 0).map(layer => layer.overlay), ["dust"])
    assert.deepEqual(activeOverlays(list, object, "overlays", 1).map(layer => layer.overlay), ["dust"])
  })

  test("an already picked texture with per-layer defaults separates its groups when its list loads", () => {
    const object = premade("layeredOverlays")
    assert.equal(object.separateOverlays, false)
    separateForDefaults(object, list)
    assert.equal(object.separateOverlays, true)
    assert.equal(object.separateColour, false)
    const faces = premade("layered")
    separateForDefaults(faces, list)
    assert.equal(faces.separateColour, true)
  })

  test("with separate textures, picking a layer's texture separates the overlays and only resets that layer", () => {
    const object = createObject({ textureSource: "premade", texture: "plain", overlayMode: "custom", overlays: [{ overlay: "glow" }] })
    separateLayers(object, "texture", true, 2)
    setTexture(layerView(object, 1, "texture"), { texture: "flatOverlays" }, { before: list })
    assert.equal(object.separateOverlays, true)
    assert.deepEqual(activeOverlays(list, layerTarget(object, 0), "overlays", 0).map(layer => layer.overlay), ["glow"])
    assert.deepEqual(activeOverlays(list, layerTarget(object, 1), "overlays", 1).map(layer => layer.overlay), ["dust"])
  })

  test("a list of lists gives each layer its own overlays and separates them", () => {
    const object = premade("plain")
    setTexture(object, { texture: "layeredOverlays" }, { before: list })
    assert.equal(object.separateOverlays, true)
    assert.deepEqual(activeOverlays(list, object, "overlays", 0).map(layer => layer.overlay), ["dust"])
    assert.deepEqual(activeOverlays(list, layerTarget(object, 1), "overlays", 1).map(layer => layer.overlay), ["glow"])
  })
})

describe("published texture defaults", () => {
  const fonts = publishedFonts().filter(font => !font.inherits)
  for (const font of fonts) {
    test(`${font.id} texture defaults are valid`, () => {
      const textures = fontTextureList(font, fonts)
      const count = readMask(font, fonts).layers?.length ?? 1
      for (const [id, entry] of Object.entries(textures.textures)) {
        for (const variant of [null].concat(Object.keys(entry.variants ?? {}))) {
          const object = { textureSource: "premade", texture: id, textureVariant: variant }
          const merged = variant ? { ...entry, ...entry.variants[variant] } : entry
          for (const key of LAYERS.concat(FACE_PANELS)) {
            if (perLayerDefault(merged[key], key)) assert.equal(merged[key].length, count, `${variant ?? id} gives ${key} for ${merged[key].length} layers, but ${font.id} has ${count}`)
          }
          for (let layer = 0; layer < count; layer++) {
            for (const name of FACE_PANELS) textureFaces(textures, object, name, layer)
          }
        }
      }
    })
  }
})
