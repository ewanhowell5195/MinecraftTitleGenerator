import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, test } from "node:test"
import { PNG } from "pngjs"
import { publishedFonts } from "../generator/fonts.js"
import { imagesToCompress } from "../generator/submission.js"
import { prepare as fontAssetStep } from "../generator/submissionKinds/fontAsset.js"
import { prepare as shapeStep } from "../generator/submissionKinds/shape.js"
import { prepare as stripStep } from "../generator/submissionKinds/strip.js"
import { drawThumbnails, thumbnailEntry, thumbnailList } from "../generator/thumbnails.js"
import { sheetOwner } from "../src/lib/font.js"
import { jsonText } from "../src/lib/jsonText.js"

const HERE = path.resolve(".")
const roots = []

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generator-steps-"))
  roots.push(root)
  return root
}

function writeJson(root, file, data) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), `${jsonText(data)}\n`)
}

function writeImage(root, file, width, height, colour = [200, 40, 40, 255]) {
  const image = new PNG({ width, height })
  for (let at = 0; at < image.data.length; at += 4) image.data.set(colour, at)
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), PNG.sync.write(image))
}

function asked(step, root, changed) {
  const calls = []
  step({ root, changed, node: (...args) => calls.push(args) })
  return calls
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
})

describe("the font asset step", () => {
  const fonts = publishedFonts()

  test("asks for thumbnails of the font whose textures changed and every font sharing its sheet", () => {
    const sharing = fonts.filter(font => sheetOwner(font, fonts).id === "minecraft-ten").map(font => ["generator/thumbnails.js", font.id])
    assert.ok(sharing.length > 1)
    assert.deepEqual(asked(fontAssetStep, HERE, ["public/font/minecraft-ten/textures.json", "public/font/minecraft-ten/textures/gold.png"]), sharing)
    assert.deepEqual(asked(fontAssetStep, HERE, ["public/font/minecraft-ten/minecraft-ten-cyrillic/textures.json"]), [["generator/thumbnails.js", "minecraft-ten-cyrillic"]])
  })

  test("asks for nothing when no font's textures.json changed", () => {
    assert.deepEqual(asked(fontAssetStep, HERE, ["public/font/minecraft-ten/textures/gold.png", "public/strips/minecraft-ten/textures.json", "README.md"]), [])
  })

  test("reads the fonts of the root it is given", () => {
    const root = tempRoot()
    writeJson(root, "public/font/fonts.json", [{ id: "only-here", authors: ["Someone"] }])
    assert.deepEqual(asked(fontAssetStep, root, ["public/font/only-here/textures.json"]), [["generator/thumbnails.js", "only-here"]])
    assert.deepEqual(asked(fontAssetStep, root, ["public/font/minecraft-ten/textures.json"]), [])
  })
})

describe("the strip step", () => {
  test("reads the fonts and shapes of the root it is given", () => {
    const root = tempRoot()
    writeJson(root, "public/font/fonts.json", [{ id: "plain" }, { id: "striped", strips: ["soft"] }])
    writeJson(root, "public/shapes/shapes.json", [{ id: "star", kind: "png", order: "x", strips: [{ id: "soft", offset: 2 }] }, { id: "cube", kind: "model", height: 16 }])
    assert.deepEqual(asked(stripStep, root, ["public/strips/soft/textures.json"]), [["generator/thumbnails.js", "striped"], ["generator/thumbnails.js", "star"]])
    assert.deepEqual(asked(stripStep, root, ["public/strips/other/textures.json", "public/font/striped/textures.json"]), [])
  })
})

