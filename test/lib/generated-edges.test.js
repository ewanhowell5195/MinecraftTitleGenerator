import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { crackList, crackTriangle, crackWrap } from "../../src/lib/texture/overlays/cracks.js"
import { edgeAlpha } from "../../src/lib/texture/overlays/edges.js"
import { generatedAlpha } from "../../src/lib/texture/overlays/faces.js"
import { layerGlyph } from "../../src/lib/font/flatSheet.js"
import { joinNeighbours } from "../../src/lib/geometry/joins.js"
import { columnOf, glyphOf, near, picture, rowsOf, solid } from "../helpers/overlays.js"

describe("edge overlays", () => {
  const glyph = glyphOf(["1111111", "1110111"])

  test("front highlight lights only the row by the face", () => {
    assert.deepEqual(picture(edgeAlpha(glyph, "up", "edge_front", {}, 3, 1), 7), ["0000000", "0000000", "1111111"])
    assert.deepEqual(picture(edgeAlpha(glyph, "down", "edge_front", {}, 3, 1), 7), ["1110111", "0000000", "0000000"])
  })

  test("front highlight thickness goes deeper with no end caps", () => {
    assert.deepEqual(picture(edgeAlpha(glyph, "down", "edge_front", { thickness: 2 }, 3, 1), 7), ["1110111", "1110111", "0000000"])
  })

  test("outline frames each run of the edge", () => {
    assert.deepEqual(picture(edgeAlpha(glyph, "up", "edge_outline", {}, 3, 1), 7), ["1111111", "1000001", "1111111"])
    assert.deepEqual(picture(edgeAlpha(glyph, "down", "edge_outline", {}, 3, 1), 7), ["1110111", "1010101", "1110111"])
  })

  test("outline thickness narrows the opening", () => {
    assert.deepEqual(picture(edgeAlpha(glyph, "up", "edge_outline", { thickness: 2 }, 5, 1), 7), ["1111111", "1111111", "1100011", "1111111", "1111111"])
  })

  test("outline thicker than the depth fills the run", () => {
    assert.deepEqual(picture(edgeAlpha(glyph, "down", "edge_outline", { thickness: 8 }, 2, 1), 7), ["1110111", "1110111"])
  })

  test("open outline leaves out the front row", () => {
    assert.deepEqual(picture(edgeAlpha(glyph, "up", "edge_outline_open", {}, 3, 1), 7), ["1111111", "1000001", "1000001"])
    assert.deepEqual(picture(edgeAlpha(glyph, "down", "edge_outline_open", {}, 3, 1), 7), ["1010101", "1010101", "1110111"])
  })

  test("fading outline grows from nothing at the front to full at the back", () => {
    const rows = rowsOf(edgeAlpha(glyph, "up", "edge_outline_fade", {}, 3, 1), 7)
    assert.deepEqual(rows, [[1, 1, 1, 1, 1, 1, 1], [0.5, 0, 0, 0, 0, 0, 0.5], [0, 0, 0, 0, 0, 0, 0]])
  })

  test("the fading outline grows smoothly at higher detail", () => {
    const column = columnOf(edgeAlpha(glyph, "up", "edge_outline_fade", {}, 3, 4), 28, 0)
    assert.equal(new Set(column).size > 6, true)
    for (let row = 1; row < column.length; row++) assert.ok(column[row] <= column[row - 1])
  })

  test("upscales each pixel into a block", () => {
    const alpha = edgeAlpha(glyphOf(["10"]), "up", "edge_front", {}, 1, 2)
    assert.deepEqual(picture(alpha, 4), ["1100", "1100"])
  })

  test("scale sizes the output by width and depth", () => {
    assert.equal(edgeAlpha(glyph, "up", "edge_outline", {}, 3, 4).length, 7 * 4 * 3 * 4)
  })
})

