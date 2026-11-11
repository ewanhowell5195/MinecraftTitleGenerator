import { describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import zlib from "node:zlib"
import { PNG } from "pngjs"
import { templateProblem } from "../src/lib/submissionKinds/fontAsset.js"
import { decodePng } from "../src/lib/submissionKinds/png.js"
import { SUBMISSION_LIMITS, opaqueCells, pngProblem, templateScore, textureDensity } from "../src/lib/submissions.js"

function read(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function template(font) {
  const flat = read(`public/font/${font}/textures/flat.png`)
  return { width: flat.width, height: flat.height, cells: opaqueCells(flat.data, flat.width, flat.height, 1, 128) }
}

function score(kind, file, font) {
  const image = read(file)
  const flat = template(font)
  return templateScore(kind, opaqueCells(image.data, image.width, image.height, textureDensity(image, flat), 1), flat.cells)
}

describe("template matching", () => {
  test("tells apart fonts whose templates are the same size", () => {
    const dungeons = template("minecraft-dungeons")
    const serif = template("minecraft-ten-serif")
    assert.deepEqual([dungeons.width, dungeons.height], [serif.width, serif.height])
    for (const [file, right, wrong] of [["public/font/minecraft-dungeons/textures/flat.png", "minecraft-dungeons", "minecraft-ten-serif"], ["public/font/minecraft-ten-serif/textures/flat.png", "minecraft-ten-serif", "minecraft-dungeons"]]) {
      assert.ok(score("texture", file, right) > score("texture", file, wrong))
    }
  })

  test("scores an overlay by how much of it sits on the letters", () => {
    assert.ok(score("overlay", "public/font/minecraft-ten/overlays/cracks.png", "minecraft-ten") > 0.9)
    const empty = new Uint8Array(4)
    assert.equal(templateScore("overlay", empty, Uint8Array.of(1, 1, 0, 0)), 0)
  })

  test("counts a cell as painted when any pixel in it shows", () => {
    const rgba = new Uint8Array(4 * 4 * 4)
    rgba[(1 * 4 + 3) * 4 + 3] = 1
    assert.deepEqual(Array.from(opaqueCells(rgba, 4, 4, 2, 1)), [0, 1, 0, 0])
    assert.deepEqual(Array.from(opaqueCells(rgba, 4, 4, 2, 128)), [0, 0, 0, 0])
  })
})

describe("image checks", () => {
  test("checks the file before the template", () => {
    assert.match(pngProblem(null, "overlay"), /Choose the overlay's file/)
    assert.match(pngProblem(Uint8Array.of(1, 2, 3), "texture"), /has to be a PNG/)
    const png = new Uint8Array(PNG.sync.write(new PNG({ width: 570, height: 444 })))
    assert.equal(pngProblem(png, "texture"), null)
    assert.equal(templateProblem(png, { width: 570, height: 444 }, "texture"), null)
    assert.match(templateProblem(png, { width: 572, height: 479 }, "texture"), /template size, 572x479/)
  })
})

describe("reading a PNG", () => {
  function chunk(type, data) {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)])
  }

  function png(width, height, pixels, options) {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header.set([8, 6], 8)
    return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(pixels, options)), chunk("IEND", Buffer.alloc(0))]))
  }

  test("reads the pixels its header promises", () => {
    const image = decodePng(png(2, 3, Buffer.alloc(3 * 9)))
    assert.deepEqual([image.width, image.height, image.data.length], [2, 3, 24])
  })

  test("refuses a header bigger than a submission can be before reading the pixels", () => {
    assert.throws(() => decodePng(png(SUBMISSION_LIMITS.side + 1, 1, Buffer.alloc(1))), /4097x1, and it can be up to 4096 pixels/)
    assert.throws(() => decodePng(png(1, 0xffffffff, Buffer.alloc(1))), /1x4294967295/)
  })

  test("refuses pixels that inflate past what the header promises", () => {
    assert.throws(() => decodePng(png(2, 3, Buffer.alloc(5000000))), /more pixels than its size allows/)
    assert.throws(() => decodePng(png(2, 3, Buffer.alloc(5000000), { level: 0 })), /more pixels than its size allows/)
    assert.throws(() => decodePng(png(2, 3, Buffer.alloc(3 * 9 + 1))), /more pixels than its size allows/)
  })

  test("refuses pixels that stop early", () => {
    assert.throws(() => decodePng(png(2, 3, Buffer.alloc(3 * 9 - 1))), /cut short/)
  })
})
