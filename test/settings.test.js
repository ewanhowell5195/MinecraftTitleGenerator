import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { isReactive } from "vue"
import { LAYER, activeOverlays, applyType, createObject, defaultBorder, defaultDepth, defaultOverlays, defaultSpacing, defaultTexture, effectiveScale, isModified, overlayLayer, pinnedTextures, resetPanel, resetTransform, restore, setTexture, snapshot, textureEntry, transformKeys, typeDefaults } from "../src/lib/settings.js"

const TOP_DEFAULTS = {
  hidden: false,
  group: null,
  text: "minecraft",
  spaceBefore: true,
  terminators: false,
  font: "minecraft-ten",
  type: "top",
  row: 0,
  rowSpacing: 0,
  depth: 22,
  depthAnchor: "back",
  border: 2,
  clipHoles: true,
  layerWords: false,
  spacing: 0,
  kerning: true,
  arcMode: "stretch",
  arcTop: 0,
  arcBottom: 0,
  arcMove: 0,
  arcMarked: true,
  twistRibbon: 0,
  twistRibbonAnchor: "centre",
  twistRibbonMirror: false,
  twistDoor: 0,
  twistDoorAnchor: "centre",
  twistDoorSame: false,
  arcGradient: false,
  matchWidth: null,
  matchBottom: false,
  matchScaleY: false,
  matchScale: 1,
  matchOffset: 0,
  scaleX: 1,
  scaleY: 1,
  linkScale: null,
  scaleZ: 1,
  scaleMarked: false,
  scaleOutline: false,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  translateX: 0,
  translateY: 0,
  translateZ: 0,
  wordDepth: null,
  wordBorder: null,
  wordArcMode: "stretch",
  wordArcTop: 0,
  wordArcBottom: 0,
  wordArcMove: 0,
  wordArcMarked: true,
  wordScaleX: 1,
  wordScaleY: 1,
  wordLinkScale: null,
  wordScaleZ: 1,
  wordScaleMarked: false,
  wordScaleOutline: false,
  wordRotationX: 0,
  wordRotationY: 0,
  wordRotationZ: 0,
  wordTranslateX: 0,
  wordTranslateY: 0,
  wordTranslateZ: 0,
  textureSource: "premade",
  texture: null,
  textureVariant: null,
  tileable: "cobblestone",
  tileableVariant: null,
  tileableSource: "premade",
  minecraftTexture: "cobblestone",
  minecraftVersion: null,
  stops: [{ colour: "#FFCF76", position: 0 }, { colour: "#DA371E", position: 100 }],
  smooth: true,
  gradientAngle: 0,
  tileableScale: 2,
  tileableXOffset: 0,
  tileableYOffset: 0,
  tileableRandomRotations: false,
  tileableRandomMirroring: false,
  tileableTileEdges: false,
  tileablePerCharacter: false,
  disableFontOverlay: false,
  overlayMode: "default",
  overlays: [],
  edgeOverlayMode: "default",
  edgeOverlays: [],
  hue: 0,
  saturation: 100,
  brightness: 100,
  contrast: 100,
  colour: "#ffffff",
  blend: "multiply",
  colourOpacity: 100,
  customBorder: false,
  borderColour: "#000000",
  internalFaces: false,
  fadeInternal: true,
  internalFade: 0,
  customInternal: false,
  internalColour: "#000000",
  internalBrightness: 35,
  internalFill: "solid",
  internalStops: [{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }],
  internalSmooth: true,
  internalDirection: "up",
  sideFaces: false,
  fadeSides: true,
  sideFade: 0,
  customSide: false,
  sideColour: "#000000",
  sideBrightness: 35,
  sideFill: "solid",
  sideStops: [{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }],
  sideSmooth: true,
  sideDirection: "up",
  fade: false,
  outerFade: 0,
  customEdge: false,
  edgeColour: "#000000",
  edgeBrightness: 35,
  edgeFill: "solid",
  edgeStops: [{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }],
  edgeSmooth: true
}

