import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildHoles, buildOutline, buildText } from "../src/lib/build.js"

globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) }

const PAINTED = { scale: 1, canvas: {}, border: "rgb(0, 0, 0)", tiles: null, edgeAverage: () => "#123456" }

function glyph(char, width, height, extra = {}) {
  return { char, width, height, bottom: 0, mask: new Uint8Array(width * height).fill(1), ...extra }
}

function place(item, x) {
  return { glyph: item, x, spaces: 0 }
}

function text(placed, options = {}, font = {}) {
  return buildText(font, { placed, depth: 4, border: 1, sheet: { glyphs: {} }, painted: PAINTED, sideFaces: false, internalFaces: false, ...options })
}

function points(positions) {
  const list = []
  for (let i = 0; i < positions.length; i += 3) list.push([positions[i], positions[i + 1], positions[i + 2]])
  return list
}

function extents(positions) {
  const list = points(positions)
  return [0, 1, 2].map(axis => [Math.min(...list.map(point => point[axis])), Math.max(...list.map(point => point[axis]))])
}

function triangles(positions) {
  const list = points(positions)
  return Array.from({ length: list.length / 3 }, (_, index) => list.slice(index * 3, index * 3 + 3))
}

function capArea(positions, z) {
  let area = 0
  for (const [a, b, c] of triangles(positions)) {
    if (a[2] === z && b[2] === z && c[2] === z) area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
  }
  return area
}

