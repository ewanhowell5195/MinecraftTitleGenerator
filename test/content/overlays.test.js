import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { decodePng } from "../../src/lib/submissions/kinds/png.js"
import { paletteHexes, paletteOf } from "../../src/lib/texture/overlayColours.js"

test("every stored overlay palette matches its image, and no overlay is complex", async () => {
  for (const file of fs.readdirSync("public/fonts", { recursive: true }).filter(name => name.endsWith("textures.json"))) {
    const folder = path.join("public/fonts", path.dirname(file))
    const list = JSON.parse(fs.readFileSync(path.join("public/fonts", file), "utf8"))
    for (const [id, definition] of Object.entries(list.overlays ?? {})) {
      const image = path.join(folder, "overlays", `${id}.png`)
      if (!fs.existsSync(image)) continue
      const { anchors, complex } = paletteOf((await decodePng(new Uint8Array(fs.readFileSync(image)), Infinity)).data)
      assert.equal(complex, false, image)
      assert.deepEqual(definition.palette ?? ["#ffffff"], paletteHexes(anchors), image)
    }
  }
})