const BOTTOM_DEFAULTS = {
  ...TOP_DEFAULTS,
  type: "bottom",
  depthAnchor: "front",
  internalFaces: true,
  internalFade: 75,
  sideFade: 75,
  fade: true,
  outerFade: 50
}

const SMALL_DEFAULTS = {
  ...TOP_DEFAULTS,
  type: "small",
  depthAnchor: "middle",
  border: 3,
  clipHoles: false,
  spacing: 2,
  stops: [{ colour: "#E0E0E0", position: 0 }, { colour: "#8A8A8A", position: 100 }],
  internalFaces: true,
  fadeInternal: false,
  internalFade: 75,
  sideFaces: true,
  fadeSides: false,
  sideFade: 75
}

const PANEL_NAMES = ["text", "terminators", "font", "placement", "geometry", "spacing", "arc", "transform", "wordGeometry", "wordArc", "wordTransform", "texture", "overlays", "edgeOverlays", "colour", "outline", "inner", "sides", "faces"]

const TEXTURES = {
  primary: "cracked",
  secondary: "fired",
  textures: { flat: {}, cracked: {}, fired: {} },
  overlays: {},
  edgeOverlays: {}
}

describe("typeDefaults", () => {
  test("pins every top default", () => {
    assert.deepEqual(typeDefaults("top"), TOP_DEFAULTS)
  })

  test("pins every bottom default", () => {
    assert.deepEqual(typeDefaults("bottom"), BOTTOM_DEFAULTS)
  })

  test("pins every small default", () => {
    assert.deepEqual(typeDefaults("small"), SMALL_DEFAULTS)
  })

  test("returns stops that are not shared between calls", () => {
    const first = typeDefaults("top")
    first.stops[0].colour = "#000000"
    assert.equal(typeDefaults("top").stops[0].colour, "#FFCF76")
  })
})

describe("LAYER", () => {
  test("pins every layer default", () => {
    assert.deepEqual(LAYER, { source: "premade", file: null, blend: "overlay", colour: "#ffffff", colourBlend: "multiply", opacity: 100 })
  })
})

describe("createObject", () => {
  test("returns a reactive object with an id", () => {
    const object = createObject({}, 500)
    assert.ok(isReactive(object))
    assert.equal(object.id, 500)
  })

  test("continues ids after the highest one seen", () => {
    createObject({}, 1000)
    assert.equal(createObject().id, 1001)
    createObject({}, 3)
    assert.equal(createObject().id, 1002)
  })

  test("applies given values over the defaults", () => {
    const object = createObject({ text: "hello", hue: 40 })
    assert.equal(object.text, "hello")
    assert.equal(object.hue, 40)
    assert.equal(object.saturation, 100)
  })

  test("copies values rather than keeping references", () => {
    const stops = [{ colour: "#111111", position: 0 }]
    const object = createObject({ stops })
    stops[0].colour = "#222222"
    assert.equal(object.stops[0].colour, "#111111")
  })

  test("defaults clipHoles from the type", () => {
    assert.equal(createObject().clipHoles, true)
    assert.equal(createObject({ type: "top" }).clipHoles, true)
    assert.equal(createObject({ type: "bottom" }).clipHoles, true)
    assert.equal(createObject({ type: "small" }).clipHoles, false)
  })

  test("keeps an explicit clipHoles over the type default", () => {
    assert.equal(createObject({ type: "small", clipHoles: true }).clipHoles, true)
    assert.equal(createObject({ type: "top", clipHoles: false }).clipHoles, false)
  })
})

describe("restore", () => {
  test("only touches the keys given", () => {
    const object = createObject({ text: "keep", hue: 10 })
    restore(object, { hue: 20 })
    assert.equal(object.text, "keep")
    assert.equal(object.hue, 20)
  })

  test("ignores the id and unknown keys", () => {
    const object = createObject({}, 2000)
    restore(object, { id: 1, nonsense: true })
    assert.equal(object.id, 2000)
    assert.equal("nonsense" in object, false)
  })

  test("clones nested values", () => {
    const object = createObject()
    const overlays = [{ overlay: "a" }]
    restore(object, { overlays })
    overlays[0].overlay = "b"
    assert.equal(object.overlays[0].overlay, "a")
  })
})