function signedVolume(positions) {
  let volume = 0
  for (const [a, b, c] of triangles(positions)) volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  return volume
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not close to ${expected}`)
}

function built(boxes, extra = {}) {
  return { boxes, border: 1, depth: 4, frame: null, swatch: [0.5, 0.25], ...extra }
}

function outline(rects, z = 2, scale = [1, 1, 1]) {
  return { rects, z, scale }
}

const RING = [[0, 0, 3, 1], [0, 2, 3, 3], [0, 1, 1, 2], [2, 1, 3, 2]]
const O = new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1])

describe("buildText", () => {
  const two = () => [place(glyph("a", 2, 3), 0), place(glyph("b", 1, 1), 3)]

  test("returns null with nothing placed", () => {
    assert.equal(buildText({}, { placed: [] }), null)
  })

  test("centres the line on x", () => {
    const result = text(two())
    assert.deepEqual(result.boxes, [[[-2, 0], [0, 3]], [[1, 0], [2, 1]]])
    assert.deepEqual(result.line, { min: [-2, 0, -2], max: [2, 3, 2] })
  })

  test("extrudes the body across the depth", () => {
    const { body, depth } = text(two())
    assert.equal(depth, 4)
    assert.equal(body.triangles, 24)
    assert.equal(body.positions.length, 24 * 9)
    assert.deepEqual(extents(body.positions), [[-2, 2], [0, 3], [-2, 2]])
  })

  test("winds the body outwards as a closed mesh", () => {
    near(signedVolume(text(two()).body.positions), 2 * 3 * 4 + 1 * 1 * 4)
  })

  test("gives every vertex a uv inside the atlas", () => {
    const { body } = text(two())
    assert.equal(body.uvs.length, body.positions.length / 3 * 2)
    assert.ok(body.uvs.every(value => value >= 0 && value <= 1))
  })

  test("places a glyph at its bottom offset", () => {
    const result = text([place(glyph("p", 1, 3, { bottom: -2 }), 0)])
    assert.deepEqual(result.boxes, [[[-0.5, -2], [0.5, 1]]])
    assert.deepEqual(result.line, { min: [-0.5, -2, -2], max: [0.5, 1, 2] })
  })

  test("splits a glyph mask into boxes", () => {
    const result = text([place(glyph("o", 3, 3, { mask: O }), 0)])
    near(signedVolume(result.body.positions), 8 * 4)
    assert.equal(capArea(result.body.positions, -2), 8)
  })

  test("centres on a given line instead of the glyph bounds", () => {
    const result = text(two(), { line: { minX: -10, maxX: 20, minY: -1, maxY: 5 } })
    assert.deepEqual(result.boxes[0], [[-5, 0], [-3, 3]])
    assert.deepEqual(result.line, { min: [-15, -1, -2], max: [15, 5, 2] })
  })

  test("measures the line's depth from the front with lineDepth", () => {
    assert.deepEqual(text(two(), { lineDepth: 10 }).line, { min: [-2, 0, -8], max: [2, 3, 2] })
  })

  test("lifts only the glyph that asks for it", () => {
    const result = text([place(glyph("a", 2, 3, { lift: 5 }), 0), place(glyph("b", 1, 1), 3)])
    assert.deepEqual(result.boxes, [[[-2, 5], [0, 8]], [[1, 0], [2, 1]]])
    assert.deepEqual(extents(result.body.positions)[1], [0, 8])
  })

  test("keeps the border and has no frame on a normal font", () => {
    const result = text(two(), { border: 3 })
    assert.equal(result.border, 3)
    assert.equal(result.frame, null)
  })

  test("keeps the border and builds a frame on an auto border font", () => {
    const result = text(two(), { border: 3 }, { autoBorder: true })
    assert.equal(result.border, 3)
    assert.deepEqual(result.frame, [[-2, 0, 0, 3], [0, 0, 1, 1], [1, 0, 2, 1]])
  })

  test("frames over a hole in a glyph", () => {
    const { frame } = text([place(glyph("o", 3, 3, { mask: O }), 0)], {}, { autoBorder: true })
    assert.deepEqual(frame, [[-1.5, 0, -0.5, 3], [-0.5, 0, 0.5, 3], [0.5, 0, 1.5, 3]])
  })

  test("builds the frame from lifted boxes", () => {
    const { frame } = text([place(glyph("a", 1, 1, { lift: 4 }), 0)], {}, { autoBorder: true })
    assert.deepEqual(frame, [[-0.5, 4, 0.5, 5]])
  })

  test("reserves a swatch when a border needs one", () => {
    const { swatch } = text(two(), { border: 1, sideFaces: true, internalFaces: true })
    assert.ok(swatch[0] > 0 && swatch[0] < 1 && swatch[1] > 0 && swatch[1] < 1)
  })

  test("reserves a swatch for side faces drawn as a flat colour", () => {
    assert.notEqual(text(two(), { border: 0, sideFaces: false }).swatch, null)
  })

  test("has no swatch when nothing uses one", () => {
    assert.equal(text(two(), { border: 0, sideFaces: true, internalFaces: true }).swatch, null)
  })

  test("asks for the edge average only when it is read", () => {
    let calls = 0
    const result = text(two(), { painted: { ...PAINTED, edgeAverage: () => ++calls } })
    assert.equal(calls, 0)
    assert.equal(result.averages.edge, 1)
  })

  test("throws when the atlas would pass the texture limit", () => {
    assert.throws(() => text([place(glyph("w", 2000, 1), 0)]), /over the 4096 limit/)
  })
})

describe("buildOutline", () => {
  test("grows a box by the border on every axis", () => {
    const result = buildOutline(built([[[0, 0], [2, 3]]]), [1, 1, 1])
    assert.deepEqual(result.rects, [[-1, -1, 3, 4]])
    assert.equal(result.z, 3)
    assert.equal(result.triangles, 12)
    assert.deepEqual(extents(result.positions), [[-1, 3], [-1, 4], [-3, 3]])
  })

  test("winds the shell outwards", () => {
    near(signedVolume(buildOutline(built([[[0, 0], [2, 3]]]), [1, 1, 1]).positions), 4 * 5 * 6)
  })

  test("scales the box but not the border", () => {
    const result = buildOutline(built([[[1, 1], [2, 2]]]), [2, 3, 0.5])
    assert.deepEqual(result.rects, [[1, 2, 5, 7]])
    assert.equal(result.z, 2)
    assert.deepEqual(result.scale, [2, 3, 0.5])
  })

  test("adds extra reach per axis", () => {
    const result = buildOutline(built([[[0, 0], [1, 1]]], { depth: 2 }), [1, 1, 1], [1, 2, 3])
    assert.deepEqual(result.rects, [[-2, -3, 3, 4]])
    assert.equal(result.z, 5)
  })

  test("builds nothing without a border but still reports the rects", () => {
    const result = buildOutline(built([[[0, 0], [1, 1]]], { border: 0, swatch: null }), [1, 1, 1])
    assert.equal(result.triangles, 0)
    assert.equal(result.positions.length, 0)
    assert.equal(result.uvs.length, 0)
    assert.deepEqual(result.rects, [[0, 0, 1, 1]])
    assert.equal(result.z, 2)
  })

  test("builds a halo from extra reach without a border", () => {
    const result = buildOutline(built([[[0, 0], [1, 1]]], { border: 0 }), [1, 1, 1], [1, 1, 1])
    assert.equal(result.triangles, 12)
    assert.deepEqual(extents(result.positions), [[-1, 2], [-1, 2], [-3, 3]])
  })

  test("uses the frame in place of the boxes, grown by the border", () => {
    const result = buildOutline(built([[[1, 1], [2, 2]]], { border: 3, frame: [[0, 0, 4, 4]] }), [1, 1, 1])
    assert.deepEqual(result.rects, [[-3, -3, 7, 7]])
    assert.equal(result.z, 5)
    assert.equal(result.triangles, 12)
  })

  test("builds no frame outline without a border", () => {
    const result = buildOutline(built([[[1, 1], [2, 2]]], { border: 0, frame: [[0, 0, 4, 4]] }), [1, 1, 1])
    assert.equal(result.triangles, 0)
  })

  test("merges rects that overlap into one solid", () => {
    const result = buildOutline(built([[[0, 0], [2, 2]], [[2, 0], [4, 2]]]), [1, 1, 1])
    assert.equal(result.triangles, 12)
    assert.deepEqual(extents(result.positions), [[-1, 5], [-1, 3], [-3, 3]])
  })

  test("follows the union of an l shape", () => {
    const { positions, z } = buildOutline(built([[[0, 0], [1, 3]], [[0, 0], [3, 1]]]), [1, 1, 1])
    assert.equal(capArea(positions, -z), 21)
    assert.equal(capArea(positions, z), 21)
    near(signedVolume(positions), 21 * 2 * z)
    assert.ok(points(positions).every(point => point[0] <= 2 || point[1] <= 2))
  })

  test("keeps separate rects apart", () => {
    const { positions, triangles: count, z } = buildOutline(built([[[0, 0], [1, 1]], [[10, 0], [11, 1]]]), [1, 1, 1])
    assert.equal(count, 24)
    assert.equal(capArea(positions, z), 18)
    assert.ok(points(positions).every(point => point[0] <= 2 || point[0] >= 9))
  })

  test("points every uv at the swatch", () => {
    const { uvs, positions } = buildOutline(built([[[0, 0], [1, 1]]]), [1, 1, 1])
    assert.equal(uvs.length, positions.length / 3 * 2)
    for (let i = 0; i < uvs.length; i += 2) assert.deepEqual([uvs[i], uvs[i + 1]], [0.5, 0.25])
  })

  test("accepts what buildText returns", () => {
    const source = text([place(glyph("a", 2, 2), 0)], { border: 1, depth: 2 })
    const result = buildOutline(source, [1, 1, 1])
    assert.deepEqual(result.rects, [[-2, -1, 2, 3]])
    assert.equal(result.z, 2)
    assert.deepEqual([result.uvs[0], result.uvs[1]], source.swatch.map(value => Math.fround(value)))
  })
})

describe("buildHoles", () => {
  function holeArea(holes) {
    return capArea(holes.positions, holes.positions[2])
  }

  test("returns null with no rects", () => {
    assert.equal(buildHoles([]), null)
    assert.equal(buildHoles([outline([])]), null)
  })

  test("returns null for a solid shape", () => {
    assert.equal(buildHoles([outline([[0, 0, 3, 3]])]), null)
    assert.equal(buildHoles([outline([[0, 0, 1, 1], [1, 0, 2, 1]])]), null)
  })

  test("fills a fully enclosed gap", () => {
    const holes = buildHoles([outline(RING)])
    assert.equal(holes.triangles, 2)
    assert.deepEqual(Array.from(holes.positions), [1, 1, -2, 2, 1, -2, 2, 2, -2, 1, 1, -2, 2, 2, -2, 1, 2, -2])
  })

  test("returns zeroed uvs and the first outline's scale", () => {
    const holes = buildHoles([outline(RING, 2, [2, 3, 4])])
    assert.deepEqual(Array.from(holes.uvs), new Array(12).fill(0))
    assert.deepEqual(holes.scale, [2, 3, 4])
  })

  test("ignores a gap open to the side", () => {
    assert.equal(buildHoles([outline([[0, 0, 3, 1], [0, 2, 3, 3], [0, 1, 1, 2]])]), null)
  })

  test("ignores a room reached through a one wide slot", () => {
    assert.equal(buildHoles([outline([[0, 0, 5, 1], [0, 1, 1, 5], [4, 1, 5, 5], [1, 4, 2, 5], [3, 4, 4, 5]])]), null)
  })

  test("treats a diagonal touch as closed", () => {
    const holes = buildHoles([outline([[0, 0, 3, 1], [0, 1, 1, 3], [2, 1, 3, 2], [1, 2, 2, 3]])])
    assert.equal(holes.triangles, 2)
    assert.deepEqual(extents(holes.positions), [[1, 2], [1, 2], [-2, -2]])
  })

  test("needs the rects of every outline to close a gap", () => {
    assert.equal(buildHoles([outline(RING.slice(0, 2))]), null)
    assert.equal(buildHoles([outline(RING.slice(2))]), null)
    assert.equal(buildHoles([outline(RING.slice(0, 2)), outline(RING.slice(2))]).triangles, 2)
  })

  test("sits behind the deepest outline", () => {
    const holes = buildHoles([outline(RING.slice(0, 2), 2), outline(RING.slice(2), 5)])
    assert.deepEqual(extents(holes.positions)[2], [-5, -5])
  })

  test("leaves an island inside a hole uncovered", () => {
    const holes = buildHoles([outline([[0, 0, 5, 1], [0, 4, 5, 5], [0, 1, 1, 4], [4, 1, 5, 4], [2, 2, 3, 3]])])
    assert.equal(holeArea(holes), 8)
    assert.equal(holes.triangles, 16)
    for (const [a, b, c] of triangles(holes.positions)) {
      const inside = point => point[0] > 2 && point[0] < 3 && point[1] > 2 && point[1] < 3
      assert.ok(!inside([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]))
    }
  })

  test("fills separate holes", () => {
    const holes = buildHoles([outline([[0, 0, 5, 1], [0, 2, 5, 3], [0, 1, 1, 2], [2, 1, 3, 2], [4, 1, 5, 2]])])
    assert.equal(holes.triangles, 4)
    assert.equal(holeArea(holes), 2)
  })

  test("handles fractional and negative coordinates", () => {
    const holes = buildHoles([outline([[-1.5, -1.5, 1.5, -0.5], [-1.5, 0.5, 1.5, 1.5], [-1.5, -0.5, -0.5, 0.5], [0.5, -0.5, 1.5, 0.5]])])
    assert.deepEqual(extents(holes.positions), [[-0.5, 0.5], [-0.5, 0.5], [-2, -2]])
  })

  test("shrinks a counter as the border grows until it closes", () => {
    const boxes = [[[0, 0], [7, 1]], [[0, 6], [7, 7]], [[0, 1], [1, 6]], [[6, 1], [7, 6]]]
    function holesAt(border) {
      return buildHoles([buildOutline(built(boxes, { border }), [1, 1, 1])])
    }
    assert.equal(holeArea(holesAt(0)), 25)
    assert.equal(holeArea(holesAt(1)), 9)
    assert.equal(holeArea(holesAt(2)), 1)
    assert.equal(holesAt(3), null)
    assert.deepEqual(extents(holesAt(1).positions), [[2, 5], [2, 5], [-3, -3]])
  })

  test("clips the counter of a borderless glyph", () => {
    const source = text([place(glyph("o", 3, 3, { mask: O }), 0)], { border: 0, sideFaces: false })
    const holes = buildHoles([buildOutline(source, [1, 1, 1])])
    assert.deepEqual(extents(holes.positions), [[-0.5, 0.5], [1, 2], [-2, -2]])
  })

  test("finds no hole once a border closes the counter", () => {
    const source = text([place(glyph("o", 3, 3, { mask: O }), 0)], { border: 1 })
    assert.equal(buildHoles([buildOutline(source, [1, 1, 1])]), null)
  })

  test("finds no hole in a framed auto border glyph", () => {
    const source = text([place(glyph("o", 3, 3, { mask: O }), 0)], {}, { autoBorder: true })
    assert.equal(buildHoles([buildOutline(source, [1, 1, 1])]), null)
  })
})

describe("halo for a word with no border", () => {
  test("builds when nothing reserved a swatch", () => {
    const word = text([place(glyph("a", 2, 3), 0)], { border: 0, sideFaces: true, internalFaces: true })
    assert.equal(word.swatch, null)
    const halo = buildOutline(word, [1, 1, 1], [1, 1, 1])
    assert.ok(halo.triangles > 0)
    assert.equal(halo.uvs.length, halo.positions.length / 3 * 2)
  })
})
