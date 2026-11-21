import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { drawnCharacters } from "../../src/lib/font/editor/coverage.js"
import { glyphOf, isBlank } from "../../src/lib/font/editor/glyph.js"
import { fontFromFiles } from "../../src/lib/font/editor/import.js"
import { fontFromMinecraft, isMinecraftFont, minecraftBundle, minecraftNotes, minecraftShape, minecraftSource, readMinecraftFont, suggestedMinecraftSize, textureName } from "../../src/lib/font/minecraftFont.js"
import { VANILLA_DEFAULT } from "../../src/lib/font/minecraftVanilla.js"
import { minecraftTemplate, templateGlyphs } from "../../src/fontEditor/template.js"

const CAPITAL = ["####", "#..#", "#..#", "####", "#..#", "#..#", "#..#"]
const LOWER = ["", "", "###", "..#", "###", "#.#", "###"]
const DESCENDER = ["", "", "###", "#.#", "#.#", "###", "..#", "###"]

function texture(cellWidth, cellHeight, cells) {
  const columns = Math.max(...cells.map(row => row.length))
  const width = cellWidth * columns
  const height = cellHeight * cells.length
  const data = new Uint8ClampedArray(width * height * 4)
  cells.forEach((row, r) => row.forEach((picture, c) => (picture ?? []).forEach((line, y) => Array.from(line).forEach((pixel, x) => {
    if (pixel === "#") data[((r * cellHeight + y) * width + c * cellWidth + x) * 4 + 3] = 255
  }))))
  return { data, width, height }
}

function scaled(picture, factor) {
  return picture.flatMap(line => Array.from({ length: factor }, () => Array.from(line, pixel => pixel.repeat(factor)).join("")))
}

function rows(glyph) {
  return glyph.rows.map(row => row.replace(/[^0]/g, "#").replace(/0/g, "."))
}

const basic = texture(8, 8, [[CAPITAL, LOWER, DESCENDER]])
const basicJson = { providers: [{ type: "space", advances: { " ": 4 } }, { type: "bitmap", file: "minecraft:font/basic.png", ascent: 7, chars: ["Aag"] }] }