describe("snapshot", () => {
  test("drops the id and detaches from the object", () => {
    const object = createObject({ text: "hello" })
    const values = snapshot(object)
    assert.equal("id" in values, false)
    assert.equal(values.text, "hello")
    values.stops[0].colour = "#000000"
    assert.equal(object.stops[0].colour, "#FFCF76")
  })
})

describe("applyType", () => {
  test("sets the type's look without changing the type field", () => {
    const object = createObject({ type: "top" })
    applyType(object, "small")
    assert.equal(object.type, "top")
    assert.equal(object.border, 3)
    assert.equal(object.spacing, 2)
    assert.equal(object.clipHoles, false)
    assert.equal(object.internalFaces, true)
    assert.equal(object.fadeInternal, false)
    assert.equal(object.sideFaces, true)
    assert.deepEqual(snapshot(object).stops, SMALL_DEFAULTS.stops)
  })

  test("uses the font's border and adds its character spacing", () => {
    const object = createObject()
    applyType(object, "small", { border: 5, characterSpacing: 3 })
    assert.equal(object.border, 5)
    assert.equal(object.spacing, 5)
  })

  test("sets clipHoles back on for top and bottom", () => {
    const object = createObject({ type: "small" })
    applyType(object, "bottom")
    assert.equal(object.clipHoles, true)
    object.clipHoles = false
    applyType(object, "top")
    assert.equal(object.clipHoles, true)
  })
})

