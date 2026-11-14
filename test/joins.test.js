import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { boxesFor } from "../src/lib/boxes.js"
import { crackList, edgeAlpha, generatedAlpha } from "../src/lib/generated.js"
import { clippedBoxes, joinNeighbours } from "../src/lib/joins.js"

function glyph(rows, placedX) {
  const width = rows[0].length
  const mask = Uint8Array.from(rows.slice().reverse().join(""), cell => Number(cell))
  return { char: "x", width, height: rows.length, bottom: 0, lift: 0, mask, placedX }
}

function linked(...chain) {
  joinNeighbours(chain)
  return chain
}

function spans(item) {
  const rows = new Map()
  for (const box of clippedBoxes(boxesFor(item.mask, item.width, item.height, item.placedX, item.bottom), item, item.placedX)) {
    for (let row = box.from[1]; row < box.to[1]; row++) {
      const [from, to] = rows.get(row) ?? [Infinity, -Infinity]
      rows.set(row, [Math.min(from, box.from[0]), Math.max(to, box.to[0])])
    }
  }
  return Array.from(rows).sort((a, b) => a[0] - b[0]).map(([row, [from, to]]) => [row, from, to])
}

describe("joined characters", () => {
  test("overlapping rows are cut down the middle of the overlap", () => {
    const [left, right] = linked(glyph(["1111", "1111"], 0), glyph(["1111", "1111"], 3))
    assert.deepEqual(spans(left), [[0, 0, 3.5], [1, 0, 3.5]])
    assert.deepEqual(spans(right), [[0, 3.5, 7], [1, 3.5, 7]])
  })

  test("rows where only one character reaches the overlap stay whole", () => {
    const [left, right] = linked(glyph(["1111", "1111"], 0), glyph(["1111", "0011"], 2))
    assert.deepEqual(spans(left), [[0, 0, 4], [1, 0, 3]])
    assert.deepEqual(spans(right), [[0, 4, 6], [1, 3, 6]])
  })

  test("spacing off the pixel grid cuts partway through a pixel", () => {
    const [left, right] = linked(glyph(["111"], 0), glyph(["111"], 2.5))
    assert.deepEqual(spans(left), [[0, 0, 2.75]])
    assert.deepEqual(spans(right), [[0, 2.75, 5.5]])
  })

  test("characters that don't touch are left alone", () => {
    const [left, right] = linked(glyph(["11"], 0), glyph(["11"], 3))
    assert.equal(left.clips, undefined)
    assert.deepEqual(spans(right), [[0, 3, 5]])
  })

  test("cracks don't start on a side that joins the next character", () => {
    const square = Array.from({ length: 24 }, () => "1".repeat(24))
    const sides = item => new Set(crackList(item, { amount: 100 }).map(crack => crack.side))
    assert.ok(sides(glyph(square, 0)).has("right"))
    const [left] = linked(glyph(square, 0), glyph(square, 22))
    assert.ok(!sides(left).has("right"))
    assert.ok(sides(left).size)
  })

  test("an edge outline stays open where the top face carries on into the next character", () => {
    const middle = (alpha, x) => alpha[2 * 3 + x]
    const alone = glyph(["111", "111"], 0)
    const [left] = linked(glyph(["111", "111"], 0), glyph(["111", "111"], 3))
    assert.equal(middle(edgeAlpha(alone, "up", "edge_outline", {}, 5, 1), 2), 1)
    assert.equal(middle(edgeAlpha(left, "up", "edge_outline", {}, 5, 1), 2), 0)
    assert.equal(middle(edgeAlpha(left, "up", "edge_outline", {}, 5, 1), 0), 1)
  })

  test("a half unit gap keeps the outline on both sides", () => {
    const [left, right] = linked(glyph(["111", "111", "111"], 0), glyph(["111", "111", "111"], 3.5))
    const column = (alpha, x) => [0, 1, 2].map(row => alpha[row * 3 + x])
    assert.deepEqual(column(generatedAlpha(left, "outline", {}, 3, 1), 2), [1, 1, 1])
    assert.deepEqual(column(generatedAlpha(right, "outline", {}, 3, 1), 0), [1, 1, 1])
  })

  test("a half unit overlap still joins the outline on both sides", () => {
    const [left, right] = linked(glyph(["111", "111", "111"], 0), glyph(["111", "111", "111"], 2.5))
    const column = (alpha, x) => [0, 1, 2].map(row => alpha[row * 3 + x])
    assert.deepEqual(column(generatedAlpha(left, "outline", {}, 3, 1), 2), [1, 0, 1])
    assert.deepEqual(column(generatedAlpha(right, "outline", {}, 3, 1), 0), [1, 0, 1])
  })

  test("an edge outline stays open where a run meets the next character's run inside the boxes", () => {
    const [left] = linked(glyph(["1111", "1100"], 0), glyph(["1111", "0011"], 0))
    assert.equal(edgeAlpha(left, "down", "edge_outline", {}, 5, 1)[2 * 4 + 1], 0)
  })

  test("an outline runs round the joined shape, not down the seam", () => {
    const [left] = linked(glyph(["111", "111", "111"], 0), glyph(["111", "111", "111"], 3))
    const alone = glyph(["111", "111", "111"], 0)
    const column = (alpha, x) => [0, 1, 2].map(row => alpha[row * 3 + x])
    assert.deepEqual(column(generatedAlpha(alone, "outline", {}, 3, 1), 2), [1, 1, 1])
    assert.deepEqual(column(generatedAlpha(left, "outline", {}, 3, 1), 2), [1, 0, 1])
  })
})
