import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { test } from "node:test"
import { parsedSheet } from "../../src/lib/font/editor/sheet.js"
import { fontFromOutlines, meshOutlines, parseFontFile } from "../../src/lib/font/fontImport.js"
import { fineMasks, glyphMeshes } from "../../src/lib/font/meshGlyphs.js"
import { generatedAlpha } from "../../src/lib/texture/overlays/faces.js"

test("side highlights on the shape test font match the recorded output", async () => {
  const file = fs.readFileSync(new URL("../fixtures/ShapeTest.otf", import.meta.url))
  const source = await parseFontFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  const meshes = glyphMeshes(meshOutlines(source, { height: 40 }))
  const { list } = parsedSheet(fontFromOutlines(source, { height: 40 }), 2)
  const digests = {}
  for (const cell of list.filter(item => meshes[item.char] && item.char !== item.char.toLowerCase())) {
    const fine = fineMasks(meshes[cell.char], cell, cell)
    for (const kind of ["top", "bottom", "left", "right"]) {
      for (const thickness of [1, 2, 5]) {
        const alpha = generatedAlpha({ ...cell, placedX: 0, fine }, kind, { thickness }, 40, 8)
        digests[`${cell.char} ${kind} ${thickness}`] = createHash("sha1").update(Uint8Array.from(alpha, value => Math.round(value * 255))).digest("hex").slice(0, 16)
      }
    }
  }
  const recorded = new URL("../fixtures/shape-test-highlights.json", import.meta.url)
  if (process.env.UPDATE_FIXTURES) fs.writeFileSync(recorded, JSON.stringify(digests, null, 2) + "\n")
  const expected = JSON.parse(fs.readFileSync(recorded, "utf8"))
  assert.deepEqual(Object.keys(digests).filter(key => digests[key] !== expected[key]), [])
  assert.deepEqual(Object.keys(digests), Object.keys(expected))
})