describe("resetPanel", () => {
  test("text keeps the text and resets spaceBefore", () => {
    const object = createObject({ text: "hello", spaceBefore: false })
    resetPanel(object, "text")
    assert.equal(object.text, "hello")
    assert.equal(object.spaceBefore, true)
  })

  test("geometry takes depth and border from the font", () => {
    const object = createObject({ type: "bottom", depth: 1, border: 1, clipHoles: false })
    resetPanel(object, "geometry", { font: { depth: 30, border: 4 } })
    assert.equal(object.depth, 30)
    assert.equal(object.border, 4)
    assert.equal(object.clipHoles, true)
  })

  test("geometry without a font uses the type defaults", () => {
    const object = createObject({ type: "small", depth: 1, border: 1, clipHoles: true })
    resetPanel(object, "geometry")
    assert.equal(object.depth, 22)
    assert.equal(object.border, 3)
    assert.equal(object.clipHoles, false)
  })

  test("spacing combines the font and the type", () => {
    const object = createObject({ type: "small", spacing: 9, kerning: false })
    resetPanel(object, "spacing", { font: { characterSpacing: 1 } })
    assert.equal(object.spacing, 3)
    assert.equal(object.kerning, true)
  })

  test("placement goes back to the top type and its look", () => {
    const object = createObject({ ...typeDefaults("small"), row: 3, rowSpacing: 7 })
    resetPanel(object, "placement", { font: { characterSpacing: 1 } })
    assert.equal(object.type, "top")
    assert.equal(object.row, 0)
    assert.equal(object.rowSpacing, 0)
    assert.equal(object.border, 2)
    assert.equal(object.spacing, 1)
    assert.equal(object.clipHoles, true)
    assert.equal(object.internalFaces, false)
  })

  test("faces uses the object's type", () => {
    const object = createObject({ type: "bottom", fade: false, outerFade: 10, customEdge: true, edgeColour: "#123456", edgeBrightness: 5 })
    resetPanel(object, "faces")
    assert.equal(object.fade, true)
    assert.equal(object.outerFade, 50)
    assert.equal(object.customEdge, false)
    assert.equal(object.edgeColour, "#000000")
    assert.equal(object.edgeBrightness, 35)
  })

  test("inner uses the object's type", () => {
    const object = createObject({ type: "top", internalFaces: true, fadeInternal: false, internalFade: 10, customInternal: true })
    resetPanel(object, "inner")
    assert.equal(object.internalFaces, false)
    assert.equal(object.fadeInternal, true)
    assert.equal(object.internalFade, 0)
    assert.equal(object.customInternal, false)
  })

  test("sides uses the object's type", () => {
    const object = createObject({ type: "small", sideFaces: false, fadeSides: true, sideFade: 10, sideBrightness: 1 })
    resetPanel(object, "sides")
    assert.equal(object.sideFaces, true)
    assert.equal(object.fadeSides, false)
    assert.equal(object.sideFade, 75)
    assert.equal(object.sideBrightness, 35)
  })

  test("premade texture picks the default for the type and resets overlay modes", () => {
    const object = createObject({ type: "bottom", texture: "other", textureVariant: "old", tileable: "dirt", overlayMode: "custom", edgeOverlayMode: "custom" })
    resetPanel(object, "texture", { list: TEXTURES })
    assert.equal(object.texture, "fired")
    assert.equal(object.textureVariant, null)
    assert.equal(object.overlayMode, "default")
    assert.equal(object.edgeOverlayMode, "default")
    assert.equal(object.tileable, "dirt")
  })

  test("premade texture without a list clears the texture", () => {
    const object = createObject({ texture: "other" })
    resetPanel(object, "texture")
    assert.equal(object.texture, null)
  })

  test("gradient texture only resets the gradient tab", () => {
    const object = createObject({ type: "small", textureSource: "gradient", texture: "other", smooth: false, gradientAngle: 90, disableFontOverlay: true, overlayMode: "custom", stops: [{ colour: "#000000", position: 50 }] })
    resetPanel(object, "texture")
    assert.deepEqual(snapshot(object).stops, SMALL_DEFAULTS.stops)
    assert.equal(object.smooth, true)
    assert.equal(object.gradientAngle, 0)
    assert.equal(object.disableFontOverlay, true)
    assert.equal(object.texture, "other")
    assert.equal(object.overlayMode, "custom")
  })

  test("the face overlays panel resets the font overlay toggle wherever it shows", () => {
    const object = createObject({ textureSource: "gradient", disableFontOverlay: true })
    assert.equal(isModified(object, "overlays"), true)
    resetPanel(object, "overlays")
    assert.equal(object.disableFontOverlay, false)
    const premade = createObject({ textureSource: "premade", disableFontOverlay: true })
    assert.equal(isModified(premade, "overlays"), false)
  })

  test("tileable texture only resets the tileable tab", () => {
    const object = createObject({ textureSource: "tileable", tileable: "dirt", tileableVariant: "a", tileableScale: 8, texture: "other", smooth: false })
    resetPanel(object, "texture")
    assert.equal(object.tileable, "cobblestone")
    assert.equal(object.tileableVariant, null)
    assert.equal(object.tileableScale, 2)
    assert.equal(object.texture, "other")
    assert.equal(object.smooth, false)
  })

  test("the tiling panel only resets the tiling settings", () => {
    const object = createObject({ textureSource: "tileable", tileable: "dirt", tileableSource: "minecraft", minecraftTexture: "stone", tileableScale: 8, tileableXOffset: 3, tileablePerCharacter: true, disableFontOverlay: true })
    assert.equal(isModified(object, "tiling"), true)
    resetPanel(object, "tiling")
    assert.equal(object.tileableScale, 2)
    assert.equal(object.tileableXOffset, 0)
    assert.equal(object.tileablePerCharacter, false)
    assert.equal(isModified(object, "tiling"), false)
    assert.equal(object.tileable, "dirt")
    assert.equal(object.minecraftTexture, "stone")
    assert.equal(object.disableFontOverlay, true)
  })

  test("tileable texture also resets the Minecraft texture", () => {
    const object = createObject({ textureSource: "tileable", tileableSource: "minecraft", minecraftTexture: "stone", minecraftVersion: "1.8.9" })
    resetPanel(object, "texture")
    assert.equal(object.tileableSource, "premade")
    assert.equal(object.minecraftTexture, "cobblestone")
    assert.equal(object.minecraftVersion, null)
  })
})

