import assert from "node:assert/strict"
import fs from "node:fs"
import { test } from "node:test"
import { parsedSheet } from "#lib/font/editor/sheet.js"
import { fontFromOutlines, meshOutlines, parseFontFile } from "#lib/font/fontImport.js"
import { fineMasks, glyphMeshes } from "#lib/font/meshGlyphs.js"
import { generatedAlpha } from "#lib/texture/overlays/faces.js"
import { fineShapes } from "#lib/texture/overlays/fineShapes.js"

const SCALE = 8

function filled(loops, columns, rows) {
  const inside = new Uint8Array(columns * rows)
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) / SCALE
    const crossings = []
    for (const loop of loops) {
      for (const [index, [ax, ay]] of loop.entries()) {
        const [bx, by] = loop[(index + 1) % loop.length]
        if (ay > y !== by > y) crossings.push(ax + (y - ay) * (bx - ax) / (by - ay))
      }
    }
    crossings.sort((a, b) => a - b)
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      for (let column = Math.max(0, Math.ceil(crossings[pair] * SCALE - 0.5)); column < columns && (column + 0.5) / SCALE < crossings[pair + 1]; column++) inside[row * columns + column] = 1
    }
  }
  return inside
}

async function curvedGlyphs() {
  const file = fs.readFileSync(new URL("../fixtures/ShapeTest.otf", import.meta.url))
  const source = await parseFontFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  const meshes = glyphMeshes(meshOutlines(source, { height: 40 }))
  const { list } = parsedSheet(fontFromOutlines(source, { height: 40 }), 2)
  return list.filter(item => meshes[item.char] && item.char !== item.char.toLowerCase()).slice(0, 4).map(cell => ({ ...cell, placedX: 0, fine: fineMasks(meshes[cell.char], cell, cell) }))
}

function mismatches(glyph, loops, alpha, shown) {
  const columns = glyph.width * SCALE
  const inside = filled(loops, columns, glyph.height * SCALE)
  return Array.from(alpha).filter((value, index) => !!inside[index] !== (value >= 0.5 && shown(Math.floor(index / columns))))
}

test("exact shapes of curved overlays cover the same fine pixels as the drawn overlay", async () => {
  const glyphs = await curvedGlyphs()
  assert.ok(glyphs.length)
  for (const glyph of glyphs) {
    for (const [kind, layer] of [["outline", { thickness: 2 }], ["outline", { thickness: 1, inset: 2 }], ["top", { thickness: 2 }], ["left", { thickness: 3 }], ["corners", {}], ["two_tone_outline_light", { thickness: 2 }], ["two_tone_outline_dark", { thickness: 2 }]]) {
      const loops = fineShapes(glyph, kind, layer, 40)
      const alpha = generatedAlpha(glyph, kind, layer, 40, SCALE)
      const wrong = mismatches(glyph, loops, alpha, () => true)
      assert.ok(wrong.every(value => value > 0.1 && value < 0.9), `${glyph.char} ${kind} ${JSON.stringify(layer)}`)
    }
  }
})

test("exact shapes of curved fades cover the outline only where the fade shows", async () => {
  const glyphs = await curvedGlyphs()
  for (const glyph of glyphs) {
    for (const kind of ["outline_fade", "outline_fade_inverted"]) {
      const layer = { thickness: 2, spread: 60 }
      const loops = fineShapes(glyph, kind, layer, 40)
      const outline = generatedAlpha(glyph, "outline", { ...layer, inset: 0 }, 40, SCALE)
      const faded = generatedAlpha(glyph, kind, layer, 40, SCALE)
      const columns = glyph.width * SCALE
      const wrong = mismatches(glyph, loops, outline, row => faded.subarray(row * columns, (row + 1) * columns).some(value => value > 0))
      assert.ok(wrong.length < outline.filter(value => value >= 0.5).length * 0.02, `${glyph.char} ${kind}: ${wrong.length}`)
    }
  }
})
