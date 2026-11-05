import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

function withViteEnv(url, context, nextLoad) {
  const result = nextLoad(url, context)
  if (!url.endsWith("/src/lib/stats.js")) return result
  return { ...result, source: `import.meta.env = { DEV: true }\n${result.source}` }
}

registerHooks({ load: withViteEnv })

let fetchCalls = 0

function countFetch() {
  fetchCalls++
  throw new Error("fetch must not be called")
}

globalThis.fetch = countFetch
globalThis.localStorage = { getItem: () => null, setItem: () => {} }
mock.timers.enable({ apis: ["setTimeout"] })

const { LAYER, createObject, snapshot, typeDefaults } = await import("../src/lib/settings.js")
const { keepTexture, runtime, scene, validSelection } = await import("../src/lib/scene.js")
const { fileError, isDefaultTitle, openTitle, resetTitle, saveTitle } = await import("../src/lib/file.js")

const REAL_FILE = { format: "minecraft-title", version: 1, lines: [{ texture: "cracked" }, { type: "bottom", matchWidth: 0, scaleX: 0.7977, words: [{ text: "title", texture: "fired", hue: 359, customBorder: true, borderColour: "#230f00" }, { text: "generator", texture: "fired", hue: 180, customBorder: true, borderColour: "#001329", customEdge: true, edgeColour: "#11467d" }] }] }

const blobs = []
const downloads = []

function captureBlob(blob) {
  blobs.push(blob)
  return `blob:title-${blobs.length}`
}

function recordClick(link) {
  downloads.push({ name: link.download, href: link.href })
}

URL.createObjectURL = captureBlob
URL.revokeObjectURL = () => {}
globalThis.document = { createElement: () => ({ click() { recordClick(this) } }) }

function fileOf(content, name = "test.mctitle") {
  return { name, text: async () => typeof content === "string" ? content : JSON.stringify(content) }
}

function title(lines, extra = {}) {
  return { format: "minecraft-title", version: 1, lines, ...extra }
}

function make(type, values = {}) {
  return createObject({ ...typeDefaults(type), ...values })
}

function setScene(...objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
}

async function save() {
  saveTitle()
  return JSON.parse(await blobs[blobs.length - 1].text())
}

async function savedLines(...objects) {
  setScene(...objects)
  return (await save()).lines
}

async function open(lines) {
  await openTitle(fileOf(title(lines)))
  assert.equal(fileError.value, null)
  return scene.objects
}

function normalised() {
  return scene.objects.map(object => ({ ...snapshot(object), matchWidth: scene.objects.findIndex(other => other.id === object.matchWidth), group: object.group === null ? -1 : scene.objects.findIndex(other => other.group === object.group) }))
}

beforeEach(() => {
  fileError.value = null
  setScene(createObject({ text: "before" }))
})

describe("the real title file", () => {
  test("opens with the settings it was saved with", async () => {
    await openTitle(fileOf(REAL_FILE))
    assert.equal(fileError.value, null)
    assert.equal(scene.objects.length, 3)
    const [first, word, generator] = scene.objects
    assert.deepEqual(snapshot(first), { ...typeDefaults("top"), texture: "cracked" })
    assert.deepEqual(snapshot(word), { ...typeDefaults("bottom"), text: "title", texture: "fired", hue: 359, customBorder: true, borderColour: "#230f00", matchWidth: first.id, scaleX: 0.7977, group: word.group })
    assert.deepEqual(snapshot(generator), { ...typeDefaults("bottom"), text: "generator", texture: "fired", hue: 180, customBorder: true, borderColour: "#001329", customEdge: true, edgeColour: "#11467d", matchWidth: first.id, scaleX: 0.7977, group: word.group })
    assert.notEqual(word.group, null)
    assert.equal(scene.selected, first.id)
    assert.equal(scene.selectedGroup, null)
  })

  test("saves back without the scale that gets solved", async () => {
    await openTitle(fileOf(REAL_FILE))
    const saved = await save()
    assert.deepEqual(saved, { format: "minecraft-title", version: 2, lines: [{ texture: "cracked" }, { type: "bottom", matchWidth: 0, words: [{ text: "title", texture: "fired", hue: 359, customBorder: true, borderColour: "#230f00" }, { text: "generator", texture: "fired", hue: 180, customBorder: true, borderColour: "#001329", customEdge: true, edgeColour: "#11467d" }] }] })
  })

  test("opens the same after saving", async () => {
    await openTitle(fileOf(REAL_FILE))
    const before = normalised().map(({ scaleX, ...values }) => values)
    const saved = await save()
    await openTitle(fileOf(saved))
    assert.equal(fileError.value, null)
    assert.deepEqual(normalised().map(({ scaleX, ...values }) => values), before)
  })
})