describe("isModified", () => {
  for (const type of ["top", "bottom", "small"]) {
    test(`is false for every panel after resetting a ${type} object`, () => {
      for (const name of PANEL_NAMES) {
        const object = createObject({ type, hue: 50, depth: 1, rotationX: 9, wordScaleX: 3, overlayMode: "custom" })
        const context = { font: { depth: 30, border: 4, characterSpacing: 1 }, list: TEXTURES }
        resetPanel(object, name, context)
        assert.equal(isModified(object, name, context), false, name)
      }
    })
  }

  for (const type of ["top", "bottom", "small"]) {
    test(`is false for an opened ${type} object at its defaults`, () => {
      for (const name of PANEL_NAMES.filter(name => name !== "placement")) {
        assert.equal(isModified(createObject(typeDefaults(type)), name), false, name)
      }
    })
  }

  test("notices a changed value", () => {
    const object = createObject({ ...typeDefaults("top") })
    assert.equal(isModified(object, "colour"), false)
    object.hue = 10
    assert.equal(isModified(object, "colour"), true)
  })

  test("does not change the object", () => {
    const object = createObject({ ...typeDefaults("bottom"), hue: 10, depth: 9 })
    const before = snapshot(object)
    isModified(object, "colour")
    isModified(object, "geometry", { font: { depth: 30 } })
    isModified(object, "placement")
    assert.deepEqual(snapshot(object), before)
  })

  test("ignores the text", () => {
    assert.equal(isModified(createObject({ text: "anything" }), "text"), false)
  })

  test("compares against the font's values", () => {
    const object = createObject({ depth: 30, border: 4 })
    assert.equal(isModified(object, "geometry", { font: { depth: 30, border: 4 } }), false)
    assert.equal(isModified(object, "geometry"), true)
  })

  test("only looks at the current texture tab", () => {
    const object = createObject({ textureSource: "gradient", texture: "other" })
    assert.equal(isModified(object, "texture"), false)
    object.gradientAngle = 45
    assert.equal(isModified(object, "texture"), true)
  })

  test("compares stops by value", () => {
    const object = createObject({ type: "small", textureSource: "gradient", stops: SMALL_DEFAULTS.stops })
    assert.equal(isModified(object, "texture"), false)
    object.stops[1].position = 90
    assert.equal(isModified(object, "texture"), true)
  })

  test("can be limited to some keys", () => {
    const object = createObject({ rotationX: 10 })
    assert.equal(isModified(object, "transform", {}, transformKeys("rotation", false)), true)
    assert.equal(isModified(object, "transform", {}, transformKeys("scale", false)), false)
  })
})

describe("transform groups", () => {
  test("word scale keys leave out matchWidth", () => {
    assert.deepEqual(transformKeys("scale", true), ["wordScaleX", "wordScaleY", "wordLinkScale", "wordScaleMarked", "wordScaleZ", "wordScaleOutline"])
  })

  test("resetting a line group leaves the other groups", () => {
    const object = createObject({ matchWidth: 4, scaleX: 2, linkScale: 2, rotationX: 10, translateX: 5 })
    resetTransform(object, "scale")
    assert.equal(object.matchWidth, 4)
    assert.equal(object.scaleX, 1)
    assert.equal(object.linkScale, null)
    assert.equal(object.rotationX, 10)
    assert.equal(object.translateX, 5)
  })

  test("the match multiplies the sliders, and only reaches Y when asked", () => {
    assert.deepEqual(effectiveScale(createObject({ scaleX: 2, scaleY: 3, scaleZ: 4, matchScale: 1.5 })), [3, 3, 4])
    assert.deepEqual(effectiveScale(createObject({ scaleX: 2, scaleY: 3, scaleZ: 4, matchScale: 1.5, matchScaleY: true })), [3, 4.5, 4])
  })

  test("resetting the match leaves the scale", () => {
    const object = createObject({ matchWidth: 4, matchBottom: true, scaleX: 2 })
    resetTransform(object, "match")
    assert.equal(object.matchWidth, null)
    assert.equal(object.matchBottom, false)
    assert.equal(object.scaleX, 2)
  })

  test("resetting a word group leaves the line values", () => {
    const object = createObject({ wordRotationY: 10, rotationY: 20, wordTranslateY: 3 })
    resetTransform(object, "rotation", true)
    assert.equal(object.wordRotationY, 0)
    assert.equal(object.rotationY, 20)
    assert.equal(object.wordTranslateY, 3)
  })
})

