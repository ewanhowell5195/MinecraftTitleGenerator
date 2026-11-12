import { describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { PNG } from "pngjs"
import { pngOf } from "./helpers/png.js"
import { publicContext } from "./helpers/site.js"

const { cleanModel, cleanModelFile, sampleGlyph, samplePixels, shapeImage, shapeModel, silhouetteGlyph, silhouettePixels, silhouetteSample, silhouetteScale } = await import("../src/lib/submissionKinds/shape.js")
const { elementCorners, modelHeight } = await import("../src/lib/shapes.js")
const { shapeImage: serverImage, shapeModel: serverModel } = await import("../src/server/submissionKinds/shape.js")
const { frontView } = await import("../generator/submissionKinds/shape.js")

const context = publicContext()

const LIST = "public/shapes/shapes.json"
const encode = value => new TextEncoder().encode(JSON.stringify(value))
const face = { uv: [0, 0, 16, 16], texture: "#0", cullface: "north", rotation: 90 }

function silhouette(width, height, solid = () => true) {
  return new Uint8Array(pngOf(width, height, (x, y) => solid(x, y) ? [200, 40, 40, 255] : [0, 0, 0, 0]))
}

function reader(path) {
  return Promise.resolve(fs.readFileSync(path, "utf8"))
}

describe("cleanModel", () => {
  const plain = { uv: [0, 0, 16, 16], texture: "#0" }

  test("converts a Java block model to the shape model format", () => {
    const model = { credit: "Made with Blockbench", texture_size: [32, 32], textures: { 0: "block/stone" }, display: { gui: {} }, groups: [], elements: [{ name: "cube", from: [0, 0, 0], to: [16, 16, 16], color: 3, rotation: { angle: 0, axis: "y", origin: [8, 8, 8] }, faces: { north: face, up: plain } }] }
    assert.deepEqual(cleanModel(encode(model)), { elements: [{ from: [0, 2, 0], to: [40, 42, 40], faces: { north: { uv: [0, 0, 16, 16], rotation: 90 }, up: { uv: [0, 0, 16, 16] } } }] })
  })

  test("stands the model on the baseline whatever its lowest point", () => {
    const { elements } = cleanModel(encode({ elements: [{ from: [0, -4, 0], to: [16, 4, 16], faces: { north: plain } }] }))
    assert.deepEqual([elements[0].from[1], elements[0].to[1]], [2, 22])
  })

  test("fills in the uvs Java works out from the element", () => {
    const { elements } = cleanModel(encode({ elements: [{ from: [2, 0, 4], to: [6, 8, 10], faces: { north: { texture: "#0" }, south: { texture: "#0" }, east: { texture: "#0" }, west: { texture: "#0" }, up: { texture: "#0" }, down: { texture: "#0" } } }] }))
    assert.deepEqual(Object.fromEntries(Object.entries(elements[0].faces).map(([side, value]) => [side, value.uv])), { north: [10, 8, 14, 16], south: [2, 8, 6, 16], east: [6, 8, 12, 16], west: [4, 8, 10, 16], up: [2, 4, 6, 10], down: [2, 6, 6, 12] })
  })

  test("turns both kinds of element rotation into one", () => {
    const single = { angle: 22.5, axis: "z", origin: [8, 8, 8], rescale: true }
    const euler = { x: 30, y: -45, origin: [8, 8, 8] }
    const floor = { from: [0, -8, 0], to: [1, -7, 1], faces: { north: plain } }
    const [first, second] = cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], rotation: single, faces: { north: plain } }, { from: [0, 0, 0], to: [1, 1, 1], rotation: euler, faces: { north: plain } }, floor] })).elements
    assert.deepEqual(first.rotation, { origin: [20, 42, 20], x: 0, y: 0, z: 22.5, rescale: true })
    assert.deepEqual(second.rotation, { origin: [20, 42, 20], x: 30, y: -45, z: 0 })
  })

  test("a turned element stands on the baseline by its lowest corner", () => {
    const turned = { from: [0, 0, 0], to: [16, 16, 16], rotation: { angle: 45, axis: "z", origin: [8, 8, 8] }, faces: { north: plain } }
    const model = cleanModel(encode({ elements: [turned] }))
    const lowest = Math.min(...model.elements.flatMap(element => elementCorners(element).map(point => point[1])))
    assert.ok(Math.abs(lowest - 2) < 0.002, `${lowest} is not on the baseline`)
    assert.equal(modelHeight(model), Math.ceil(2 + 16 * Math.SQRT2 * 2.5) + 2)
  })

  test("a quarter turn measures the same height as the element standing straight", () => {
    const element = { from: [0, 0, 0], to: [16, 8, 16], faces: { north: plain } }
    const straight = modelHeight(cleanModel(encode({ elements: [{ ...element, to: [8, 16, 16] }] })))
    assert.equal(modelHeight(cleanModel(encode({ elements: [{ ...element, rotation: { angle: 90, axis: "z", origin: [8, 4, 8] } }] }))), straight)
  })

  test("refuses an element its rotation swings out of reach", () => {
    const far = { from: [90, 0, 0], to: [100, 1, 1], rotation: { angle: 45, axis: "y", origin: [-100, 0, 0] }, faces: { north: plain } }
    assert.throws(() => cleanModel(encode({ elements: [far] })), /Element 1 reaches further than 100 from the centre/)
  })

  test("drops rotations that don't turn anything", () => {
    const { elements } = cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], rotation: { x: 360, origin: [0, 0, 0] }, faces: { north: plain } }] }))
    assert.equal(elements[0].rotation, undefined)
  })

  test("counts the textures the faces use, not the ones listed", () => {
    const textures = { 0: "block/stone", 1: { sprite: "minecraft:block/stone", force_translucent: true }, unused: "block/dirt", particle: "#0" }
    const model = { textures, elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { north: { texture: "#0" }, south: { texture: "#1" }, up: { texture: "#particle" } } }] }
    assert.equal(cleanModel(encode(model)).elements.length, 1)
  })

  test("refuses a model whose faces use more than one texture", () => {
    const model = { textures: { 0: "block/stone", 1: { sprite: "block/dirt" } }, elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { north: { texture: "#0" }, south: { texture: "#1" } } }] }
    assert.throws(() => cleanModel(encode(model)), /only use one texture, and its faces use 2: block\/stone, block\/dirt/)
  })

  test("drops elements with no faces", () => {
    const model = { elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: {} }, { from: [0, 0, 0], to: [2, 2, 2], faces: { south: plain } }] }
    assert.equal(cleanModel(encode(model)).elements.length, 1)
  })

  test("refuses files that aren't block models", () => {
    assert.throws(() => cleanModel(new TextEncoder().encode("{ nope")), /isn't a valid JSON file/)
    assert.throws(() => cleanModel(encode([])), /isn't a Java block model/)
    assert.throws(() => cleanModel(encode({ elements: [] })), /no elements/)
    assert.throws(() => cleanModel(encode({ parent: "block/cube_all", textures: { all: "block/stone" } })), /can't use a parent model/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0], to: [1, 1, 1], faces: { north: plain } }] })), /valid from and to/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { north: { uv: [0, 0, 1] } } }] })), /north face of element 1 has a uv that isn't valid/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { north: { rotation: 45 } } }] })), /isn't 0, 90, 180 or 270/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], rotation: { angle: 45, axis: "q", origin: [0, 0, 0] }, faces: { north: plain } }] })), /rotation that isn't valid/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], rotation: { origin: [0, 0, 0] }, faces: { north: plain } }] })), /rotation that isn't valid/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [500, 1, 1], faces: { north: plain } }] })), /reaches further/)
    assert.throws(() => cleanModel(encode({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: {} }] })), /None of the model's elements/)
  })

  test("the stored file is the converted model", () => {
    const stored = JSON.parse(new TextDecoder().decode(cleanModelFile(encode({ credit: "x", elements: [{ from: [0, 2, 0], to: [4, 34.5, 4], faces: { north: plain } }] }))))
    assert.deepEqual(Object.keys(stored), ["elements"])
    assert.equal(modelHeight(stored), 86)
  })
})

