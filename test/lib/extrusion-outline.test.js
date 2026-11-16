import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { generatedAlpha } from "../../src/lib/texture/overlays/faces.js"
import { joinNeighbours } from "../../src/lib/geometry/joins.js"
import { glyphOf, rowsOf } from "../helpers/overlays.js"

function glyph(caster) {
  return { width: 5, height: 5, bottom: 0, mask: new Uint8Array(25).fill(1), caster }
}

function centre() {
  const caster = new Uint8Array(25)
  caster[2 * 5 + 2] = 1
  return caster
}

const lit = alpha => Array.from(alpha).filter(value => value > 0).length

describe("extrusion outline", () => {
  test("rings the front layer's shape, corners included, without covering it", () => {
    const alpha = generatedAlpha(glyph(centre()), "extrusion_outline", { thickness: 1 }, 5, 1)
    assert.equal(lit(alpha), 8)
    assert.equal(alpha[2 * 5 + 2], 0)
  })

  test("follows the thickness at finer scales", () => {
    assert.equal(lit(generatedAlpha(glyph(centre()), "extrusion_outline", { thickness: 0.5 }, 5, 2)), 12)
    assert.equal(lit(generatedAlpha(glyph(centre()), "extrusion_outline", { thickness: 2 }, 5, 1)), 24)
  })

  test("draws nothing on a layer with nothing in front", () => {
    assert.equal(lit(generatedAlpha(glyph(null), "extrusion_outline", { thickness: 1 }, 5, 1)), 0)
  })

  test("carries on across a touching neighbour's front layer", () => {
    const left = { ...glyphOf(["1111", "1111"]), caster: glyphOf(["0011", "0011"]).mask }
    const right = { ...glyphOf(["1111", "1111"], { placedX: 4 }), caster: glyphOf(["0000", "0000"]).mask }
    joinNeighbours([left, right])
    const whole = { ...glyphOf(["11111111", "11111111"]), caster: glyphOf(["00110000", "00110000"]).mask }
    for (const [scale, thickness] of [[1, 1], [2, 1.5], [1, 3]]) {
      const joined = rowsOf(generatedAlpha(right, "extrusion_outline", { thickness }, 2, scale), 4 * scale)
      assert.deepEqual(joined, rowsOf(generatedAlpha(whole, "extrusion_outline", { thickness }, 2, scale), 8 * scale).map(row => row.slice(4 * scale)), `${scale} ${thickness}`)
      assert.ok(joined.every(row => row[0] === 1))
    }
  })
})