describe("saving trims settings", () => {
  test("a brand new title saves an empty line", async () => {
    setScene(createObject())
    assert.deepEqual(await save(), { format: "minecraft-title", version: 2, lines: [{}] })
  })

  test("an object at its type defaults saves only its type", async () => {
    assert.deepEqual(await savedLines(make("top")), [{}])
    assert.deepEqual(await savedLines(make("bottom")), [{ type: "bottom" }])
    assert.deepEqual(await savedLines(make("small")), [{ type: "small" }])
  })

  test("only values that differ are saved", async () => {
    assert.deepEqual(await savedLines(make("top", { text: "hello", hue: 0, saturation: 50 })), [{ text: "hello", saturation: 50 }])
  })

  test("defaults are compared against the object's own type", async () => {
    assert.deepEqual(await savedLines(make("bottom", { fade: false })), [{ type: "bottom", fade: false }])
    assert.deepEqual(await savedLines(make("top", { fade: true, outerFade: 50 })), [{ fade: true, outerFade: 50 }])
    assert.deepEqual(await savedLines(make("bottom", { fade: true, outerFade: 50 })), [{ type: "bottom" }])
    assert.deepEqual(await savedLines(make("small", { border: 2 })), [{ type: "small", border: 2 }])
    assert.deepEqual(await savedLines(make("top", { clipHoles: false })), [{ clipHoles: false }])
    assert.deepEqual(await savedLines(make("small", { clipHoles: true })), [{ type: "small", clipHoles: true }])
  })

  test("only the settings of the current texture source are saved", async () => {
    const stops = [{ colour: "#000000", position: 0 }]
    const values = { texture: "a", textureVariant: "b", tileable: "dirt", tileableVariant: "c", tileableScale: 5, tileableRandomMirroring: true, stops, smooth: false, gradientAngle: 10, disableFontOverlay: true }
    assert.deepEqual(await savedLines(make("top", values)), [{ texture: "a", textureVariant: "b" }])
    assert.deepEqual(await savedLines(make("top", { ...values, textureSource: "tileable" })), [{ textureSource: "tileable", tileable: "dirt", tileableVariant: "c", tileableScale: 5, tileableRandomMirroring: true, disableFontOverlay: true }])
    assert.deepEqual(await savedLines(make("top", { ...values, textureSource: "gradient" })), [{ textureSource: "gradient", stops, smooth: false, gradientAngle: 10, disableFontOverlay: true }])
  })

  test("only the settings of the current tileable source are saved", async () => {
    const values = { textureSource: "tileable", tileable: "dirt", tileableVariant: "c", minecraftTexture: "stone", minecraftVersion: "1.8.9" }
    assert.deepEqual(await savedLines(make("top", values)), [{ textureSource: "tileable", tileable: "dirt", tileableVariant: "c" }])
    assert.deepEqual(await savedLines(make("top", { ...values, tileableSource: "minecraft" })), [{ textureSource: "tileable", tileableSource: "minecraft", minecraftTexture: "stone", minecraftVersion: "1.8.9" }])
    assert.deepEqual(await savedLines(make("top", { ...values, textureSource: "premade", texture: "a", tileableSource: "minecraft" })), [{ texture: "a" }])
  })

  test("overlay layers are only saved in custom mode", async () => {
    const layers = [{ ...LAYER, overlay: "dust" }]
    assert.deepEqual(await savedLines(make("top", { overlays: layers, edgeOverlays: layers })), [{}])
    assert.deepEqual(await savedLines(make("top", { overlayMode: "custom", overlays: layers, edgeOverlays: layers })), [{ overlayMode: "custom", overlays: [{ overlay: "dust" }] }])
    assert.deepEqual(await savedLines(make("top", { edgeOverlayMode: "custom", overlays: layers, edgeOverlays: layers })), [{ edgeOverlayMode: "custom", edgeOverlays: [{ overlay: "dust" }] }])
  })

  test("custom colours are only saved when switched on", async () => {
    assert.deepEqual(await savedLines(make("top", { borderColour: "#111111", edgeColour: "#222222" })), [{}])
    assert.deepEqual(await savedLines(make("top", { customBorder: true, borderColour: "#111111", customEdge: true, edgeColour: "#222222" })), [{ customBorder: true, borderColour: "#111111", customEdge: true, edgeColour: "#222222" }])
  })

  test("the outer fade is only saved when fading", async () => {
    assert.deepEqual(await savedLines(make("top", { outerFade: 90 })), [{}])
    assert.deepEqual(await savedLines(make("top", { fade: true, outerFade: 90 })), [{ fade: true, outerFade: 90 }])
  })

  test("inner face settings are only saved when inner faces are on", async () => {
    const values = { fadeInternal: false, internalFade: 40, customInternal: true, internalColour: "#111111", internalBrightness: 1 }
    assert.deepEqual(await savedLines(make("top", values)), [{}])
    assert.deepEqual(await savedLines(make("top", { ...values, internalFaces: true })), [{ internalFaces: true, fadeInternal: false, customInternal: true, internalColour: "#111111", internalBrightness: 1 }])
    assert.deepEqual(await savedLines(make("top", { internalFaces: true, internalFade: 40, internalColour: "#111111" })), [{ internalFaces: true, internalFade: 40 }])
  })

  test("side face settings are only saved when side faces are on", async () => {
    const values = { fadeSides: false, sideFade: 40, customSide: true, sideColour: "#111111", sideBrightness: 1 }
    assert.deepEqual(await savedLines(make("top", values)), [{}])
    assert.deepEqual(await savedLines(make("top", { ...values, sideFaces: true })), [{ sideFaces: true, fadeSides: false, customSide: true, sideColour: "#111111", sideBrightness: 1 }])
    assert.deepEqual(await savedLines(make("top", { sideFaces: true, sideFade: 40, sideColour: "#111111" })), [{ sideFaces: true, sideFade: 40 }])
  })

  test("arc settings follow the arc mode", async () => {
    const values = { arcTop: 3, arcBottom: 2, arcMove: 5, arcMarked: false, arcGradient: true }
    assert.deepEqual(await savedLines(make("top", values)), [{ arcTop: 3, arcBottom: 2, arcMarked: false, arcGradient: true }])
    assert.deepEqual(await savedLines(make("top", { ...values, arcMode: "move" })), [{ arcMode: "move", arcMove: 5 }])
  })

  test("word arc settings follow the word arc mode", async () => {
    const values = { wordArcTop: 3, wordArcBottom: 2, wordArcMove: 5, wordArcMarked: false }
    assert.deepEqual(await savedLines(make("top", values)), [{ wordArcTop: 3, wordArcBottom: 2, wordArcMarked: false }])
    assert.deepEqual(await savedLines(make("top", { ...values, wordArcMode: "move" })), [{ wordArcMode: "move", wordArcMove: 5 }])
  })

  test("a solved scale is left out", async () => {
    const reference = make("top")
    const target = make("bottom", { matchWidth: reference.id, scaleX: 1.5, scaleY: 2 })
    assert.deepEqual(await savedLines(reference, target), [{}, { type: "bottom", matchWidth: 0, scaleY: 2 }])
  })

  test("a solved linked scale leaves out both axes", async () => {
    const reference = make("top")
    const target = make("bottom", { matchWidth: reference.id, linkScale: 1.5, scaleX: 2, scaleY: 3 })
    assert.deepEqual(await savedLines(reference, target), [{}, { type: "bottom", matchWidth: 0, linkScale: 1.5 }])
  })

  test("a scale matched to a hidden line is kept", async () => {
    const reference = make("top", { hidden: true })
    const target = make("bottom", { matchWidth: reference.id, linkScale: 1.5, scaleX: 2, scaleY: 3 })
    assert.deepEqual(await savedLines(reference, target), [{ hidden: true }, { type: "bottom", matchWidth: 0, linkScale: 1.5, scaleX: 2, scaleY: 3 }])
  })

  test("a chain is solved by whether its last line is visible", async () => {
    const end = make("top", { hidden: true })
    const middle = make("top", { matchWidth: end.id, scaleX: 2 })
    const start = make("top", { matchWidth: middle.id, scaleX: 3 })
    assert.deepEqual(await savedLines(start, middle, end), [{ matchWidth: 1, scaleX: 3 }, { matchWidth: 2, scaleX: 2 }, { hidden: true }])
    end.hidden = false
    assert.deepEqual((await save()).lines, [{ matchWidth: 1 }, { matchWidth: 2 }, {}])
  })
})