describe("shape checks", () => {
  test("a model needs its one texture", async () => {
    const model = encode({ elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: face } }] })
    assert.match((await shapeModel.check({ details: {}, bytes: model, files: {} })).problems.texture, /Choose the model's texture/)
    const checked = await shapeModel.check({ details: {}, bytes: model, files: { texture: silhouette(16, 16) } })
    assert.equal(checked.problems.texture, null)
    assert.deepEqual(checked.details, { height: 44, elements: 1 })
  })

  test("a silhouette is measured by its solid pixels", async () => {
    const checked = await shapeImage.check({ details: {}, bytes: silhouette(40, 40, (x, y) => x >= 5 && x < 25 && y >= 10 && y < 30) })
    assert.equal(checked.problems.file, undefined)
    assert.deepEqual(checked.details, { width: 20, height: 20 })
  })

  test("refuses empty, short and oversized silhouettes", async () => {
    assert.match((await shapeImage.check({ details: {}, bytes: silhouette(10, 10, () => false) })).problems.file, /no solid pixels/)
    assert.match((await shapeImage.check({ details: {}, bytes: silhouette(20, 4) })).problems.file, /at least 8 pixels tall/)
    assert.match((await shapeImage.check({ details: {}, bytes: silhouette(200, 20) })).problems.file, /up to 128 pixels wide/)
  })

  test("a PNG shape picks the strips it uses, like a font", async () => {
    const checked = await shapeImage.check({ details: { strips: [{ id: "minecraft-ten", offset: 2 }] }, bytes: silhouette(20, 20) }, context)
    assert.equal(checked.problems.strips, null)
    assert.deepEqual(checked.details.strips, [{ id: "minecraft-ten", offset: 2 }])
    assert.deepEqual((await shapeImage.check({ details: { strips: ["minecraft-ten"] }, bytes: silhouette(20, 20) }, context)).details.strips, ["minecraft-ten"])
  })

  test("refuses strips that don't exist, don't fit or aren't valid", async () => {
    assert.match((await shapeImage.check({ details: { strips: ["nothing-here"] }, bytes: silhouette(20, 20) }, context)).problems.strips, /no strips called that/)
    assert.match((await shapeImage.check({ details: { strips: ["minecraft-ten"] }, bytes: silhouette(20, 64) }, context)).problems.strips, /The shape (goes further below|reaches higher than).* Change its offset, or stop using the minecraft-ten strips/)
    assert.match((await shapeImage.check({ details: { strips: ["minecraft-ten", "minecraft-ten"] }, bytes: silhouette(20, 20) }, context)).problems.strips, /strips aren't valid/)
    assert.match((await shapeImage.check({ details: { strips: [{ id: "minecraft-ten", offset: 1.5 }] }, bytes: silhouette(20, 20) }, context)).problems.strips, /strips aren't valid/)
  })

  test("the silhouette glyph is trimmed to the solid pixels", () => {
    const glyph = silhouetteGlyph(PNG.sync.read(Buffer.from(silhouette(10, 10, (x, y) => x > 1 && y > 2 && x < 5))))
    assert.deepEqual([glyph.width, glyph.height, glyph.top, glyph.bottom], [3, 7, 7, 0])
  })
})

