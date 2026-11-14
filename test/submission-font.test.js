import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { PNG } from "pngjs"
import { publishedFonts, readMask } from "../generator/fonts.js"
import { prepare } from "../generator/submissionKinds/font.js"
import { flattenFonts, fullOrder, parseMask, sheetLayout, solidMask, splitCells } from "../src/lib/font.js"
import { addCharacters, autoStretch, buildSheet, depthCode, exportJson, fontFromPublished, parsedSheet, setGlyph, setLetterCase, stripTexture } from "../src/lib/fontEditor.js"
import { flatLayers, layerSlices } from "../src/lib/flatSheet.js"
import { jsonText } from "../src/lib/jsonText.js"
import { titleCase } from "../src/lib/names.js"
import { font as kind } from "../src/lib/submissionKinds/font.js"
import { drawnCells, fontJsonFields, ownFont, submittedFont } from "../src/lib/submissionKinds/fontBuild.js"
import { decodePng, encodePng } from "../src/lib/submissionKinds/png.js"
import { font as client } from "../src/submissions/kinds/font.js"
import { defaultBorder, defaultDepth } from "../src/lib/settings.js"
import { pngOf } from "./helpers/png.js"
import { context, sendForm, serverEnv, signIn } from "./helpers/server.js"
import { publicContext } from "./helpers/site.js"

const { editSubmission } = await import("../src/server/submissions.js")

const LIST = "public/font/fonts.json"
const published = publishedFonts()
const fonts = published.map(entry => ({ ...entry, name: entry.name ?? titleCase(entry.id) }))

function copyOf(id) {
  const entry = published.find(item => item.id === id)
  const { png, cells } = readMask(entry, published)
  const zero = parseMask(png.data, png.width, png.height, cells.map(cell => cell.char).join(""), 0)
  const { glyphs } = splitCells(entry, published, zero.list)
  return fontFromPublished({ ...entry, name: entry.name ?? entry.id }, Object.values(glyphs), zero.capHeight)
}

function pngBytes({ width, height, data }) {
  const png = new PNG({ width, height })
  png.data.set(data)
  return PNG.sync.write(png)
}

function plainPng(width, height) {
  return new Uint8Array(pngOf(width, height))
}

function jsonOf(font, id = "test-font") {
  return new TextEncoder().encode(`${jsonText(exportJson({ ...font, id }, `data:image/png;base64,${pngBytes(buildSheet(font)).toString("base64")}`))}\n`)
}

function withFields(bytes, fields) {
  return new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(bytes)), ...fields }))
}

const ctx = publicContext(fonts)

function check(input) {
  return kind.check({ target: "", details: {}, bytes: null, files: {}, ...input }, ctx)
}

const f8thful = jsonOf(copyOf("f8thful"))

function without(chars) {
  const font = copyOf("f8thful")
  return jsonOf({ ...font, glyphs: { ...font.glyphs, ...Object.fromEntries(chars.map(char => [char, { ...font.glyphs[char], rows: font.glyphs[char].rows.map(row => "0".repeat(row.length)) }])) } })
}