describe("saving multi-word lines", () => {
  test("line settings go on the line and word settings on the words", async () => {
    const line = { group: 7, depth: 30, border: 4 }
    const lines = await savedLines(make("top", { ...line, text: "a", texture: "x" }), make("top", { ...line, text: "b", spaceBefore: false, texture: "y", hue: 10 }), make("top", { ...line, text: "c" }))
    assert.deepEqual(lines, [{ depth: 30, border: 4, words: [{ text: "a", texture: "x" }, { text: "b", spaceBefore: false, texture: "y", hue: 10 }, { text: "c" }] }])
  })

  test("the first word's line settings stand for the line", async () => {
    const lines = await savedLines(make("top", { group: 7, text: "a", depth: 30 }), make("top", { group: 7, text: "b", depth: 40 }))
    assert.deepEqual(lines, [{ depth: 30, words: [{ text: "a" }, { text: "b" }] }])
  })

  test("the type goes on the line", async () => {
    const lines = await savedLines(make("bottom", { group: 7, text: "a" }), make("bottom", { group: 7, text: "b" }))
    assert.deepEqual(lines, [{ type: "bottom", words: [{ text: "a" }, { text: "b" }] }])
  })

  test("different groups stay separate lines", async () => {
    const lines = await savedLines(make("top", { group: 1, text: "a" }), make("top", { group: 1, text: "b" }), make("top", { group: 2, text: "c" }), make("top", { group: 2, text: "d" }), make("top", { text: "e" }))
    assert.deepEqual(lines, [{ words: [{ text: "a" }, { text: "b" }] }, { words: [{ text: "c" }, { text: "d" }] }, { text: "e" }])
  })

  test("a word's unused settings are judged by that word", async () => {
    const lines = await savedLines(make("top", { group: 1, text: "a", customBorder: true, borderColour: "#111111" }), make("top", { group: 1, text: "b", borderColour: "#222222" }))
    assert.deepEqual(lines, [{ words: [{ text: "a", customBorder: true, borderColour: "#111111" }, { text: "b" }] }])
  })
})