describe("publishing shapes", () => {
  const row = { id: 7, name: "Fancy Star", credit: ["Someone"], file: "model-sha" }

  test("a PNG shape is listed and its silhouette held for the generator", async () => {
    const written = await serverImage.write({ row: { ...row, file: "png-sha" }, details: { strips: ["minecraft-ten"] }, read: () => reader(LIST), taken: [] })
    assert.equal(written.asset, "fancy_star")
    const list = JSON.parse(written.files[0].content)
    assert.deepEqual(list.at(-1), { id: "fancy_star", authors: ["Someone"], kind: "png", order: "x", strips: ["minecraft-ten"] })
    const plain = await serverImage.write({ row: { ...row, file: "png-sha" }, details: {}, read: () => reader(LIST), taken: [] })
    assert.equal(JSON.parse(plain.files[0].content).at(-1).strips, undefined)
    assert.deepEqual(written.files[1], { path: "submissions/shapes/fancy_star.png", sha: "png-sha" })
  })

  test("a model shape gets its model, its one texture and a texture list", async () => {
    const written = await serverModel.write({ row, details: { height: 35, files: { texture: "texture-sha" } }, read: () => reader(LIST), taken: [] })
    const paths = written.files.map(file => file.path)
    assert.deepEqual(paths, [LIST, "public/shapes/fancy_star/model.json", "public/shapes/fancy_star/textures/default.png", "public/shapes/fancy_star/textures.json"])
    assert.deepEqual(JSON.parse(written.files[0].content).at(-1), { id: "fancy_star", authors: ["Someone"], kind: "model", height: 35 })
    assert.deepEqual(JSON.parse(written.files[3].content), { textures: { default: { authors: ["Someone"], border: "#000000" } }, overlays: {}, primary: "default", secondary: "default" })
  })

  test("a taken id gets a new one", async () => {
    const written = await serverImage.write({ row: { ...row, name: "Cube" }, details: {}, read: () => reader(LIST), taken: [] })
    assert.notEqual(written.asset, "cube")
  })
})

describe("silhouettePixels", () => {
  test("paints the front from the PNG and the edges from the pixels next to them", async () => {
    const { sheetLayout } = await import("../src/lib/font.js")
    const image = PNG.sync.read(Buffer.from(silhouette(2, 3, () => true)))
    image.data.set([10, 20, 30, 255], 0)
    image.data.set([40, 50, 60, 200], (2 * 2 + 1) * 4)
    const glyph = silhouetteGlyph(image)
    const cells = [{ ...glyph, char: "x", row: 0, column: 0 }]
    const painted = silhouettePixels(cells, 3, 2, image)
    const [, at] = Array.from(sheetLayout(cells, 3, 2))[0]
    const pixel = (x, y) => Array.from(painted.data.subarray((y * painted.width + x) * 4, (y * painted.width + x) * 4 + 4))
    assert.deepEqual(pixel(at.x, at.top), [10, 20, 30, 255])
    assert.deepEqual(pixel(at.x, at.up), [10, 20, 30, 255])
    assert.deepEqual(pixel(at.x + 1, at.top + 2), [40, 50, 60, 200])
    assert.deepEqual(pixel(at.x + 1, at.down + 1), [40, 50, 60, 200])
  })
})

