import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { PNG } from "pngjs"
import { seeThrough, tileableImage, tileableSizeProblem } from "#lib/submissions/kinds/tileable.js"

test("published tileables follow the submission rules", () => {
  const list = JSON.parse(fs.readFileSync("public/tileables/tileables.json", "utf8"))
  for (const [id, data] of Object.entries(list)) {
    const own = PNG.sync.read(fs.readFileSync(path.join("public", tileableImage(list, id))))
    assert.equal(tileableSizeProblem(own), null, id)
    assert.equal(seeThrough(own.data), false, `${id} has see-through pixels`)
    for (const [variantId, variant] of Object.entries(data.variants ?? {})) {
      const image = PNG.sync.read(fs.readFileSync(path.join("public/tileables", variant.path ?? data.path ?? "minecraft", `${variantId}.png`)))
      assert.deepEqual([image.width, image.height], [own.width, own.height], `${variantId} is the size of ${id}`)
      assert.equal(seeThrough(image.data), false, `${variantId} has see-through pixels`)
    }
  }
})
