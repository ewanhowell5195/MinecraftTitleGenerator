import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { layoutPages, pageGroups, regionScales } from "../src/lib/atlas.js"

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
})