describe("checking a font", () => {
  test("decodes the PNGs the repo uses, palette, grey and colour key ones included", () => {
    for (const file of ["public/font/minecraft-ten/font.png", "public/font/minecraft-ten/textures/haunted.png", "public/font/f8thful/textures/flat.png"]) {
      const bytes = fs.readFileSync(file)
      assert.ok(Buffer.from(decodePng(new Uint8Array(bytes)).data).equals(PNG.sync.read(bytes).data), file)
    }
  })

  test("a whole font from the font editor passes and gets its template size", async () => {
    const { problems, details, target } = await check({ bytes: f8thful })
    assert.deepEqual(Object.values(problems).filter(Boolean), [])
    assert.equal(target, "")
    assert.deepEqual(details, { id: "test-font", template: { width: 566, height: 356, rows: 92 } })
  })

  test("the id comes from the JSON, and has to be a slug no published font has", async () => {
    assert.equal((await check({ bytes: withFields(f8thful, { id: "f8thful" }) })).problems.id, "F8thful already has the ID f8thful. Change it in the font editor's Font tab.")
    assert.match((await check({ bytes: withFields(f8thful, { id: "My Font" }) })).problems.id, /lowercase letters and numbers/)
    assert.match((await check({ bytes: withFields(f8thful, { id: "custom-thing" }) })).problems.id, /kept for the site/)
    assert.equal((await check({ bytes: withFields(f8thful, { id: "", name: "Shiny Font" }) })).details.id, "shiny-font")
    assert.match((await check({ bytes: withFields(f8thful, { id: "", name: "" }) })).problems.id, /The font has no ID/)
    assert.equal((await check({ bytes: f8thful, details: { id: "forged" } })).details.id, "test-font")
    assert.equal((await check({ details: { id: "kept-from-before" } })).problems.id, null)
  })

  test("a new font needs every default character, and the blank ones are named", async () => {
    assert.equal((await check({ bytes: without(["q"]) })).problems.file, "A new font has to have every default character drawn. These are blank: Q.")
    assert.equal((await check({ bytes: without(["7", "'", "$"]) })).problems.file, "A new font has to have every default character drawn. These are blank: 7, Closing quote, $.")
    assert.match((await check({ bytes: without(Array.from("0123456789&#")) })).problems.file, /These are blank: 0, 1, 2, 3, 4, 5, 6, 7 and 4 more\./)
  })

  test("the stored file leaves out blank characters and keeps the drawn ones as they were", () => {
    const gone = Array.from("0123456789&#$")
    const bytes = without(gone)
    const before = submittedFont(bytes).font
    const after = submittedFont(kind.cleanFile(bytes)).font
    assert.deepEqual(gone.map(char => char in before.glyphs), gone.map(() => true))
    assert.deepEqual(Object.keys(after.glyphs), drawnCells(before).cells.map(cell => cell.char))
    assert.deepEqual(ownFont(after).cells.map(cell => [cell.char, cell.advance, cell.originX, cell.top, cell.bottom, Array.from(cell.mask), cell.stretch]), ownFont(before).cells.map(cell => [cell.char, cell.advance, cell.originX, cell.top, cell.bottom, Array.from(cell.mask), cell.stretch]))
    assert.deepEqual(ownFont(after).entry, ownFont(before).entry)
    const stored = JSON.parse(new TextDecoder().decode(kind.cleanFile(bytes)))
    assert.equal(gone.some(char => stored.order.includes(char)), false)
    assert.equal(stored.editor.canvas, undefined)
  })

  test("a file with no blank characters is stored with the sheet it came with", () => {
    assert.equal(JSON.parse(new TextDecoder().decode(kind.cleanFile(f8thful))).editor.texture, JSON.parse(new TextDecoder().decode(f8thful)).editor.texture)
  })

  test("a sheet written as a PNG reads back the same", () => {
    const sheet = buildSheet(copyOf("f8thful"))
    const read = decodePng(encodePng(sheet))
    assert.deepEqual([read.width, read.height], [sheet.width, sheet.height])
    assert.ok(Buffer.from(read.data).equals(Buffer.from(sheet.data)))
  })

  test("a variant only needs its letters", async () => {
    assert.equal((await check({ target: "minecraft-ten", bytes: without(Array.from("0123456789&#$")) })).problems.file, null)
    assert.match((await check({ target: "minecraft-ten", bytes: without(["q"]) })).problems.file, /Draw every letter from a to z, or at least 20 letters of another alphabet\. These are blank: Q\./)
  })

  test("a font with both cases needs a capital and a lowercase version of every letter", async () => {
    const font = setLetterCase(copyOf("f8thful"), "both")
    assert.equal((await check({ bytes: jsonOf(font) })).problems.file, `A new font has to have every default character drawn. These are blank: ${Array.from("abcdefgh").join(", ")} and 18 more.`)
    const lower = Object.fromEntries(Array.from("abcdefghijklmnopqrstuvwxyz", char => [char, font.glyphs[char.toUpperCase()]]))
    const both = addCharacters({ ...font, glyphs: { ...font.glyphs, ...lower } }, "é").font
    assert.equal((await check({ bytes: jsonOf(both) })).problems.file, null)
    const accented = setGlyph(both, "É", font.glyphs.E)
    assert.equal((await check({ bytes: jsonOf(accented) })).problems.file, "A font with both cases needs a capital and a lowercase version of every letter. These are blank: é.")
  })

  test("a font with nothing drawn says so", async () => {
    const font = copyOf("f8thful")
    const blank = Object.fromEntries(Object.entries(font.glyphs).map(([char, glyph]) => [char, { ...glyph, rows: glyph.rows.map(row => "0".repeat(row.length)) }]))
    assert.equal((await check({ bytes: jsonOf({ ...font, glyphs: blank }) })).problems.file, "None of the characters are drawn yet.")
  })

  test("another alphabet doesn't need a to z", async () => {
    assert.equal((await check({ target: "minecraft-ten", bytes: jsonOf(copyOf("minecraft-ten-cyrillic")) })).problems.file, null)
  })

  test("kerning that pushes letters into each other is refused", async () => {
    const font = copyOf("f8thful")
    assert.match((await check({ bytes: jsonOf({ ...font, kerning: { ...font.kerning, lt: 60 } }) })).problems.file, /push their characters into each other: lt/)
  })

  test("a file that isn't from the font editor says so", async () => {
    assert.match((await check({ bytes: new TextEncoder().encode("{ \"id\": \"x\" }") })).problems.file, /no font sheet in it/)
    assert.match((await check({ bytes: new TextEncoder().encode("nope") })).problems.file, /isn't a font editor JSON file/)
  })

  test("a font sheet that is too big is refused before it is decoded", async () => {
    const header = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.alloc(8)])
    header.writeUInt32BE(5000, 16)
    header.writeUInt32BE(5000, 20)
    const editor = { ...JSON.parse(new TextDecoder().decode(f8thful)).editor, texture: `data:image/png;base64,${header.toString("base64")}` }
    assert.match((await check({ bytes: withFields(f8thful, { editor }) })).problems.file, /is 5000x5000, which is too big for a font/)
    assert.match((await check({ bytes: withFields(f8thful, { editor: { ...editor, texture: "data:image/png;base64,AAAA" } }) })).problems.file, /can't be read: it isn't a PNG/)
  })

  test("characters with no stretch zones are marked the way the editor marks them", () => {
    const copy = copyOf("minecraft-gui")
    const cleared = ["a", "m", "1", "&"]
    const font = { ...copy, glyphs: Object.fromEntries(Object.entries(copy.glyphs).map(([char, glyph]) => [char, cleared.includes(char) ? { ...glyph, stretch: [] } : glyph])) }
    const marked = parsedSheet(autoStretch(font, cleared), 0).glyphs
    const built = ownFont(font)
    for (const cell of built.cells) assert.deepEqual(cell.stretch, marked[cell.char].stretch, cell.char)
    assert.ok(built.cells.find(cell => cell.char === "a").stretch.length > 0)
  })

  test("the editor's blank strip is as wide as the A and as tall as the font's strips", () => {
    for (const id of ["minecraft-ten", "minecraft-gui", "minecraft-wiki"]) {
      const entry = published.find(item => item.id === id)
      const { png, cells } = readMask(entry, published)
      const zero = parseMask(png.data, png.width, png.height, cells.map(cell => cell.char).join(""), 0)
      const font = fontFromPublished({ ...entry, name: entry.id }, Object.values(splitCells(entry, published, zero.list).glyphs), zero.capHeight, zero.layers)
      const strip = stripTexture(font)
      assert.equal(strip.height, ownFont(font).template.rows, id)
      assert.equal(strip.width, cells.find(cell => cell.char === "a").width, id)
    }
  })

  test("the published entry keeps the editor's width and square size", () => {
    const font = copyOf("minecraft-gui")
    assert.deepEqual(ownFont({ ...font, grid: 2, width: 30 }).entry.editor, { width: 30, grid: 2 })
    assert.deepEqual(ownFont({ ...font, density: 2 }).entry.editor, { width: font.width, grid: font.grid, density: 2 })
  })

  test("variants have to be of a font that isn't a variant itself", async () => {
    assert.match((await check({ target: "minecraft-ten-v2", bytes: f8thful })).problems.target, /Pick the font/)
  })

  test("bundled textures, overlays and strips are checked against the font's template", async () => {
    const extras = [{ key: "a", kind: "texture", name: "Gold", border: "#AABBCC" }, { key: "b", kind: "overlay", name: "Sparkle", border: "#000000" }, { key: "c", kind: "strip", name: "Stripes", border: "#000000", credit: ["Someone Else", " someone  else ", "Friend"] }]
    const files = { a: plainPng(566 * 2, 356 * 2), b: plainPng(566, 356), c: plainPng(1, 92 * 4) }
    const { problems, details } = await check({ bytes: f8thful, details: { id: "x", extras, files: { forged: "abc" } }, files })
    assert.deepEqual(Object.values(problems).filter(Boolean), [])
    assert.deepEqual(details.extras, [{ key: "a", kind: "texture", name: "Gold", border: "#aabbcc", density: 2, size: { width: 1132, height: 712 } }, { key: "b", kind: "overlay", name: "Sparkle", size: { width: 566, height: 356 } }, { key: "c", kind: "strip", name: "Stripes", credit: ["Someone Else", "Friend"], border: "#000000", size: { width: 1, height: 368 } }])
    assert.equal(details.files, undefined)
    assert.deepEqual(kind.fileKeys(details), ["a", "b", "c"])
    const wrong = await check({ bytes: f8thful, details: { id: "x", extras }, files: { a: plainPng(500, 356), b: plainPng(566, 356), c: plainPng(1, 90) } })
    assert.match(wrong.problems["extra:a"], /template size, 566x356/)
    assert.match(wrong.problems["extra:c"], /23, 46, 92, 184, .* or 2944 pixels tall, and this one is 90/)
  })

  test("a font can bundle one flat texture of its own, checked against its template", async () => {
    const flat = { key: "a", kind: "flat", border: "#AABBCC" }
    const { problems, details } = await check({ bytes: f8thful, details: { id: "x", extras: [flat] }, files: { a: plainPng(566 * 2, 356 * 2) } })
    assert.deepEqual(Object.values(problems).filter(Boolean), [])
    assert.deepEqual(details.extras, [{ key: "a", kind: "flat", name: "Flat", border: "#aabbcc", density: 2, size: { width: 1132, height: 712 } }])
    const two = await check({ bytes: f8thful, details: { id: "x", extras: [flat, { ...flat, key: "b" }] }, files: { a: plainPng(566, 356), b: plainPng(566, 356) } })
    assert.match(two.problems["extra:b"], /only have one flat texture/)
    const wrong = await check({ bytes: f8thful, details: { id: "x", extras: [flat] }, files: { a: plainPng(500, 356) } })
    assert.match(wrong.problems["extra:a"], /flat texture has to be the font's template size, 566x356/)
  })

  test("one bundled texture each can be the primary and the secondary, never an overlay", async () => {
    const extras = [{ key: "a", kind: "texture", name: "Gold", border: "#000000", primary: true, secondary: true }, { key: "b", kind: "overlay", name: "Sparkle", primary: true }, { key: "c", kind: "texture", name: "Iron", border: "#000000", secondary: "yes" }]
    const files = { a: plainPng(566, 356), b: plainPng(566, 356), c: plainPng(566, 356) }
    const { problems, details } = await check({ bytes: f8thful, details: { id: "x", extras }, files })
    assert.deepEqual(Object.values(problems).filter(Boolean), [])
    assert.deepEqual(details.extras.map(item => [item.primary, item.secondary]), [[true, true], [undefined, undefined], [undefined, undefined]])
    const twice = await check({ bytes: f8thful, details: { id: "x", extras: [extras[0], { ...extras[2], primary: true }] }, files })
    assert.match(twice.problems["extra:c"], /Only one texture can be the primary/)
  })

  test("a kept texture that no longer fits a changed font has to be chosen again", async () => {
    const flat = { key: "a", kind: "flat", border: "#000000" }
    const stale = await check({ bytes: f8thful, details: { id: "x", extras: [{ ...flat, size: { width: 566, height: 364 } }], files: { a: "sha" } } })
    assert.match(stale.problems["extra:a"], /template size, 566x356, .* this one is 566x364\. Choose a new one that fits the font\./)
    const fits = await check({ bytes: f8thful, details: { id: "x", extras: [{ ...flat, size: { width: 1132, height: 712 } }], files: { a: "sha" } } })
    assert.equal(fits.problems["extra:a"], undefined)
    assert.deepEqual(fits.details.extras, [{ key: "a", kind: "flat", name: "Flat", border: "#000000", density: 2, size: { width: 1132, height: 712 } }])
  })

  test("a font with depths keeps them, and its template holds a band for each depth", () => {
    const plain = submittedFont(f8thful).font
    const { font: deep, code } = depthCode(plain, 0.5)
    const char = Object.keys(deep.glyphs).find(key => deep.glyphs[key].rows.some(row => row.includes("1")))
    const glyph = deep.glyphs[char]
    const last = glyph.rows.findLastIndex(row => row.includes("1"))
    const built = ownFont({ ...deep, glyphs: { ...deep.glyphs, [char]: { ...glyph, rows: glyph.rows.map((row, index) => index === last ? row.replaceAll("1", code) : row) } } })
    const before = ownFont(plain)
    assert.deepEqual(built.layers, [1, 0.5])
    assert.ok(built.published.find(cell => cell.char === char).depths.includes(1))
    assert.equal(built.template.width, before.template.width)
    assert.equal(built.template.height, flatLayers(built.published, built.capHeight, defaultDepth(built.entry), built.layers).height)
    const front = before.template.rows - defaultDepth(built.entry) * 2
    assert.equal(built.template.rows, layerSlices(built.layers, defaultDepth(built.entry)).reduce((sum, slice) => sum + slice.rows * 2 + front, 0))
  })

  test("bundled files need names of their own and a PNG", async () => {
    const extras = [{ key: "a", kind: "texture", name: "Flat", border: "#000000" }, { key: "b", kind: "texture", name: "Gold", border: "#000000" }, { key: "c", kind: "overlay", name: "gold" }]
    const { problems } = await check({ bytes: f8thful, details: { id: "x", extras }, files: { a: plainPng(566, 356), c: plainPng(566, 356) } })
    assert.match(problems["extra:a"], /built in/)
    assert.match(problems["extra:b"], /Choose a PNG for Gold/)
    assert.match(problems["extra:c"], /would get the same id/)
    const kept = await check({ details: { id: "x", extras: extras.slice(1, 2), files: { b: "sha" }, template: { width: 566, height: 356, rows: 92 } } })
    assert.equal(kept.problems["extra:b"], undefined)
  })

  test("opens in the generator as a custom font", () => {
    const line = client.line({ target: "", details: { id: "x" } }, "data:application/json;base64,e30=", "Hello")
    assert.equal(line.text, "Hello")
    assert.equal(line.customFont.kind, "json")
    assert.match(line.font, /^custom-/)
    assert.equal(client.summary({ target: "minecraft-ten", details: {} }, fonts), "A font listed under Minecraft Ten")
  })

  test("opens in the generator with up to one extra, which it wears", () => {
    const texture = { key: "a", kind: "texture", name: "Gold", border: "#3d1f0a" }
    const overlay = { key: "b", kind: "overlay", name: "Shine" }
    const strip = { key: "c", kind: "strip", name: "Stone" }
    const item = extras => ({ target: "", details: { id: "x", extras } })
    assert.deepEqual([item(undefined), item([]), item([texture]), item([texture, overlay])].map(client.openable), [true, true, true, false])
    assert.deepEqual([item(undefined), item([]), item([overlay])].map(client.extra), [null, null, overlay])
    const line = client.line(item([texture]), "data:application/json;base64,e30=", "Hello")
    assert.deepEqual(client.dressed(line, texture, "data:image/png;base64,AA"), { ...line, textureSource: "custom", customTexture: "data:image/png;base64,AA", customTextureMode: "standard", customBorder: true, borderColour: "#3d1f0a" })
    assert.deepEqual(client.dressed(line, strip, "data:image/png;base64,AA"), { ...line, textureSource: "custom", customTexture: "data:image/png;base64,AA", customTextureMode: "strip", customBorder: true, borderColour: "#000000" })
    const worn = client.dressed(line, overlay, "data:image/png;base64,AA")
    assert.deepEqual([worn.overlayMode, worn.overlays.length, worn.overlays[0].source, worn.overlays[0].file, worn.textureSource], ["custom", 1, "file", "data:image/png;base64,AA", undefined])
  })
})