describe("the shape step", () => {
  test("turns a held silhouette into the shape's files inside the root it is given", () => {
    const root = tempRoot()
    writeJson(root, "public/shapes/shapes.json", [{ id: "generator-test-star", authors: ["Someone"], kind: "png", order: "x" }])
    writeImage(root, "submissions/shapes/generator-test-star.png", 12, 20)
    assert.deepEqual(asked(shapeStep, root, ["submissions/shapes/generator-test-star.png"]), [["generator/thumbnails.js", "generator-test-star"]])
    const folder = path.join(root, "public/shapes/generator-test-star")
    const sheet = PNG.sync.read(fs.readFileSync(path.join(folder, "font.png")))
    assert.deepEqual([sheet.width, sheet.height], [14, 22])
    assert.deepEqual([Array.from(sheet.data.subarray(0, 4)), Array.from(sheet.data.subarray((sheet.width + 1) * 4, (sheet.width + 1) * 4 + 4))], [[255, 0, 0, 255], [0, 0, 0, 255]])
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(folder, "textures.json"), "utf8")).textures), ["default", "flat"])
    assert.ok(fs.existsSync(path.join(folder, "textures/flat.png")))
    assert.ok(fs.existsSync(path.join(folder, "textures/default.png")))
    assert.ok(!fs.existsSync(path.join(root, "submissions/shapes/generator-test-star.png")))
    assert.ok(!fs.existsSync("public/shapes/generator-test-star"))
  })

  test("draws a thumbnail for every texture a changed model lists, and flat from its main one", () => {
    const root = tempRoot()
    const folder = "public/shapes/block"
    writeJson(root, `${folder}/model.json`, { elements: [{ from: [0, 0, 0], to: [8, 16, 1], faces: { north: { uv: [0, 0, 16, 16] } } }] })
    writeJson(root, `${folder}/textures.json`, { textures: { steve: { border: "#000000", variants: { alex: { border: "#000000" } } }, zombie: { border: "#000000" } }, overlays: {}, primary: "zombie" })
    writeImage(root, `${folder}/textures/steve.png`, 16, 16, [10, 20, 30, 255])
    writeImage(root, `${folder}/textures/alex.png`, 16, 16, [40, 50, 60, 255])
    writeImage(root, `${folder}/textures/zombie.png`, 16, 16, [70, 80, 90, 255])
    assert.deepEqual(asked(shapeStep, root, [`${folder}/model.json`]), [])
    assert.deepEqual(fs.readdirSync(path.join(root, folder, "thumbnails")).sort(), ["alex.png", "flat.png", "steve.png", "zombie.png"])
    function middle(name) {
      const image = PNG.sync.read(fs.readFileSync(path.join(root, folder, "thumbnails", `${name}.png`)))
      const at = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4
      return Array.from(image.data.subarray(at, at + 3))
    }
    assert.deepEqual([middle("steve"), middle("alex"), middle("zombie"), middle("flat")], [[10, 20, 30], [40, 50, 60], [70, 80, 90], [70, 80, 90]])
  })

  test("a submitted model with only its default texture still gets flat and default thumbnails", () => {
    const root = tempRoot()
    const folder = "public/shapes/block"
    writeJson(root, `${folder}/model.json`, { elements: [{ from: [0, 0, 0], to: [8, 16, 1], faces: { north: { uv: [0, 0, 16, 16] } } }] })
    writeJson(root, `${folder}/textures.json`, { textures: { default: { authors: ["Someone"], border: "#000000" } }, overlays: {}, primary: "default", secondary: "default" })
    writeImage(root, `${folder}/textures/default.png`, 16, 16)
    asked(shapeStep, root, [`${folder}/model.json`])
    assert.deepEqual(fs.readdirSync(path.join(root, folder, "thumbnails")).sort(), ["default.png", "flat.png"])
  })

  test("a deep model is drawn from an angle, ringed in its texture's border colour, with a thumbnail for each overlay", () => {
    const root = tempRoot()
    const folder = "public/shapes/crate"
    const faces = Object.fromEntries(["north", "south", "east", "west", "up", "down"].map(side => [side, { uv: [0, 0, 16, 16] }]))
    writeJson(root, `${folder}/model.json`, { elements: [{ from: [0, 2, 0], to: [16, 18, 16], faces }] })
    writeJson(root, `${folder}/textures.json`, { textures: { flat: { border: "#102030" } }, overlays: { edges: {} } })
    writeImage(root, `${folder}/textures/flat.png`, 16, 16, [200, 200, 200, 255])
    writeImage(root, `${folder}/overlays/edges.png`, 16, 16, [255, 255, 255, 255])
    writeImage(root, `${folder}/thumbnails/gone.png`, 4, 4)
    asked(shapeStep, root, [`${folder}/model.json`])
    assert.deepEqual(fs.readdirSync(path.join(root, folder, "thumbnails")).sort(), ["edges.png", "flat.png"])
    const image = PNG.sync.read(fs.readFileSync(path.join(root, folder, "thumbnails/flat.png")))
    const colours = new Set()
    for (let at = 0; at < image.data.length; at += 4) {
      if (image.data[at + 3] === 255) colours.add(image.data.subarray(at, at + 3).join())
    }
    assert.ok(["200,200,200", "170,170,170", "138,138,138", "16,32,48"].every(colour => colours.has(colour)))
    assert.deepEqual([image.width, image.height], [26, 28])
  })
})

describe("thumbnails", () => {
  test("finds the one font or shape with an id, and refuses an id two of them share", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "b", kind: "png" }]
    assert.equal(thumbnailEntry(list, "a"), list[0])
    assert.throws(() => thumbnailEntry(list, "b"), /2 fonts or shapes have the id b/)
    assert.throws(() => thumbnailEntry(list, "c"), /no font or shape with id c/)
  })

  test("no published font and PNG shape share an id", () => {
    const list = thumbnailList()
    for (const entry of list) assert.equal(thumbnailEntry(list, entry.id), entry)
  })

  test("draws a font's thumbnails into the root it is given, and nothing changes on a second run", async () => {
    const root = tempRoot()
    fs.cpSync("public/font/fonts.json", path.join(root, "public/font/fonts.json"))
    fs.cpSync("public/font/minecraft-five", path.join(root, "public/font/minecraft-five"), { recursive: true, filter: file => !file.split(/[\\/]/).includes("thumbnails") })
    fs.cpSync("public/strips", path.join(root, "public/strips"), { recursive: true })
    fs.cpSync("public/shapes/shapes.json", path.join(root, "public/shapes/shapes.json"))
    const list = thumbnailList(root)
    const first = await drawThumbnails(thumbnailEntry(list, "minecraft-five"), list, root)
    assert.equal(first.changed, first.count)
    assert.equal(fs.readdirSync(path.join(root, "public/font/minecraft-five/thumbnails")).length, first.count)
    assert.ok(fs.existsSync(path.join(root, "public/font/minecraft-five/thumbnails/flat.png")))
    assert.equal((await drawThumbnails(thumbnailEntry(list, "minecraft-five"), list, root)).changed, 0)
  })
})

describe("the compress step's image list", () => {
  test("names each changed PNG under public once, and leaves out deleted ones and other files", () => {
    const root = tempRoot()
    writeImage(root, "public/font/a/textures/gold.png", 1, 1)
    writeImage(root, "src/logo.png", 1, 1)
    writeJson(root, "public/font/a/textures.json", {})
    assert.deepEqual(imagesToCompress(root, ["public/font/a/textures/gold.png", "public/font/a/textures/deleted.png", "public/font/a/textures.json", "src/logo.png", "public/font/a/textures/gold.png"]), ["public/font/a/textures/gold.png"])
  })
})