describe("matchWidth indexes", () => {
  test("saving turns ids into line numbers", async () => {
    const reference = make("top", { text: "a", group: 5 })
    const second = make("top", { text: "b", group: 5 })
    const third = make("top", { text: "c", matchWidth: reference.id })
    assert.deepEqual(await savedLines(reference, second, third), [{ words: [{ text: "a" }, { text: "b" }] }, { text: "c", matchWidth: 0 }])
  })

  test("saving counts lines rather than words", async () => {
    const reference = make("top", { text: "r" })
    const lines = await savedLines(make("top", { group: 5, text: "a" }), make("top", { group: 5, text: "b" }), reference, make("top", { text: "c", matchWidth: reference.id }))
    assert.equal(lines[1].text, "r")
    assert.equal(lines[1].matchWidth, undefined)
    assert.equal(lines[2].matchWidth, 1)
  })

  test("saving handles a line matching a later line", async () => {
    const later = make("top", { text: "later" })
    const lines = await savedLines(make("top", { text: "early", matchWidth: later.id }), later)
    assert.equal(lines[0].matchWidth, 1)
  })

  test("saving a matched multi-word line puts the number on the line", async () => {
    const reference = make("top", { text: "r" })
    const lines = await savedLines(reference, make("top", { group: 5, text: "a", matchWidth: reference.id }), make("top", { group: 5, text: "b", matchWidth: reference.id }))
    assert.deepEqual(lines[1], { matchWidth: 0, words: [{ text: "a" }, { text: "b" }] })
  })

  test("opening turns line numbers into ids", async () => {
    const [first, second] = await open([{ text: "first" }, { text: "second", matchWidth: 0 }])
    assert.equal(second.matchWidth, first.id)
    assert.equal(first.matchWidth, null)
  })

  test("opening points at the first word of a line", async () => {
    const [a, , c] = await open([{ words: [{ text: "a" }, { text: "b" }] }, { text: "c", matchWidth: 0 }])
    assert.equal(c.matchWidth, a.id)
  })

  test("opening counts lines rather than words", async () => {
    const objects = await open([{ words: [{ text: "a" }, { text: "b" }] }, { text: "c" }, { text: "d", matchWidth: 1 }])
    assert.equal(objects[3].matchWidth, objects[2].id)
  })

  test("opening gives every word of a matched line the same reference", async () => {
    const [reference, a, b] = await open([{ text: "r" }, { matchWidth: 0, words: [{ text: "a" }, { text: "b" }] }])
    assert.equal(a.matchWidth, reference.id)
    assert.equal(b.matchWidth, reference.id)
  })

  test("opening handles a line matching a later line", async () => {
    const [early, later] = await open([{ matchWidth: 1 }, {}])
    assert.equal(early.matchWidth, later.id)
    assert.equal(later.matchWidth, null)
  })

  test("a chain of matches survives saving and opening", async () => {
    await open([{ text: "a", matchWidth: 1 }, { text: "b", matchWidth: 2 }, { text: "c" }])
    const saved = await save()
    assert.deepEqual(saved.lines, [{ text: "a", matchWidth: 1 }, { text: "b", matchWidth: 2 }, { text: "c" }])
    const [a, b, c] = await open(saved.lines)
    assert.equal(a.matchWidth, b.id)
    assert.equal(b.matchWidth, c.id)
  })
})