const roots = []

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "font-submission-"))
  roots.push(root)
  const skip = file => !file.split(/[\\/]/).includes("thumbnails")
  fs.cpSync(LIST, path.join(root, LIST))
  fs.cpSync("public/font/minecraft-ten", path.join(root, "public/font/minecraft-ten"), { recursive: true, filter: skip })
  fs.cpSync("public/strips", path.join(root, "public/strips"), { recursive: true })
  return root
}

function addEntry(root, entry, parent = null) {
  const list = JSON.parse(fs.readFileSync(path.join(root, LIST), "utf8"))
  if (parent) list.find(item => item.id === parent).variants.push(entry)
  else list.push(entry)
  fs.writeFileSync(path.join(root, LIST), `${jsonText(list)}\n`)
}

function hold(root, id, bytes) {
  fs.mkdirSync(path.join(root, "submissions/fonts"), { recursive: true })
  fs.writeFileSync(path.join(root, `submissions/fonts/${id}.json`), bytes)
  return `submissions/fonts/${id}.json`
}

function readPngFile(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function assertPublishable(root, id) {
  const list = flattenFonts(JSON.parse(fs.readFileSync(path.join(root, LIST), "utf8")))
  const entry = list.find(item => item.id === id)
  const folder = path.join(root, "public/font", ...(entry.variant ? [entry.variant, entry.id] : [entry.id]))
  const png = readPngFile(path.join(folder, "font.png"))
  const { list: cells, capHeight } = parseMask(png.data, png.width, png.height, fullOrder(entry, list), defaultBorder("top", entry))
  assert.equal(cells.length, Array.from(fullOrder(entry, list)).length)
  const flat = readPngFile(path.join(folder, "textures/flat.png"))
  for (const [glyph, at] of sheetLayout(cells, capHeight, defaultDepth(entry))) assert.deepEqual(solidMask(flat.data, flat.width, 1, at.x, at.top, glyph.width, glyph.height), glyph.mask, `${id} ${glyph.char}`)
  return { entry, list, folder, png, flat }
}

describe("the workflow step", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
  })

  test("turns a held font and its bundle into the font's files and fonts.json entry", async () => {
    const root = tempRoot()
    addEntry(root, { id: "test-font", name: "Testing", authors: ["Someone"] })
    const held = hold(root, "test-font", f8thful)
    const folder = path.join(root, "public/font/test-font")
    fs.mkdirSync(path.join(folder, "textures"), { recursive: true })
    fs.writeFileSync(path.join(folder, "textures.json"), `${jsonText({ textures: { flat: { border: "#000000" }, gold: { authors: ["Someone"], density: 2, border: "#000000" } }, overlays: {} })}\n`)
    fs.writeFileSync(path.join(folder, "textures/gold.png"), plainPng(566 * 2, 356 * 2))
    const ran = []
    await prepare({ root, changed: [LIST, held, "public/font/test-font/textures.json"], node: (...args) => ran.push(args) })
    assert.deepEqual(ran, [["generator/thumbnails.js", "test-font"]])
    assert.ok(!fs.existsSync(path.join(root, held)))
    const { entry, flat } = assertPublishable(root, "test-font")
    const source = published.find(item => item.id === "f8thful")
    assert.deepEqual(Object.keys(entry).slice(0, 4), ["id", "name", "authors", "basedOn"])
    assert.equal(entry.basedOn, "f8thful")
    assert.equal(entry.order, source.order)
    assert.deepEqual(entry.kerning, source.kerning)
    assert.deepEqual([flat.width, flat.height], [566, 356])
    assert.ok(JSON.parse(fs.readFileSync(path.join(folder, "textures.json"), "utf8")).textures.gold)
  })

  test("keeps a bundled flat texture instead of making one", async () => {
    const root = tempRoot()
    addEntry(root, { id: "test-font", authors: ["Someone"] })
    const held = hold(root, "test-font", f8thful)
    const folder = path.join(root, "public/font/test-font")
    fs.mkdirSync(path.join(folder, "textures"), { recursive: true })
    fs.writeFileSync(path.join(folder, "textures.json"), `${jsonText({ textures: { flat: { authors: ["Someone"], density: 2, border: "#123456" } }, overlays: {} })}\n`)
    const painted = plainPng(566 * 2, 356 * 2)
    fs.writeFileSync(path.join(folder, "textures/flat.png"), painted)
    await prepare({ root, changed: [held], node: () => {} })
    assert.equal(sha1(fs.readFileSync(path.join(folder, "textures/flat.png"))), sha1(painted))
    fs.writeFileSync(path.join(folder, "textures/flat.png"), plainPng(500, 300))
    hold(root, "test-font", f8thful)
    await assert.rejects(prepare({ root, changed: [held], node: () => {} }), /flat.png is 500x300/)
  })

  test("refuses a bundled texture that doesn't fit the converted font", async () => {
    const root = tempRoot()
    addEntry(root, { id: "test-font", authors: ["Someone"] })
    const held = hold(root, "test-font", f8thful)
    const folder = path.join(root, "public/font/test-font")
    fs.mkdirSync(path.join(folder, "textures"), { recursive: true })
    fs.writeFileSync(path.join(folder, "textures.json"), `${jsonText({ textures: { flat: { border: "#000000" }, gold: { authors: ["Someone"], border: "#000000" } }, overlays: {} })}\n`)
    fs.writeFileSync(path.join(folder, "textures/gold.png"), plainPng(500, 300))
    await assert.rejects(prepare({ root, changed: [held], node: () => {} }), /gold.png is 500x300/)
  })

  test("drops blank characters and starts a separate variant with a flat texture", async () => {
    const root = tempRoot()
    addEntry(root, { id: "ten-greek", name: "Greek", authors: ["Someone"] }, "minecraft-ten")
    const held = hold(root, "ten-greek", jsonOf(copyOf("minecraft-ten-cyrillic")))
    await prepare({ root, changed: [held], node: () => {} })
    const { entry, folder } = assertPublishable(root, "ten-greek")
    assert.ok(!Array.from(entry.order).includes("a"))
    assert.equal(entry.preview, "ёєі")
    assert.equal(entry.basedOn, "minecraft-ten-cyrillic")
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, "textures.json"), "utf8")), { textures: { flat: { border: "#000000" } }, overlays: {} })
  })
})