describe("reading a Minecraft font", () => {
  test("a JSON with a providers list is a Minecraft font", () => {
    assert.ok(isMinecraftFont(basicJson))
    assert.ok(!isMinecraftFont({ name: "My Font", editor: {} }))
    assert.ok(!isMinecraftFont(null))
  })

  test("a provider's file is found by its base name, without folders", () => {
    assert.equal(textureName("minecraft:font/accented.png"), "accented.png")
    assert.equal(textureName("allure:font/sub/Logo.png"), "logo.png")
    assert.equal(textureName("font/ascii.png"), "ascii.png")
  })

  test("each grid cell is a character, as wide as its rightmost drawn column", () => {
    const source = readMinecraftFont(basicJson, new Map([["basic.png", basic]]), { fileName: "custom.json" })
    assert.deepEqual(source.characters, ["A", "a", "g"])
    assert.equal(source.glyphs.get("A").right, 4)
    assert.equal(source.glyphs.get("a").right, 3)
    assert.equal(source.capRows, 7)
    assert.equal(source.glyphs.get(" ").advance, 4)
  })

  test("the first provider with a character wins, and null cells are skipped", () => {
    const other = texture(8, 8, [[["#"], ["##"]]])
    const json = { providers: [{ type: "bitmap", file: "a.png", ascent: 7, chars: ["\u0000A"] }, { type: "bitmap", file: "b.png", ascent: 7, chars: ["Ab"] }] }
    const source = readMinecraftFont(json, new Map([["a.png", other], ["b.png", other]]), { fileName: "custom.json" })
    assert.equal(source.glyphs.get("A").right, 2)
    assert.equal(source.glyphs.get("b").right, 2)
    assert.ok(!source.glyphs.has("\u0000"))
  })

  test("rows are read by code point, so characters outside the basic plane get one cell each", () => {
    const image = texture(8, 8, [[["#"], ["##"], ["###"]]])
    const source = readMinecraftFont({ providers: [{ type: "bitmap", file: "e.png", ascent: 7, chars: ["\u{1F49B}xA"] }] }, new Map([["e.png", image]]), { fileName: "custom.json" })
    assert.equal(source.glyphs.get("\u{1F49B}").right, 1)
    assert.equal(source.glyphs.get("A").right, 3)
  })

  test("a provider's height scales its cells, so a high resolution texture keeps its detail", () => {
    const image = texture(16, 16, [[scaled(CAPITAL, 2)]])
    const source = readMinecraftFont({ providers: [{ type: "bitmap", file: "hd.png", ascent: 7, chars: ["A"] }] }, new Map([["hd.png", image]]), { fileName: "custom.json" })
    assert.equal(source.scale, 0.5)
    assert.equal(source.capRows, 14)
    assert.deepEqual(suggestedMinecraftSize(source), { rows: 14, square: 3 })
    const font = fontFromMinecraft(source, { height: 14 })
    assert.equal(font.height, 14)
    assert.equal(font.grid, 1)
    assert.equal(glyphOf(font, "A").rows[0].length, 8)
  })

  test("providers that can't be used are left out and listed", () => {
    const json = { providers: [{ type: "ttf", file: "x.ttf" }, { type: "unihex", hex_file: "u.zip" }, { type: "reference", id: "pack:other" }, { type: "bitmap", file: "minecraft:font/kanji.png", ascent: 7, chars: ["K"] }].concat(basicJson.providers) }
    const source = readMinecraftFont(json, new Map([["basic.png", basic]]), { fileName: "custom.json" })
    assert.deepEqual(source.missing, ["kanji.png"])
    assert.equal(minecraftNotes(source), "kanji.png wasn't chosen, so its characters are left out. ttf and unihex providers can't be imported. The reference to pack:other can't be followed.")
  })

  test("a font whose PNGs weren't chosen says which ones it needs", () => {
    assert.throws(() => readMinecraftFont(basicJson, new Map(), { fileName: "custom.json" }), /Choose basic\.png along with the JSON/)
  })

  test("providers filtered to non default options only fill in characters nothing else has", () => {
    const narrow = texture(8, 8, [[["#", "#", "#", "#", "#", "#", "#"], ["#"]]])
    const json = { providers: [{ type: "bitmap", file: "jp.png", ascent: 7, chars: ["AZ"], filter: { jp: true } }, { type: "bitmap", file: "basic.png", ascent: 7, chars: ["Aag"], filter: { uniform: false } }] }
    const source = readMinecraftFont(json, new Map([["jp.png", narrow], ["basic.png", basic]]), { fileName: "custom.json" })
    assert.equal(source.glyphs.get("A").right, 4)
    assert.equal(source.glyphs.get("Z").right, 1)
  })

  test("a default.json falls back on the vanilla providers for textures it doesn't list", () => {
    const ascii = VANILLA_DEFAULT.find(provider => provider.file.endsWith("ascii.png"))
    const cells = Array.from(ascii.chars, row => Array.from(row, char => char === "B" ? CAPITAL : null))
    const images = new Map([["basic.png", basic], ["ascii.png", texture(8, 8, cells)]])
    assert.ok(readMinecraftFont(basicJson, images, { fileName: "default.json" }).glyphs.get("B").right)
    assert.ok(!readMinecraftFont(basicJson, images, { fileName: "custom.json" }).glyphs.has("B"))
    assert.deepEqual(readMinecraftFont(basicJson, new Map([["basic.png", basic]]), { fileName: "default.json" }).missing, [])
  })

  test("a reference to the vanilla default font uses the vanilla layout", () => {
    const ascii = VANILLA_DEFAULT.find(provider => provider.file.endsWith("ascii.png"))
    const cells = Array.from(ascii.chars, row => Array.from(row, char => char === "B" ? CAPITAL : null))
    const source = readMinecraftFont({ providers: [{ type: "reference", id: "minecraft:include/default" }] }, new Map([["ascii.png", texture(8, 8, cells)]]), { fileName: "custom.json" })
    assert.deepEqual(source.characters, ["B"])
    assert.deepEqual(source.skipped, [])
  })
})