describe("overlay layers", () => {
  test("saving trims each layer to what differs from LAYER", async () => {
    const lines = await savedLines(make("top", {
      overlayMode: "custom",
      overlays: [{ ...LAYER, overlay: "scratches" }, { ...LAYER, overlay: "dust", opacity: 50, blend: "screen", size: 3 }],
      edgeOverlayMode: "custom",
      edgeOverlays: [{ ...LAYER, overlay: "rim", source: "upload", file: "data:image/png;base64,AA", colour: "#123456", colourBlend: "screen" }]
    }))
    assert.deepEqual(lines, [{
      overlayMode: "custom",
      overlays: [{ overlay: "scratches" }, { overlay: "dust", opacity: 50, blend: "screen", size: 3 }],
      edgeOverlayMode: "custom",
      edgeOverlays: [{ overlay: "rim", source: "upload", file: "data:image/png;base64,AA", colour: "#123456", colourBlend: "screen" }]
    }])
  })

  test("opening fills each layer back in", async () => {
    const [object] = await open([{ overlayMode: "custom", overlays: [{ overlay: "dust", opacity: 50, size: 3 }], edgeOverlayMode: "custom", edgeOverlays: [{ overlay: "rim" }] }])
    assert.deepEqual(snapshot(object).overlays, [{ ...LAYER, overlay: "dust", opacity: 50, size: 3 }])
    assert.deepEqual(snapshot(object).edgeOverlays, [{ ...LAYER, overlay: "rim" }])
  })

  test("saving does not change the layers in the scene", async () => {
    const overlays = [{ ...LAYER, overlay: "dust" }]
    setScene(make("top", { overlayMode: "custom", overlays }))
    await save()
    assert.deepEqual(snapshot(scene.objects[0]).overlays, overlays)
  })
})

