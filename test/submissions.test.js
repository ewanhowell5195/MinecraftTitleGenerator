import { describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { PNG } from "pngjs"
import { templateProblem } from "../src/lib/submissionKinds/fontAsset.js"
import { opaqueCells, pngProblem, templateScore, textureDensity } from "../src/lib/submissions.js"

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