describe("setTexture", () => {
  test("resets both overlay modes when something changes", () => {
    const object = createObject({ texture: "a", overlayMode: "custom", edgeOverlayMode: "custom" })
    setTexture(object, { texture: "b" })
    assert.equal(object.texture, "b")
    assert.equal(object.overlayMode, "default")
    assert.equal(object.edgeOverlayMode, "default")
  })

  test("keeps overlay modes when nothing changes", () => {
    const object = createObject({ texture: "a", textureVariant: null, overlayMode: "custom", edgeOverlayMode: "custom" })
    setTexture(object, { texture: "a", textureVariant: null })
    assert.equal(object.overlayMode, "custom")
    assert.equal(object.edgeOverlayMode, "custom")
  })

  test("applies every value when only one differs", () => {
    const object = createObject({ texture: "a", textureVariant: "old", overlayMode: "custom" })
    setTexture(object, { texture: "a", textureVariant: null })
    assert.equal(object.textureVariant, null)
    assert.equal(object.overlayMode, "default")
  })

  test("switching the source counts as a change", () => {
    const object = createObject({ edgeOverlayMode: "custom" })
    setTexture(object, { textureSource: "gradient" })
    assert.equal(object.textureSource, "gradient")
    assert.equal(object.edgeOverlayMode, "default")
  })
})

describe("overlays", () => {
  const list = {
    overlays: { scratches: { default: { opacity: 40 } }, dust: {} },
    edgeOverlays: { rim: {} },
    textures: {
      cracked: { overlays: [{ overlay: "scratches", blend: "screen" }], edgeOverlays: [{ overlay: "rim" }], variants: { old: { overlays: [{ overlay: "dust" }] } } },
      plain: {},
      broken: { overlays: [{ overlay: "missing" }] },
      rimless: { edgeOverlays: [{ overlay: "gone" }] }
    }
  }

  test("overlayLayer layers the definition's default over LAYER", () => {
    assert.deepEqual(overlayLayer("scratches", { default: { opacity: 40 } }), { ...LAYER, overlay: "scratches", opacity: 40 })
    assert.deepEqual(overlayLayer("dust"), { ...LAYER, overlay: "dust" })
  })

  test("overlayLayer does not share the definition's values", () => {
    const definition = { default: { points: [1, 2] } }
    overlayLayer("a", definition).points.push(3)
    assert.deepEqual(definition.default.points, [1, 2])
  })

  test("defaultOverlays merges LAYER, the definition and the texture's layer", () => {
    const object = createObject({ texture: "cracked" })
    assert.deepEqual(defaultOverlays(list, object, "overlays"), [{ ...LAYER, overlay: "scratches", opacity: 40, blend: "screen" }])
    assert.deepEqual(defaultOverlays(list, object, "edgeOverlays"), [{ ...LAYER, overlay: "rim" }])
  })

  test("defaultOverlays uses a variant's layers", () => {
    const object = createObject({ texture: "cracked", textureVariant: "old" })
    assert.deepEqual(defaultOverlays(list, object, "overlays"), [{ ...LAYER, overlay: "dust" }])
  })

  test("defaultOverlays is empty without a usable premade texture", () => {
    assert.deepEqual(defaultOverlays(null, createObject({ texture: "cracked" }), "overlays"), [])
    assert.deepEqual(defaultOverlays(list, createObject({ texture: "cracked", textureSource: "gradient" }), "overlays"), [])
    assert.deepEqual(defaultOverlays(list, createObject({ texture: "unknown" }), "overlays"), [])
    assert.deepEqual(defaultOverlays(list, createObject({ texture: "plain" }), "overlays"), [])
  })

  test("defaultOverlays names a missing overlay", () => {
    assert.throws(() => defaultOverlays(list, createObject({ texture: "broken" }), "overlays"), { message: "broken has a default overlay \"missing\" that this font does not have" })
    assert.throws(() => defaultOverlays(list, createObject({ texture: "rimless" }), "edgeOverlays"), { message: "rimless has a default edge overlay \"gone\" that does not exist" })
  })

  test("activeOverlays follows the mode", () => {
    const layers = [{ ...LAYER, overlay: "dust" }]
    const custom = createObject({ texture: "cracked", overlayMode: "custom", overlays: layers })
    const standard = createObject({ texture: "cracked", overlays: layers })
    assert.deepEqual(snapshot(custom).overlays, layers)
    assert.deepEqual(activeOverlays(list, custom, "overlays").map(layer => layer.overlay), ["dust"])
    assert.deepEqual(activeOverlays(list, standard, "overlays").map(layer => layer.overlay), ["scratches"])
  })
})