describe("rounded edge overlay", () => {
  const glyph = solid(4, 1)

  test("masks only the far corners", () => {
    const rows = rowsOf(edgeAlpha(glyph, "down", "edge_rounded", { radius: 1 }, 2, 4), 16)
    for (const row of rows.slice(0, 4)) assert.deepEqual(row, new Array(16).fill(0))
    for (const row of rows.slice(4)) assert.deepEqual(row.slice(4, 12), new Array(8).fill(0))
    assert.equal(rows[7][0], 1)
    assert.equal(rows[7][15], 1)
  })

  test("antialiases along the curve", () => {
    const rows = rowsOf(edgeAlpha(glyph, "down", "edge_rounded", { radius: 1 }, 2, 4), 16)
    near(rows[6][0], 0.8012)
    near(rows[7][1], 0.8012)
    near(rows[6][1], 0.0355)
    assert.equal(rows[4][3], 0)
  })

  test("the left and right corners mirror", () => {
    for (const row of rowsOf(edgeAlpha(glyph, "down", "edge_rounded", { radius: 1 }, 2, 4), 16)) assert.deepEqual(row, row.toReversed())
  })

  test("the up side is the down side flipped", () => {
    const down = rowsOf(edgeAlpha(glyph, "down", "edge_rounded", { radius: 1 }, 2, 4), 16)
    const up = rowsOf(edgeAlpha(glyph, "up", "edge_rounded", { radius: 1 }, 2, 4), 16)
    assert.deepEqual(up, down.toReversed())
  })

  test("defaults to a radius of two", () => {
    const rows = rowsOf(edgeAlpha(solid(8, 1), "down", "edge_rounded", {}, 4, 1), 8)
    near(rows[3][0], 0.6213)
    near(rows[3][1], 0.0811)
    near(rows[2][0], 0.0811)
    assert.equal(rows[2][1], 0)
    assert.equal(rows[1][0], 0)
  })

  test("the radius is limited by the depth", () => {
    const rows = rowsOf(edgeAlpha(solid(10, 1), "down", "edge_rounded", { radius: 8 }, 1, 4), 40)
    assert.equal(rows[3][0], 1)
    for (const row of rows) assert.deepEqual(row.slice(4, 36), new Array(32).fill(0))
  })

  test("the radius is limited by half the run", () => {
    const rows = rowsOf(edgeAlpha(solid(1, 1), "down", "edge_rounded", { radius: 2 }, 2, 4), 4)
    near(rows[7][0], 0.6213)
    near(rows[7][1], 0.0811)
    near(rows[7][2], 0.0811)
    near(rows[7][3], 0.6213)
    assert.deepEqual(rows[5], [0, 0, 0, 0])
  })

  test("each run on the edge rounds on its own", () => {
    const rows = rowsOf(edgeAlpha(glyphOf(["11011"]), "down", "edge_rounded", { radius: 1 }, 2, 4), 20)
    assert.equal(rows[7][0], 1)
    assert.equal(rows[7][7], 1)
    assert.equal(rows[7][12], 1)
    assert.equal(rows[7][19], 1)
    assert.deepEqual(rows[7].slice(8, 12), [0, 0, 0, 0])
  })
})