describe("opening", () => {
  test("missing settings take the line's type defaults", async () => {
    const [top, bottom, small] = await open([{}, { type: "bottom" }, { type: "small" }])
    assert.deepEqual(snapshot(top), typeDefaults("top"))
    assert.deepEqual(snapshot(bottom), typeDefaults("bottom"))
    assert.deepEqual(snapshot(small), typeDefaults("small"))
  })

  test("clipHoles from the file wins over the type", async () => {
    const [small, top] = await open([{ type: "small", clipHoles: true }, { clipHoles: false }])
    assert.equal(small.clipHoles, true)
    assert.equal(top.clipHoles, false)
  })

  test("a single word line has no group", async () => {
    const [object] = await open([{ text: "solo" }])
    assert.equal(object.group, null)
  })

  test("words share a group and take the line's settings", async () => {
    const [a, b, c] = await open([{ type: "bottom", depth: 30, words: [{ text: "a" }, { text: "b", spaceBefore: false }] }, { words: [{ text: "c" }] }])
    assert.notEqual(a.group, null)
    assert.equal(a.group, b.group)
    assert.notEqual(c.group, a.group)
    assert.equal(a.type, "bottom")
    assert.equal(b.type, "bottom")
    assert.equal(b.depth, 30)
    assert.equal(b.fade, true)
    assert.equal(a.spaceBefore, true)
    assert.equal(b.spaceBefore, false)
  })

  test("a word's setting wins over the line's", async () => {
    const [a, b] = await open([{ texture: "line", words: [{ text: "a" }, { text: "b", texture: "word" }] }])
    assert.equal(a.texture, "line")
    assert.equal(b.texture, "word")
  })

  test("unknown settings are ignored", async () => {
    const [object] = await open([{ text: "hi", notARealSetting: 5 }])
    assert.equal("notARealSetting" in object, false)
    assert.equal(object.text, "hi")
  })

  test("a tileable from before version 2 keeps restarting on each character", async () => {
    await openTitle(fileOf(title([{ text: "old", textureSource: "tileable" }, { words: [{ text: "a", textureSource: "tileable" }, { text: "b" }] }, { text: "plain" }])))
    assert.deepEqual(scene.objects.map(object => object.tileablePerCharacter), [true, true, false, false])
    await openTitle(fileOf({ format: "minecraft-title", lines: [{ text: "no version", textureSource: "tileable" }] }))
    assert.equal(scene.objects[0].tileablePerCharacter, true)
  })

  test("a tileable from version 2 keeps its own setting", async () => {
    await openTitle(fileOf(title([{ text: "new", textureSource: "tileable" }], { version: 2 })))
    assert.equal(scene.objects[0].tileablePerCharacter, false)
  })

  test("an old title's own per character setting is not overwritten", async () => {
    await openTitle(fileOf(title([{ text: "own", textureSource: "tileable", tileablePerCharacter: false }])))
    assert.equal(scene.objects[0].tileablePerCharacter, false)
  })

  test("a file without a version or from an older one opens", async () => {
    await openTitle(fileOf({ format: "minecraft-title", lines: [{ text: "no version" }] }))
    assert.equal(scene.objects[0].text, "no version")
    await openTitle(fileOf(title([{ text: "older" }], { version: 0 })))
    assert.equal(scene.objects[0].text, "older")
    assert.equal(fileError.value, null)
  })

  test("objects get new unique ids and keep their textures", async () => {
    const before = scene.objects[0].id
    const objects = await open([{ text: "a" }, { words: [{ text: "b" }, { text: "c" }] }])
    const ids = objects.map(object => object.id)
    assert.equal(new Set(ids).size, 3)
    assert.equal(ids.includes(before), false)
    assert.ok(objects.every(object => keepTexture.has(object)))
  })

  test("selects the first object and clears the group selection", async () => {
    const group = createObject({ group: 9 })
    setScene(group, createObject({ group: 9 }))
    scene.selected = group.id
    scene.selectedGroup = 9
    const [first] = await open([{ text: "a" }, { text: "b" }])
    assert.equal(scene.selected, first.id)
    assert.equal(scene.selectedGroup, null)
  })

  test("clears an earlier error", async () => {
    fileError.value = "old"
    await openTitle(fileOf(title([{}])))
    assert.equal(fileError.value, null)
  })

  test("declining the allow check leaves the scene alone", async () => {
    const before = scene.objects[0]
    fileError.value = "old"
    await openTitle(fileOf(title([{ text: "new" }])), () => false)
    assert.equal(scene.objects.length, 1)
    assert.equal(scene.objects[0], before)
    assert.equal(fileError.value, "old")
  })
})