describe("turning a Minecraft font into a font", () => {
  const source = readMinecraftFont(basicJson, new Map([["basic.png", basic]]), { fileName: "default.json" })

  test("capitals fill the cap height and each texture pixel becomes one square", () => {
    const font = fontFromMinecraft(source, { height: 40 })
    assert.equal(font.name, "Minecraft Font")
    assert.equal(font.grid, 6)
    assert.equal(font.height, 42)
    assert.equal(glyphOf(font, "A").rows.length, 42)
    assert.equal(glyphOf(font, "A").rows[0].length, 24)
    assert.equal(font.spaceWidth, 24)
  })

  test("pixels below the ascent hang under the baseline", () => {
    const font = fontFromMinecraft(source, { height: 7 })
    assert.equal(glyphOf(font, "g").below, 1)
    assert.deepEqual(rows(glyphOf(font, "g")), ["...", "...", "###", "#.#", "#.#", "###", "..#", "###"])
    assert.deepEqual(rows(glyphOf(font, "A")), CAPITAL)
  })

  test("missing characters fall back to the other case, and others start blank", () => {
    const font = fontFromMinecraft(source, { height: 7 })
    assert.deepEqual(rows(glyphOf(font, "G")), rows(glyphOf(font, "g")))
    assert.ok(isBlank(glyphOf(font, "z")) && isBlank(glyphOf(font, "Z")))
  })

  test("a taller provider keeps its size relative to the rest", () => {
    const big = texture(8, 16, [[scaled(["##", "##"], 4)]])
    const json = { providers: basicJson.providers.concat({ type: "bitmap", file: "big.png", ascent: 14, height: 16, chars: ["é"] }) }
    const mixed = readMinecraftFont(json, new Map([["basic.png", basic], ["big.png", big]]), { fileName: "custom.json" })
    const { shape, capHeight } = minecraftShape(mixed, "é", { height: 14 })
    assert.equal(capHeight, 14)
    assert.deepEqual([shape.width, shape.top, shape.bottom], [16, 28, 12])
  })

  test("a bundle of the JSON and its textures reads back the same", async () => {
    const data = minecraftBundle({ json: basicJson, fileName: "default.json", textures: { "basic.png": "texture:basic" } })
    assert.match(data, /^data:application\/json,/)
    const text = await (await fetch(data)).text()
    const read = await minecraftSource(text, async url => url === "texture:basic" ? basic : null)
    assert.deepEqual(read.characters, source.characters)
  })
})

describe("a Minecraft font as the template font", () => {
  const source = readMinecraftFont(basicJson, new Map([["basic.png", basic]]), { fileName: "default.json" })
  const minecraft = { name: "default.json", data: minecraftBundle({ json: basicJson, fileName: "default.json", textures: {} }), source }

  test("characters added to a font are drawn from it", async () => {
    const { template } = minecraftTemplate(minecraft, 2)
    assert.equal(template.kind, "minecraft")
    const font = { ...fontFromMinecraft(source, { height: 14 }), template }
    const glyphs = await templateGlyphs(font, ["a"])
    assert.equal(glyphs.a.rows.length, 14)
    assert.ok(!isBlank(glyphs.a))
  })

  test("its kind is kept when a saved font JSON is opened", () => {
    const { template } = minecraftTemplate(minecraft, 2)
    assert.equal(fontFromFiles({ json: { name: "Saved", editor: { template } } }).template.kind, "minecraft")
  })

  test("the character browser lists what it draws", async () => {
    assert.deepEqual(await drawnCharacters(source), ["A", "a", "g"])
  })
})