describe("cracks", () => {
  const scale = 4
  const block = solid(40, 40)
  const busy = { amount: 100 }

  function crackedOn(glyph, side, line) {
    return Array.from({ length: 40 }, (_, seed) => ({ amount: 100, seed })).find(settings => crackList(glyph, settings).some(crack => crack.side === side && crack.line === line))
  }

  function lit(alpha, columns, row) {
    return rowsOf(alpha, columns)[row].flatMap((value, index) => value ? [index] : [])
  }

  test("the same glyph and settings give the same cracks", () => {
    assert.deepEqual(crackList(block, busy), crackList(solid(40, 40), { amount: 100 }))
    assert.notDeepEqual(crackList(block, busy), crackList(block, { amount: 100, seed: 1 }))
    assert.notDeepEqual(crackList(block, busy), crackList(solid(40, 40, { placedX: 50 }), busy))
  })

  test("every crack starts on an edge of the glyph", () => {
    const list = crackList(block, busy)
    assert.ok(list.length > 1)
    for (const crack of list) {
      assert.equal(crack.line, crack.side === "up" || crack.side === "left" ? 0 : 40)
      assert.ok(crack.from >= 0 && crack.to <= 40 && crack.to > crack.from)
    }
    assert.ok(new Set(list.map(crack => crack.side)).size >= 2)
  })

  test("a hole has edges of its own", () => {
    const ring = glyphOf(new Array(40).fill(0).map((_, row) => row >= 10 && row < 30 ? "1".repeat(10) + "0".repeat(20) + "1".repeat(10) : "1".repeat(40)))
    const lines = new Set(Array.from({ length: 32 }, (_, seed) => seed).flatMap(seed => crackList(ring, { amount: 100, seed })).map(crack => `${crack.side} ${crack.line}`))
    for (const edge of ["down 10", "up 30", "right 10", "left 30"]) assert.ok(lines.has(edge), edge)
  })

  test("no crack starts within two units, or its own width, of a corner", () => {
    const notched = glyphOf(new Array(40).fill(0).map((_, row) => row < 20 ? "1".repeat(20) + "0".repeat(20) : "1".repeat(40)))
    const corners = { up: [[0, 0, 20], [20, 20, 40]], down: [[40, 0, 40]], left: [[0, 0, 40]], right: [[20, 0, 20], [40, 20, 40]] }
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const list = crackList(notched, { amount: 100, seed })
      assert.ok(list.length)
      for (const crack of list) {
        const [, from, to] = corners[crack.side].find(([line]) => line === crack.line)
        const gap = Math.max(2, crack.to - crack.from)
        assert.ok(crack.from >= from + gap - 1e-9 && crack.to <= to - gap + 1e-9, JSON.stringify(crack))
      }
    }
  })

  test("an edge too short to keep clear of its corners gets no crack", () => {
    assert.deepEqual(crackList(solid(5, 5), { amount: 100, width: 2 }), [])
  })

  test("more cracks only adds new ones, it never moves the ones already there", () => {
    const block = solid(80, 60)
    for (const seed of [0, 3, 7]) {
      let before = []
      for (const amount of [5, 20, 40, 70, 100]) {
        const list = crackList(block, { amount, seed })
        assert.ok(before.every(crack => list.some(other => JSON.stringify(other) === JSON.stringify(crack))), `${seed} ${amount}`)
        before = list
      }
      assert.ok(before.length > crackList(block, { amount: 5, seed }).length)
    }
  })

  test("a longer or wider crack never moves the cracks, it only drops ones that no longer fit", () => {
    const spot = crack => `${crack.side} ${crack.line} ${(crack.from + crack.to) / 2}`
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      let before = null
      for (const length of [2, 4, 6, 9, 14, 20]) {
        const spots = crackList(solid(40, 60), { amount: 60, length, seed }).map(spot)
        if (before) assert.ok(spots.every(item => before.includes(item)), `${seed} ${length}`)
        before = spots
      }
      const wide = crackList(solid(40, 60), { amount: 60, width: 6, seed }).map(spot)
      const narrow = crackList(solid(40, 60), { amount: 60, width: 1, seed }).map(spot)
      assert.ok(wide.every(item => narrow.includes(item)), `${seed}`)
    }
  })

  test("letters next to each other never crack their outer walls in the same place", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const letters = [0, 50, 100, 150, 200].map(placedX => ({ ...solid(40, 60), placedX }))
      for (const [index, letter] of letters.entries()) {
        if (index) Object.defineProperty(letter, "previous", { value: letters[index - 1] })
        if (index < letters.length - 1) Object.defineProperty(letter, "next", { value: letters[index + 1] })
      }
      const lists = letters.map(letter => crackList(letter, { amount: 60, seed }))
      const wall = crack => crack.side === "left" || crack.side === "right" ? "side" : crack.side
      for (let index = 1; index < lists.length; index++) {
        for (const crack of lists[index]) {
          for (const other of lists[index - 1].filter(item => wall(item) === wall(crack))) assert.ok(other.to + 6 <= crack.from || crack.to + 6 <= other.from, `${seed} ${index}`)
        }
      }
      assert.ok(lists.every(list => list.length), `${seed}`)
    }
  })

  test("no crack sits opposite another across the letter", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const list = crackList(solid(30, 90), { amount: 100, seed })
      for (const crack of list) {
        const facing = { up: "down", down: "up", left: "right", right: "left" }[crack.side]
        for (const other of list.filter(item => item.side === facing)) assert.ok(other.to + 6 <= crack.from || crack.to + 6 <= other.from, `${seed}`)
      }
    }
  })

  test("a few cracks are spread across the face, not bunched on one side", () => {
    const middle = ({ side, line, from, to }) => side === "up" || side === "down" ? [(from + to) / 2, line] : [line, (from + to) / 2]
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const list = crackList(solid(60, 60), { amount: 30, seed })
      assert.ok(list.length >= 2, `${seed}`)
      for (const [index, crack] of list.entries()) {
        for (const other of list.slice(index + 1)) assert.ok(Math.hypot(...middle(crack).map((value, axis) => value - middle(other)[axis])) > 15, `${seed}`)
      }
    }
  })

  test("cracks are shared out evenly between letters", () => {
    const letters = [0, 100, 200, 300, 400, 500, 600, 700].map(placedX => ({ ...solid(40, 60), placedX }))
    for (const amount of [20, 30]) {
      const counts = letters.map(letter => crackList(letter, { amount, seed: 2 }).length)
      assert.ok(Math.min(...counts) > 0, `${amount}: ${counts}`)
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `${amount}: ${counts}`)
    }
  })

  test("no two cracks cross, on the face or on the face they carry on over", () => {
    function inside([a, b, c], x, y) {
      const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
      const sides = [side(a, b), side(b, c), side(c, a)]
      return sides.every(value => value > 1e-9) || sides.every(value => value < -1e-9)
    }
    for (const seed of [0, 1, 2, 3]) {
      const list = crackList(solid(60, 60), { amount: 100, length: 24, width: 6, seed })
      assert.ok(list.length > 0)
      for (let y = 0.25; y < 60; y += 0.5) {
        for (let x = 0.25; x < 60; x += 0.5) assert.ok(list.filter(crack => inside(crackTriangle(crack), x, y)).length <= 1, `${x},${y}`)
      }
      for (const [index, crack] of list.entries()) {
        for (const other of list.slice(index + 1).filter(item => item.side === crack.side && item.line === crack.line)) {
          for (let step = 0; step <= 20; step++) {
            const x = crack.from + (crack.wrapTip - crack.from) * step / 20
            const y = crack.wrapLength * step / 20
            assert.ok(!inside([[other.from, 0], [other.to, 0], [other.wrapTip, other.wrapLength]], x, y + 1e-6))
          }
        }
      }
    }
  })

  test("a crack that would come out of the other side is shortened to fit, or dropped when that is not enough", () => {
    const post = solid(6, 80)
    const across = settings => crackList(post, { amount: 100, ...settings }).filter(crack => crack.side === "left" || crack.side === "right")
    assert.deepEqual(across({ length: 12 }), [])
    assert.ok(across({ length: 6 }).every(crack => crack.length <= 5))
    assert.ok(across({ length: 2 }).length > 0)
  })

  test("cracks keep a gap between each other, so two can't join up and cut a letter in two", () => {
    const bar = solid(80, 12)
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const list = crackList(bar, { amount: 100, length: 5, width: 4, seed })
      const tops = list.filter(crack => crack.side === "up")
      const bottoms = list.filter(crack => crack.side === "down")
      for (const top of tops) {
        for (const bottom of bottoms) {
          const [a, b] = [crackTriangle(top), crackTriangle(bottom)]
          const gap = Math.min(...a.flatMap(([x, y]) => b.map(([u, v]) => Math.hypot(x - u, y - v))))
          assert.ok(gap >= 2, `${seed}`)
        }
      }
    }
  })

  test("a crack that would lean out over a notch is dropped", () => {
    const notched = glyphOf(new Array(40).fill(0).map((_, row) => row < 20 ? "1".repeat(20) + "0".repeat(20) : "1".repeat(40)))
    const cell = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 40 && (y >= 20 || x < 20)
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      for (const crack of crackList(notched, { amount: 100, length: 16, width: 5, seed })) {
        const [, , tip] = crackTriangle(crack)
        assert.ok(cell(Math.floor(tip[0]), Math.floor(tip[1])), JSON.stringify(crack))
      }
    }
  })

  test("a higher amount gives more cracks", () => {
    const counts = [5, 30, 100].map(amount => crackList(solid(200, 200), { amount }).length)
    assert.ok(counts[0] < counts[1] && counts[1] < counts[2], counts.join())
  })

  test("every crack stays close to the set size", () => {
    for (const crack of crackList(block, { amount: 100, width: 4, length: 9 })) {
      assert.ok(crack.to - crack.from >= 4 * 0.7 && crack.to - crack.from <= 4 * 1.3)
      assert.ok(crack.length >= 9 * 0.7 && crack.length <= 9 * 1.3)
    }
  })

  test("the face is only cracked inside the glyph, from the edge inwards", () => {
    const notched = glyphOf(new Array(40).fill(0).map((_, row) => row < 20 ? "1".repeat(20) + "0".repeat(20) : "1".repeat(40)))
    const alpha = generatedAlpha(notched, "cracks", busy, 40, scale)
    const rows = rowsOf(alpha, 40 * scale)
    assert.ok(alpha.some(value => value === 1))
    assert.ok(alpha.every(value => value === 0 || value === 1))
    const soft = generatedAlpha(notched, "cracks", busy, 40, scale * 4, true)
    assert.ok(soft.some(value => value > 0 && value < 1))
    assert.ok(soft.every(value => value >= 0 && value <= 1))
    for (let row = 0; row < 20 * scale; row++) assert.deepEqual(rows[row].slice(20 * scale), new Array(20 * scale).fill(0))
    const topped = crackedOn(notched, "up", 0)
    const top = crackList(notched, topped).find(crack => crack.side === "up" && crack.line === 0)
    const first = lit(generatedAlpha(notched, "cracks", topped, 40, scale), 40 * scale, 0)
    assert.ok(first.some(column => column >= top.from * scale && column < top.to * scale))
  })

  test("a crack on the top or bottom edge carries on over that face from the same base", () => {
    for (const [side, line, frontRow] of [["up", 0, 6 * scale - 1], ["down", 40, 0]]) {
      const settings = crackedOn(block, side, line)
      const wrap = crackWrap(block, settings, side, line, 0, 40, 6, scale)
      const own = crackList(block, settings).filter(crack => crack.side === side)
      const columns = lit(wrap, 40 * scale, frontRow)
      assert.ok(columns.length)
      assert.ok(columns.every(column => own.some(crack => column >= Math.floor(crack.from * scale) && column < Math.ceil(crack.to * scale))))
      assert.deepEqual(lit(wrap, 40 * scale, 6 * scale - 1 - frontRow).filter(column => !own.some(crack => crack.wrapLength >= 6 && Math.abs(crack.wrapTip * scale - column) <= 1)), [])
    }
  })

  test("a face with no crack on its edge gets nothing", () => {
    assert.equal(crackWrap(block, busy, "up", 12, 0, 40, 6, scale), null)
    assert.equal(crackWrap(block, { amount: 1, seed: 3 }, "up", 0, 0, 1, 6, scale), null)
  })

  test("a face that covers part of the edge is cracked where the whole edge is", () => {
    const whole = rowsOf(crackWrap(block, busy, "up", 0, 0, 40, 6, scale), 40 * scale)
    const part = crackWrap(block, busy, "up", 0, 10, 20, 6, scale)
    if (part) assert.deepEqual(rowsOf(part, 20 * scale), whole.map(row => row.slice(10 * scale, 30 * scale)))
    else assert.ok(whole.every(row => row.slice(10 * scale, 30 * scale).every(value => !value)))
  })

  test("the edge strips are cracked only over the glyph's own top and bottom rows", () => {
    const gapped = glyphOf(["1111111111111111111100000000001111111111"].concat(new Array(20).fill("1".repeat(40))))
    const up = rowsOf(edgeAlpha(gapped, "up", "cracks", busy, 6, scale), 40 * scale)
    assert.equal(up.length, 6 * scale)
    for (const row of up) assert.deepEqual(row.slice(20 * scale, 30 * scale), new Array(10 * scale).fill(0))
    const downed = crackedOn(block, "down", 40)
    assert.deepEqual(edgeAlpha(solid(40, 40), "down", "cracks", downed, 6, scale), crackWrap(block, downed, "down", 40, 0, 40, 6, scale))
  })
})