describe("rejected files", () => {
  const CASES = [
    ["invalid JSON", "{ nope", "Couldn't open test.mctitle: this isn't a Minecraft title file"],
    ["a JSON null", "null", "Couldn't open test.mctitle: this isn't a Minecraft title file"],
    ["another format", { format: "something-else", version: 1, lines: [{}] }, "Couldn't open test.mctitle: this isn't a Minecraft title file"],
    ["no format", { version: 1, lines: [{}] }, "Couldn't open test.mctitle: this isn't a Minecraft title file"],
    ["a newer version", title([{}], { version: 3 }), "Couldn't open test.mctitle: it was saved by a newer version of the generator (format 3)"],
    ["no lines key", { format: "minecraft-title", version: 1 }, "Couldn't open test.mctitle: it has no text in it"],
    ["empty lines", title([]), "Couldn't open test.mctitle: it has no text in it"],
    ["lines that are not a list", title("words"), "Couldn't open test.mctitle: it has no text in it"],
    ["a matchWidth past the end", title([{}, { matchWidth: 2 }]), "Couldn't open test.mctitle: a line matches the width of line 2, which doesn't exist"],
    ["a negative matchWidth", title([{ matchWidth: -1 }]), "Couldn't open test.mctitle: a line matches the width of line -1, which doesn't exist"],
    ["a line matching itself", title([{}, { matchWidth: 1 }]), "Couldn't open test.mctitle: line 1 matches its own width"],
    ["two lines matching each other", title([{ matchWidth: 1 }, { matchWidth: 0 }]), "Couldn't open test.mctitle: line 0 matches its own width"],
    ["a longer loop", title([{ matchWidth: 1 }, { matchWidth: 2 }, { matchWidth: 0 }]), "Couldn't open test.mctitle: line 0 matches its own width"],
    ["a line leading into a loop", title([{ matchWidth: 1 }, { matchWidth: 2 }, { matchWidth: 1 }]), "Couldn't open test.mctitle: line 0 matches its own width"],
    ["empty words", title([{ words: [] }]), "Couldn't open test.mctitle: a line has no words in it"],
    ["words that are not a list", title([{ words: "hello" }]), "Couldn't open test.mctitle: a line has no words in it"]
  ]

  for (const [name, content, message] of CASES) {
    test(`${name} shows an error and changes nothing`, async () => {
      const before = scene.objects[0]
      let asked = 0
      await openTitle(fileOf(content), () => {
        asked++
        return true
      })
      assert.equal(fileError.value, message)
      assert.equal(asked, 0)
      assert.equal(scene.objects.length, 1)
      assert.equal(scene.objects[0], before)
    })
  }

  test("the error names the file", async () => {
    await openTitle(fileOf("nope", "my title.mctitle"))
    assert.equal(fileError.value, "Couldn't open my title.mctitle: this isn't a Minecraft title file")
  })

  test("a matchWidth of zero is not treated as missing", async () => {
    await openTitle(fileOf(title([{}, { matchWidth: 0 }])))
    assert.equal(fileError.value, null)
    assert.equal(scene.objects[1].matchWidth, scene.objects[0].id)
  })
})

describe("saving then reopening", () => {
  function richScene() {
    const first = make("top", { text: "Minecraft", texture: "cracked", textureVariant: "old", hue: 20, font: "other-font", rowSpacing: 3, rotationX: 10, translateY: -4, kerning: false, terminators: true })
    const words = { group: 11, row: 1, depth: 30, matchWidth: first.id, scaleY: 1.4, arcMode: "move", arcMove: 12 }
    const a = make("bottom", { ...words, text: "update", texture: "fired", overlayMode: "custom", overlays: [{ ...LAYER, overlay: "dust", opacity: 50 }], wordScaleX: 1.2, wordDepth: 10 })
    const b = make("bottom", { ...words, text: "two", spaceBefore: false, texture: "gold", edgeOverlayMode: "custom", edgeOverlays: [{ ...LAYER, overlay: "rim", size: 2 }], wordArcMode: "move", wordArcMove: 4 })
    const hidden = make("small", { text: "edition", hidden: true, textureSource: "gradient", stops: [{ colour: "#000000", position: 10 }, { colour: "#FFFFFF", position: 90 }], smooth: false, gradientAngle: 45, disableFontOverlay: true, scaleX: 1.25, clipHoles: true })
    const last = make("top", { text: "end", textureSource: "tileable", tileable: "dirt", tileableVariant: "coarse", tileableScale: 4, tileableXOffset: 3, matchWidth: hidden.id, scaleX: 1.5, linkScale: 2, scaleY: 3, internalFaces: true, internalFade: 40, customInternal: true, internalColour: "#111111", sideFaces: true, fadeSides: false, customEdge: true, edgeColour: "#222222", fade: true, outerFade: 25, arcTop: 6, arcGradient: true })
    return [first, a, b, hidden, last]
  }

  test("gives back the same title", async () => {
    setScene(...richScene())
    const before = normalised()
    await openTitle(fileOf(await save()))
    assert.equal(fileError.value, null)
    assert.deepEqual(normalised(), before)
  })

  test("saving again writes the same file", async () => {
    setScene(...richScene())
    const first = await save()
    await openTitle(fileOf(first))
    assert.deepEqual(await save(), first)
  })

  test("settings that were not saved go back to their defaults", async () => {
    setScene(make("top", { textureSource: "gradient", texture: "lost", borderColour: "#111111" }))
    await openTitle(fileOf(await save()))
    assert.equal(scene.objects[0].texture, null)
    assert.equal(scene.objects[0].borderColour, "#000000")
  })
})