describe("big custom shapes", () => {
  test("shrink the shape but keep every pixel in the texture", async () => {
    const { sheetLayout } = await import("../src/lib/font.js")
    const image = PNG.sync.read(Buffer.from(silhouette(2048, 476)))
    const scale = silhouetteScale(image)
    assert.equal(scale, 8)
    const glyph = silhouetteGlyph(image, scale)
    assert.deepEqual([glyph.width, glyph.height], [256, 60])
    const cells = [{ ...glyph, char: "x", row: 0, column: 0 }]
    const painted = silhouettePixels(cells, 60, 22, image, scale)
    const [, at] = Array.from(sheetLayout(cells, 60, 22))[0]
    assert.equal(painted.width, (at.x + 256) * 8)
    const lift = 60 * 8 - 476
    assert.deepEqual(Array.from(painted.data.subarray(((at.top * 8 + lift) * painted.width + at.x * 8) * 4, ((at.top * 8 + lift) * painted.width + at.x * 8) * 4 + 4)), [200, 40, 40, 255])
  })

  test("fill the see-through pixels inside a solid block", async () => {
    const { sheetLayout } = await import("../src/lib/font.js")
    const image = PNG.sync.read(Buffer.from(silhouette(2, 2, (x, y) => !(x === 1 && y === 0))))
    const glyph = silhouetteGlyph(image, 2)
    assert.deepEqual(Array.from(glyph.mask), [1])
    const cells = [{ ...glyph, char: "x", row: 0, column: 0 }]
    const painted = silhouettePixels(cells, 1, 1, image, 2)
    const [, at] = Array.from(sheetLayout(cells, 1, 1))[0]
    const at4 = (at.top * 2 * painted.width + at.x * 2 + 1) * 4
    assert.deepEqual(Array.from(painted.data.subarray(at4, at4 + 4)), [200, 40, 40, 255])
  })

  test("leave shapes that fit at one pixel per unit", () => {
    assert.equal(silhouetteScale(PNG.sync.read(Buffer.from(silhouette(200, 60)))), 1)
  })

  test("one sample of the PNG gives the same glyph and texture as measuring it each time", () => {
    const image = PNG.sync.read(Buffer.from(silhouette(600, 150, (x, y) => (x + y) % 7 !== 0 && x > 3)))
    const sample = silhouetteSample(image)
    const scale = silhouetteScale(image)
    assert.equal(sample.scale, 3)
    assert.equal(scale, 3)
    const glyph = sampleGlyph(sample)
    assert.deepEqual(glyph, silhouetteGlyph(image, scale))
    const cells = [{ ...glyph, char: "x", row: 0, column: 0 }]
    assert.deepEqual(samplePixels(cells, glyph.height, 22, sample), silhouettePixels(cells, glyph.height, 22, image, scale))
  })
})

describe("frontView", () => {
  test("fills a hole the shape closes in with the ring colour", () => {
    const texture = new PNG({ width: 16, height: 16 })
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) texture.data.set(x >= 4 && x < 12 && y >= 4 && y < 12 ? [0, 0, 0, 0] : [255, 255, 255, 255], (y * 16 + x) * 4)
    }
    const view = frontView({ elements: [{ from: [0, 0, 0], to: [48, 48, 1], faces: { north: { uv: [0, 0, 16, 16] } } }] }, texture, [10, 20, 30])
    const middle = (Math.floor(view.height / 2) * view.width + Math.floor(view.width / 2)) * 4
    assert.deepEqual(Array.from(view.data.subarray(middle, middle + 4)), [10, 20, 30, 255])
    assert.deepEqual(Array.from(view.data.subarray(0, 4)), [10, 20, 30, 255])
  })

  test("draws the north faces with a ring around them", () => {
    const texture = new PNG({ width: 16, height: 16 })
    texture.data.fill(255)
    const view = frontView({ elements: [{ from: [0, 0, 0], to: [8, 16, 1], faces: { north: { uv: [0, 0, 16, 16] } } }] }, texture)
    assert.equal(view.width, 8 + 4)
    assert.deepEqual(Array.from(view.data.subarray(0, 4)), [0, 0, 0, 255])
    assert.deepEqual(Array.from(view.data.subarray((8 * view.width + 6) * 4, (8 * view.width + 6) * 4 + 4)), [255, 255, 255, 255])
  })
})