let env
let gh
let restore

function form({ target = "", details = { id: "test-font" }, name = "Test Font", file = f8thful, extras = {} } = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ kind: "font", target, name, credit: JSON.stringify(["Someone"]), notes: "", agree: "true", details: JSON.stringify(details) })) data.set(key, value)
  if (file) data.set("file", new Blob([file], { type: "application/json" }), "font.json")
  for (const [key, bytes] of Object.entries(extras)) data.set(`extra:${key}`, new Blob([bytes], { type: "image/png" }), `${key}.png`)
  return data
}

const send = (cookie, fields) => sendForm(cookie, form(fields))

function branchFile(id, file) {
  const sha = gh.filesAt(`submission/${id}`).get(file)
  return sha ? Buffer.from(gh.blobs.get(sha)) : null
}

function sha1(bytes) {
  return createHash("sha1").update(bytes).digest("hex")
}

describe("sending a font", () => {
  beforeEach(() => {
    ({ env, gh, restore } = serverEnv({ files: [LIST] }))
  })

  afterEach(() => restore())

  test("holds only the font editor's fields from the JSON, at every level", async () => {
    const cookie = await signIn()
    const original = JSON.parse(Buffer.from(f8thful).toString())
    const padded = { ...original, secret: "dropped", kerning: { ...original.kerning, note: "dropped" }, editor: { ...original.editor, hidden: { deep: "dropped" } } }
    const { status, id } = await send(cookie, { file: new TextEncoder().encode(JSON.stringify(padded)) })
    assert.equal(status, 201)
    const held = branchFile(id, "submissions/fonts/test-font.json").toString()
    assert.doesNotMatch(held, /secret|extra|note|hidden|dropped/)
    assert.deepEqual(Object.keys(JSON.parse(held).editor), Object.keys(original.editor))
    assert.deepEqual(fontJsonFields({ strips: ["minecraft-ten", { id: "other", offset: 1, extra: true }, 5], name: 3 }), { strips: ["minecraft-ten", { id: "other", offset: 1 }] })
    assert.deepEqual(fontJsonFields({ allFaces: true, flat: "yes" }), { allFaces: true })
  })

  test("a font based on someone else's work keeps its original and licence links in its entry and the pull request", async () => {
    const cookie = await signIn()
    const links = { source: " https://fontstruct.com/fontstructions/show/2275860 ", licence: "https://creativecommons.org/licenses/by-sa/3.0/" }
    const { status, id } = await send(cookie, { details: { id: "test-font", ...links } })
    assert.equal(status, 201)
    assert.deepEqual(JSON.parse(branchFile(id, LIST).toString()).at(-1), { id: "test-font", authors: ["Someone"], source: "https://fontstruct.com/fontstructions/show/2275860", licence: "https://creativecommons.org/licenses/by-sa/3.0/" })
    assert.match(gh.pulls.get(1).body, /- Source: <https:\/\/fontstruct\.com\/fontstructions\/show\/2275860>\n- Licence: <https:\/\/creativecommons\.org\/licenses\/by-sa\/3\.0\/>/)
    const plain = await send(cookie, { name: "Plain Font" })
    assert.deepEqual(Object.keys(JSON.parse(branchFile(plain.id, LIST).toString()).at(-1)), ["id", "name", "authors"])
    assert.doesNotMatch(gh.pulls.get(2).body, /Source:/)
  })

  test("a font based on someone else's work needs both links, and both have to be web addresses", async () => {
    const cookie = await signIn()
    assert.match((await send(cookie, { details: { id: "test-font", source: "https://example.com" } })).error, /link to its licence/)
    assert.match((await send(cookie, { details: { id: "test-font", source: "javascript:alert(1)", licence: "https://example.com" } })).error, /has to be a web address/)
    assert.match((await send(cookie, { details: { id: "test-font", source: `https://example.com/${"a".repeat(300)}`, licence: "https://example.com" } })).error, /up to 300 characters/)
  })

  test("holds the JSON and adds the font to the end of fonts.json, with its bundle in its folder", async () => {
    const cookie = await signIn()
    const extras = { gold: plainPng(566, 356), sparkle: plainPng(566 * 2, 356 * 2) }
    const details = { id: "test-font", extras: [{ key: "gold", kind: "texture", name: "Gold Bricks", border: "#3d1f0a" }, { key: "sparkle", kind: "overlay", name: "Sparkle", credit: ["Helper", "Someone"] }] }
    const { status, id } = await send(cookie, { details, extras })
    assert.equal(status, 201)
    const list = JSON.parse(branchFile(id, LIST).toString())
    assert.deepEqual(list.at(-1), { id: "test-font", authors: ["Someone"] })
    assert.deepEqual(branchFile(id, "submissions/fonts/test-font.json"), Buffer.from(f8thful))
    assert.deepEqual(JSON.parse(branchFile(id, "public/font/test-font/textures.json").toString()), { textures: { flat: { border: "#000000" }, gold_bricks: { authors: ["Someone"], border: "#3d1f0a" } }, overlays: { sparkle: { authors: ["Helper", "Someone"], density: 2 } } })
    assert.equal(sha1(branchFile(id, "public/font/test-font/overlays/sparkle.png")), sha1(extras.sparkle))
    assert.ok(branchFile(id, "public/font/test-font/textures/gold_bricks.png"))
    assert.equal(gh.pulls.get(1).title, "Test Font font")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "[CF-Pages-Skip] add Test Font font")
  })

  test("writes the bundled textures marked primary and secondary into textures.json", async () => {
    const cookie = await signIn()
    const extras = { base: plainPng(566, 356), gold: plainPng(566, 356) }
    const details = { id: "test-font", extras: [{ key: "base", kind: "flat", border: "#000000", secondary: true }, { key: "gold", kind: "texture", name: "Gold Bricks", border: "#3d1f0a", primary: true }] }
    const { status, id } = await send(cookie, { details, extras })
    assert.equal(status, 201)
    const list = JSON.parse(branchFile(id, "public/font/test-font/textures.json").toString())
    assert.equal(list.primary, "gold_bricks")
    assert.equal(list.secondary, "flat")
    const both = await send(cookie, { details: { id: "test-font-2", extras: [{ ...details.extras[1], secondary: true }] }, extras: { gold: extras.gold } })
    const single = JSON.parse(branchFile(both.id, "public/font/test-font-2/textures.json").toString())
    assert.deepEqual([single.primary, single.secondary], ["gold_bricks", "gold_bricks"])
  })

  test("puts a bundled flat texture in place of the generated one", async () => {
    const cookie = await signIn()
    const painted = plainPng(566, 356)
    const { status, id } = await send(cookie, { details: { id: "test-font", extras: [{ key: "base", kind: "flat", border: "#123456" }] }, extras: { base: painted } })
    assert.equal(status, 201)
    assert.deepEqual(JSON.parse(branchFile(id, "public/font/test-font/textures.json").toString()), { textures: { flat: { authors: ["Someone"], border: "#123456" } }, overlays: {} })
    assert.equal(sha1(branchFile(id, "public/font/test-font/textures/flat.png")), sha1(painted))
  })

  test("refuses a bundled file that wasn't sent", async () => {
    const cookie = await signIn()
    const { status, error } = await send(cookie, { details: { id: "test-font", extras: [{ key: "gold", kind: "texture", name: "Gold", border: "#000000" }] } })
    assert.equal(status, 400)
    assert.match(error, /Choose a PNG for Gold/)
  })

  test("puts variants under their parent and keeps ids apart from other open font submissions", async () => {
    const cookie = await signIn()
    const first = await send(cookie, { target: "minecraft-ten", name: "Alt", file: jsonOf(copyOf("minecraft-ten-cyrillic"), "ten-alt") })
    assert.equal(first.status, 201)
    const parent = JSON.parse(branchFile(first.id, LIST).toString()).find(item => item.id === "minecraft-ten")
    assert.deepEqual(parent.variants.at(-1), { id: "ten-alt", name: "Alt", authors: ["Someone"] })
    assert.equal(gh.pulls.get(1).title, "Alt font for Minecraft Ten")
    const second = await send(cookie, { name: "Ten Alt", file: jsonOf(copyOf("f8thful"), "ten-alt") })
    assert.equal(second.status, 201)
    assert.deepEqual(JSON.parse(branchFile(second.id, LIST).toString()).at(-1), { id: "ten-alt-2", name: "Ten Alt", authors: ["Someone"] })
    assert.ok(branchFile(second.id, "submissions/fonts/ten-alt-2.json"))
  })

  test("keeps bundled files on edits that don't send them again", async () => {
    const cookie = await signIn()
    const details = { id: "test-font", extras: [{ key: "gold", kind: "texture", name: "Gold", border: "#000000" }] }
    const { id } = await send(cookie, { details, extras: { gold: plainPng(566, 356) } })
    const row = await env.DB.prepare("SELECT details, updated_at FROM submissions WHERE id = ?").bind(id).first()
    const kept = JSON.parse(row.details)
    const body = form({ name: "Renamed Font", file: null, details: { ...kept, extras: [{ ...kept.extras[0], name: "Golden", size: { width: 1, height: 1 } }] } })
    body.set("revision", String(row.updated_at))
    const response = await editSubmission(context(`/api/submissions/${id}`, { method: "PATCH", body, cookie, params: { id: String(id) } }))
    assert.equal(response.status, 200)
    assert.ok(branchFile(id, "public/font/test-font/textures/golden.png"))
    assert.equal(gh.pulls.get(1).title, "Renamed Font font")
  })
})
