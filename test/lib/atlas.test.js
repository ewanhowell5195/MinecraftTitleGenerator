import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { layoutPages, pageGroups } from "../../src/lib/texture/atlas/pages.js"
import { regionScales } from "../../src/lib/texture/atlas/scales.js"

function plan(count, width, height, depth) {
  const blocks = Array.from({ length: count }, (_, glyph) => ({ glyph, char: `g${glyph}`, own: { minX: 0, maxX: width, minY: 0, maxY: height, width, height }, rect: { minX: 0, maxY: height }, spaces: 0 }))
  return { blocks, runs: [], depth, glyphs: blocks.map(block => block.glyph), spaces: blocks.map(() => 0) }
}

describe("page layout", () => {
  test("keeps to the limit when only a shelf as wide as the limit fits", () => {
    const letters = plan(3, 4, 6, 8)
    const scales = regionScales({ front: 4, edge: { along: 4, deep: 1 } })
    const pages = layoutPages(letters, pageGroups(letters, scales, 200), scales, { glyphs: {} }, 200)
    for (const page of pages) assert.ok(page.width <= 200 && page.height <= 200, `${page.width}x${page.height}`)
  })

  test("keeps the characters in order, wrapping onto more rows", () => {
    const widths = [8, 3, 10, 5, 9, 2, 7]
    const letters = plan(widths.length, 4, 6, 4)
    for (const [glyph, block] of letters.blocks.entries()) Object.assign(block.own, { width: widths[glyph], maxX: widths[glyph], height: 4 + glyph % 3 })
    const scales = regionScales(null)
    const [page] = layoutPages(letters, pageGroups(letters, scales, Infinity), scales, { glyphs: {} }, Infinity)
    const places = letters.blocks.map(block => page.regions.get(block.glyph).up)
    const inOrder = places.every((place, index) => !index || place.y > places[index - 1].y || place.y === places[index - 1].y && place.x > places[index - 1].x)
    assert.ok(inOrder, JSON.stringify(places.map(({ x, y }) => [x, y])))
    assert.ok(new Set(places.map(({ y }) => y)).size > 1)
  })
})