describe("texture lookups", () => {
  test("textureEntry merges a variant over its texture", () => {
    const list = { textures: { a: { author: "x", name: "A", variants: { b: { name: "B" } } } } }
    assert.equal(textureEntry(list, createObject({ texture: "a" })).name, "A")
    const merged = textureEntry(list, createObject({ texture: "a", textureVariant: "b" }))
    assert.equal(merged.name, "B")
    assert.equal(merged.author, "x")
    assert.equal(textureEntry(list, createObject({ texture: "c" })), null)
  })

  test("defaultTexture uses secondary only for bottom", () => {
    assert.equal(defaultTexture(TEXTURES, "top"), "cracked")
    assert.equal(defaultTexture(TEXTURES, "small"), "cracked")
    assert.equal(defaultTexture(TEXTURES, "bottom"), "fired")
  })

  test("pinnedTextures is flat, then the primary, then the secondary", () => {
    assert.deepEqual(pinnedTextures(TEXTURES), ["flat", "cracked", "fired"])
    assert.deepEqual(pinnedTextures({ primary: "stone", secondary: "gold", textures: { flat: {}, other: {}, gold: {}, stone: {} } }), ["flat", "stone", "gold"])
  })

  test("defaultTexture falls back to the second texture, then the first, then null", () => {
    assert.equal(defaultTexture({ primary: "x", textures: { flat: {}, stone: {} } }, "top"), "stone")
    assert.equal(defaultTexture({ primary: "x", textures: { flat: {} } }, "top"), "flat")
    assert.equal(defaultTexture({ primary: "x", textures: {} }, "top"), null)
  })
})

describe("font defaults", () => {
  test("spacing adds the font's character spacing to the type's", () => {
    assert.equal(defaultSpacing("top"), 0)
    assert.equal(defaultSpacing("small"), 2)
    assert.equal(defaultSpacing("small", { characterSpacing: 3 }), 5)
  })

  test("depth comes from the font when it has one", () => {
    assert.equal(defaultDepth(), 22)
    assert.equal(defaultDepth({ depth: 8 }), 8)
  })

  test("border comes from the font even when it is zero", () => {
    assert.equal(defaultBorder("small"), 3)
    assert.equal(defaultBorder("small", { border: 0 }), 0)
  })
})

describe("a new object", () => {
  for (const type of ["top", "bottom", "small"]) {
    for (const name of ["geometry", "faces", "inner", "sides"]) {
      test(`of type ${type} has an unmodified ${name} panel`, () => {
        const object = createObject({ type })
        assert.equal(isModified(object, name, { font: { depth: object.depth, border: object.border } }), false)
      })
    }

    test(`of type ${type} matches its type's fades`, () => {
      const object = createObject({ type })
      const defaults = typeDefaults(type)
      for (const key of ["fade", "outerFade", "internalFaces", "fadeInternal", "internalFade", "sideFaces", "fadeSides", "sideFade", "clipHoles"]) assert.equal(object[key], defaults[key], key)
    })
  }

  test("keeps values it was given", () => {
    const object = createObject({ fade: true, outerFade: 30, sideFade: 10 })
    assert.equal(object.fade, true)
    assert.equal(object.outerFade, 30)
    assert.equal(object.sideFade, 10)
  })
})