describe("saveTitle", () => {
  test("downloads the title under its file name", async () => {
    setScene(make("top", { text: "Hello World" }))
    await save()
    const last = downloads[downloads.length - 1]
    assert.equal(last.name, "hello_world.mctitle")
    assert.equal(last.href, `blob:title-${blobs.length}`)
    assert.equal(blobs[blobs.length - 1].type, "application/json")
  })

  test("clears an earlier error and never reaches the network", async () => {
    fileError.value = "old"
    await save()
    assert.equal(fileError.value, null)
    assert.equal(fetchCalls, 0)
  })
})

describe("resetTitle", () => {
  test("goes back to one default object", () => {
    setScene(make("top", { text: "a" }), make("top", { text: "b" }))
    fileError.value = "old"
    resetTitle()
    assert.equal(scene.objects.length, 1)
    assert.equal(scene.objects[0].text, "minecraft")
    assert.equal(scene.selected, scene.objects[0].id)
    assert.equal(scene.selectedGroup, null)
    assert.equal(fileError.value, null)
  })
})

describe("isDefaultTitle", () => {
  const list = { primary: "cracked", secondary: "fired", textures: { flat: {}, cracked: {}, fired: {} } }
  const font = { depth: 30, border: 4, characterSpacing: 1 }

  function loaded(values = {}) {
    const object = createObject({ texture: "cracked", depth: 30, border: 4, spacing: 1, ...values })
    runtime[object.id] = { list, font }
    setScene(object)
    return object
  }

  test("is true for the untouched default with the font's values", () => {
    loaded()
    assert.equal(isDefaultTitle(), true)
  })

  test("is false once a setting is changed", () => {
    loaded({ hue: 10 })
    assert.equal(isDefaultTitle(), false)
  })

  test("is false for a different texture", () => {
    loaded({ texture: "fired" })
    assert.equal(isDefaultTitle(), false)
  })

  test("is false with more than one object", () => {
    const object = loaded()
    setScene(object, createObject())
    assert.equal(isDefaultTitle(), false)
  })

  test("is false before the font has loaded", () => {
    setScene(createObject({ texture: "cracked" }))
    assert.equal(isDefaultTitle(), false)
  })
})

describe("words that set matchWidth", () => {
  test("are rejected even when they point at their own line", async () => {
    setScene(createObject({ text: "kept" }))
    await openTitle(fileOf(title([{ words: [{ text: "a", matchWidth: 0 }] }])))
    assert.equal(fileError.value, "Couldn't open test.mctitle: a word sets matchWidth, which only a line can have")
    assert.equal(scene.objects[0].text, "kept")
  })

  test("are rejected when they point at a missing line", async () => {
    await openTitle(fileOf(title([{ words: [{ matchWidth: 5 }] }])))
    assert.equal(fileError.value, "Couldn't open test.mctitle: a word sets matchWidth, which only a line can have")
  })

  test("a line that sets it for its words still opens", async () => {
    await open([{ text: "top" }, { matchWidth: 0, words: [{ text: "a" }, { text: "b" }] }])
    assert.equal(scene.objects[1].matchWidth, scene.objects[0].id)
    assert.equal(scene.objects[2].matchWidth, scene.objects[0].id)
  })
})

describe("saving with no text", () => {
  test("writes no file", () => {
    setScene()
    const before = downloads.length
    saveTitle()
    assert.equal(downloads.length, before)
  })
})