describe("cracks on layered glyphs", () => {
  const seeds = Array.from({ length: 24 }, (_, seed) => ({ amount: 100, seed }))
  const inner = (column, row) => column >= 10 && column < 30 && row >= 10 && row < 30

  function layered(innerLayer, outerLayer) {
    const glyph = solid(40, 40)
    return { ...glyph, depths: Uint8Array.from(glyph.mask, (_, at) => inner(at % 40, Math.floor(at / 40)) ? innerLayer : outerLayer) }
  }

  function cracksOn(glyph, band, independent) {
    return seeds.flatMap(settings => crackList(layerGlyph(glyph, band, independent), settings))
  }

  function onInner(crack) {
    return crack.line > 0 && crack.line < 40
  }

  for (const independent of [false, true]) {
    const mode = independent ? "independent" : "stacked"

    test(`an inset layer gets no cracks, as all its edges are flush against the layer in front, ${mode}`, () => {
      assert.deepEqual(cracksOn(layered(1, 0), 1, independent), [])
    })

    test(`the front layer still cracks its outer edges and its edges over the inset, ${mode}`, () => {
      const list = cracksOn(layered(1, 0), 0, independent)
      assert.ok(list.some(crack => !onInner(crack)))
      assert.ok(list.some(onInner))
    })

    test(`a back layer cracks its open edges but not where it meets the layer in front, and never under it, ${mode}`, () => {
      const list = cracksOn(layered(0, 1), 1, independent)
      assert.ok(list.length)
      for (const crack of list) {
        assert.ok(!onInner(crack), `${crack.side} ${crack.line}`)
        for (const [x, y] of crackTriangle(crack)) assert.ok(!(x > 10.5 && x < 29.5 && y > 10.5 && y < 29.5), `${crack.side} ${crack.line} reaches under the front layer`)
      }
    })

    test(`a back layer never cracks where it meets the next letter's front layer, ${mode}`, () => {
      const back = { ...solid(40, 40), depths: new Uint8Array(1600).fill(1) }
      const front = { ...solid(40, 40, { placedX: 40 }), depths: new Uint8Array(1600) }
      const chain = [back, front].map(glyph => layerGlyph(glyph, 1, independent))
      joinNeighbours(chain)
      const list = seeds.flatMap(settings => crackList(chain[0], settings))
      assert.ok(list.length)
      assert.deepEqual(list.filter(crack => crack.side === "right"), [])
    })
  }
})
