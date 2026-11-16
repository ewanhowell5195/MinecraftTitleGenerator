import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { generatedAlpha } from "../src/lib/texture/generatedOverlays.js"

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
})
