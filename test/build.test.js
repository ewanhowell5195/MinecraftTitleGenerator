import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildHoles, buildOutline, buildText, rowBottom } from "../src/lib/build.js"

describe("rowBottom", () => {
  const box = (x0, y0, x1, y1) => ({ from: [x0, y0], to: [x1, y1] })

  test("leaves out what sits above the bottom of a letter", () => {
    const t = [box(-6, 8, 6, 10), box(-1, 0, 1, 8)]
    assert.deepEqual(rowBottom([t]), { left: [-1, 0], right: [1, 0] })
  })

  test("goes from the first letter's bottom to the last letter's bottom", () => {
    const m = [box(-20, 0, -18, 10), box(-12, 0, -10, 10)]
    const t = [box(4, 8, 16, 10), box(9, 0, 11, 8)]
    assert.deepEqual(rowBottom([m, t]), { left: [-20, 0], right: [11, 0] })
  })

  test("uses each letter's own bottom, so a raised letter still counts", () => {
    assert.deepEqual(rowBottom([[box(-10, 5, -8, 10)], [box(0, 0, 2, 10)], [box(8, 5, 10, 10)]]), { left: [-10, 5], right: [10, 5] })
  })

  test("is nothing for a row with no letters", () => {
    assert.equal(rowBottom([[], []]), null)
  })
})

globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }) }) }

const PAINTED = { scale: 1, canvas: {}, border: "rgb(0, 0, 0)", tiles: null, fade: null, edgeAverage: () => "#123456", wraps: [], sideWraps: [] }

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

  describe("twist", () => {
    const ROW = [place(glyph("a", 4, 4), 0), place(glyph("b", 4, 4), 8), place(glyph("c", 4, 4), 16)]
    const STILL = { amount: 0, centre: 0.5, same: false }

    function twisted(twist, options = {}) {
      return text(ROW, { twist: { ribbon: STILL, door: STILL, ...twist }, ...options })
    }

    function corners(built, index) {
      const list = points(built.body.positions)
      return list.slice(index * list.length / 3, (index + 1) * list.length / 3)
    }

    function spread(built, index, axis) {
      const list = corners(built, index).map(point => point[axis])
      return Math.max(...list) - Math.min(...list)
    }

    function matchesMirror(built) {
      const flat = text(ROW)
      const flatRight = corners(flat, 2)
      const right = corners(built, 2)
      return corners(flat, 0).every(([x, y, z], index) => {
        const at = flatRight.findIndex(point => point[0] === -x && point[1] === y && point[2] === z)
        const [turnedX, turnedY, turnedZ] = corners(built, 0)[index]
        return Math.abs(right[at][0] + turnedX) < 1e-6 && Math.abs(right[at][1] - turnedY) < 1e-6 && Math.abs(right[at][2] - turnedZ) < 1e-6
      })
    }

    function rightEdgeDepth(built, index) {
      const flat = corners(text(ROW), index)
      const middle = flat.reduce((sum, point) => sum + point[0], 0) / flat.length
      const depths = corners(built, index).filter((point, at) => flat[at][0] > middle).map(point => point[2])
      return depths.reduce((sum, depth) => sum + depth, 0) / depths.length
    }

    test("leaves the glyphs alone with no twist", () => {
      assert.equal(text(ROW).twist, null)
      assert.deepEqual(extents(text(ROW).body.positions)[2], [-2, 2])
    })

    test("the anchor character stays exactly still and the far one turns the full amount", () => {
      const flat = text(ROW)
      for (const [centre, still, far] of [[0, 0, 2], [1, 2, 0]]) {
        const built = twisted({ door: { amount: 90, centre, same: true } })
        assert.deepEqual(corners(built, still), corners(flat, still))
        assert.ok(Math.abs(spread(built, far, 0) - 4) < 1e-9)
        assert.ok(Math.abs(spread(built, far, 2) - 4) < 1e-9)
      }
    })

    test("a centre anchor keeps the middle character still and turns both ends the full amount", () => {
      const flat = text(ROW)
      const built = twisted({ ribbon: { amount: 90, centre: 0.5 } })
      assert.deepEqual(corners(built, 1), corners(flat, 1))
      for (const end of [0, 2]) assert.ok(Math.abs(spread(built, end, 1) - 4) < 1e-9)
    })

    test("the anchor ends come from the whole line when given", () => {
      const built = twisted({ door: { amount: 90, centre: 0 } }, { ends: { first: -6, last: 18 } })
      assert.ok(spread(built, 0, 2) > 0)
    })

    test("a single character on a line has nothing to turn against", () => {
      const built = text([place(glyph("a", 4, 4), 0)], { twist: { ribbon: { amount: 90, centre: 0 }, door: { amount: 90, centre: 1, same: true } } })
      assert.deepEqual(extents(built.body.positions)[2], [-2, 2])
    })

    test("a ribbon keeps every character's width and a door keeps its height", () => {
      const ribbon = twisted({ ribbon: { amount: 60, centre: 0 } })
      const door = twisted({ door: { amount: 60, centre: 0 } })
      for (const index of [0, 1, 2]) {
        assert.equal(spread(ribbon, index, 0), 4)
        assert.equal(spread(door, index, 1), 4)
      }
    })

    test("a positive door turns the far edge of the far character back", () => {
      const built = twisted({ door: { amount: 30, centre: 0 } })
      assert.ok(rightEdgeDepth(built, 2) > 0)
    })

    test("ribbon and door work together, each from its own anchor", () => {
      const both = twisted({ ribbon: { amount: 60, centre: 0 }, door: { amount: 60, centre: 1, same: true } })
      const flat = text(ROW)
      assert.notDeepEqual(corners(both, 0), corners(flat, 0))
      assert.notDeepEqual(corners(both, 2), corners(flat, 2))
      assert.ok(spread(both, 0, 0) > 4)
      assert.ok(spread(both, 2, 1) > 4)
    })

    test("each side of a door turns the opposite way, so the sides mirror each other", () => {
      assert.ok(matchesMirror(twisted({ door: { amount: 60, centre: 0.5 } })))
      const built = twisted({ door: { amount: 60, centre: 0.5 } })
      assert.ok(rightEdgeDepth(built, 0) < 0 && rightEdgeDepth(built, 2) > 0)
    })

    test("a door can turn both sides the same way", () => {
      const built = twisted({ door: { amount: 60, centre: 0.5, same: true } })
      assert.ok(!matchesMirror(built))
      assert.ok(rightEdgeDepth(built, 0) > 0 && rightEdgeDepth(built, 2) > 0)
    })

    test("a mirrored ribbon tips both sides the same way, which plain does not", () => {
      assert.ok(matchesMirror(twisted({ ribbon: { amount: 60, centre: 0.5, same: true } })))
      assert.ok(!matchesMirror(twisted({ ribbon: { amount: 60, centre: 0.5 } })))
    })

    test("the same way changes nothing with the centre at the left end", () => {
      const plain = twisted({ ribbon: { amount: 60, centre: 0 } })
      const flipped = twisted({ ribbon: { amount: 60, centre: 0, same: true } })
      assert.deepEqual(flipped.body.positions, plain.body.positions)
    })

    test("a centre between the middle and an end turns the further end the full amount", () => {
      const flat = text(ROW)
      const built = twisted({ door: { amount: 90, centre: 0.25 } })
      assert.ok(Math.abs(spread(built, 2, 0) - 4) < 1e-9)
      assert.ok(Math.abs(spread(built, 2, 2) - 4) < 1e-9)
      assert.notDeepEqual(corners(built, 0), corners(flat, 0))
    })

    test("a door hinges each character on its own centre", () => {
      const built = twisted({ door: { amount: 180, centre: 1, same: true } })
      const across = corners(built, 0).map(point => point[0])
      assert.ok(Math.min(...across) > -11 && Math.max(...across) < -5)
    })

    test("the two directions mirror each other", () => {
      const forward = extents(twisted({ door: { amount: 30, centre: 0 } }).body.positions)[2]
      const back = extents(twisted({ door: { amount: -30, centre: 0 } }).body.positions)[2]
      assert.ok(Math.abs(forward[0] + back[1]) < 1e-6 && Math.abs(forward[1] + back[0]) < 1e-6)
    })

    test("the outline turns with its character and leaves no hole shape", () => {
      const built = twisted({ ribbon: { amount: 90, centre: 0 } })
      const outline = buildOutline(built, [1, 1, 1])
      assert.equal(outline.rects.length, 0)
      assert.equal(buildHoles([outline]), null)
      const shell = extents(outline.positions)
      const body = extents(built.body.positions)
      assert.ok(shell[2][0] < body[2][0] && shell[2][1] > body[2][1])
    })

    test("a stretched outline still lines up with its turned character", () => {
      const built = twisted({ ribbon: { amount: 45, centre: 0 }, door: { amount: 30, centre: 1, same: true } })
      const scale = [1, 2, 3]
      const outline = buildOutline(built, scale)
      const body = extents(built.body.positions).map((range, axis) => range.map(value => value * scale[axis]))
      const shell = extents(outline.positions)
      for (const axis of [0, 1, 2]) assert.ok(shell[axis][0] < body[axis][0] && shell[axis][1] > body[axis][1])
    })
  })

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

describe("depth layers", () => {
  const LAYERED = { layers: [{ options: {} }, { options: {} }], painted: [PAINTED, PAINTED] }

  function flatZs(body) {
    const list = points(body.positions)
    const zs = new Set()
    for (let index = 0; index < list.length; index += 3) {
      const corners = list.slice(index, index + 3)
      if (corners.every(point => point[2] === corners[0][2])) zs.add(corners[0][2])
    }
    return Array.from(zs).sort((a, b) => a - b)
  }

  test("a shallower pixel is flush with the back and stops part of the way forward", () => {
    const stepped = glyph("x", 3, 1, { depths: Uint8Array.from([0, 1, 0]) })
    const built = text([place(stepped, 0)], LAYERED, { layers: [1, 0.5], capHeight: 1, glyphs: { x: stepped } })
    assert.deepEqual(flatZs(built.body), [-2, 0, 2])
    assert.deepEqual(extents(built.body.positions)[2], [-2, 2])
    assert.deepEqual(built.layers, [0, 1])
  })

  test("the outline steps back with each layer instead of boxing the whole character", () => {
    const stepped = glyph("x", 5, 1, { depths: Uint8Array.from([0, 1, 1, 1, 0]) })
    const built = text([place(stepped, 0)], LAYERED, { layers: [1, 0.5], capHeight: 1, glyphs: { x: stepped } })
    const outline = buildOutline(built, [1, 1, 1])
    const corners = points(outline.positions)
    const caps = []
    for (let index = 0; index < corners.length; index += 3) {
      const triangle = corners.slice(index, index + 3)
      if (triangle.every(point => point[2] === triangle[0][2])) caps.push({ z: triangle[0][2], xs: triangle.map(point => point[0]) })
    }
    const covering = z => caps.some(cap => cap.z === z && Math.min(...cap.xs) <= 0 && Math.max(...cap.xs) >= 0)
    assert.deepEqual(Array.from(new Set(caps.map(cap => cap.z))).sort((a, b) => a - b), [-3, 1, 3])
    assert.equal(covering(3), false)
    assert.equal(covering(1), true)
  })

  test("a character with no shallower pixels stays one piece, with no seam where a layer would start", () => {
    const solid = glyph("x", 3, 1, { depths: new Uint8Array(3) })
    const built = text([place(solid, 0)], LAYERED, { layers: [1, 0.5], capHeight: 1, glyphs: { x: solid } })
    assert.deepEqual(flatZs(built.body), [-2, 2])
    assert.deepEqual(built.layers, [0])
  })
})

describe("top and bottom textures", () => {
  function shaped(char, rows, bottom = 0) {
    const width = rows[0].length
    const mask = Uint8Array.from(rows.slice().reverse().join(""), cell => Number(cell))
    return { char, width, height: rows.length, bottom, mask }
  }

  function uvWidths(body, y) {
    const list = points(body.positions)
    const widths = []
    for (let index = 0; index < list.length; index += 3) {
      if (!list.slice(index, index + 3).every(point => point[1] === y)) continue
      const us = [index, index + 1, index + 2].map(corner => body.uvs[corner * 2])
      const vs = [index, index + 1, index + 2].map(corner => body.uvs[corner * 2 + 1])
      widths.push({ u: [Math.min(...us), Math.max(...us)], v: [Math.min(...vs), Math.max(...vs)] })
    }
    return widths
  }

  function spread(list) {
    return { u: [Math.min(...list.map(item => item.u[0])), Math.max(...list.map(item => item.u[1]))], v: [Math.min(...list.map(item => item.v[0])), Math.max(...list.map(item => item.v[1]))] }
  }

  function apart(a, b) {
    return a.u[1] <= b.u[0] || b.u[1] <= a.u[0] || a.v[1] <= b.v[0] || b.v[1] <= a.v[0]
  }

  test("a top face at the topline gets the top texture in its own area when an accent sits over it", () => {
    const rows = ["001100", "001100", "001100", "000000"].concat(new Array(10).fill("111111"))
    const accented = shaped("e", rows)
    const { body } = text([place(accented, 0)], {}, { capHeight: 10, glyphs: { e: accented } })
    const under = spread(uvWidths(body, 10))
    const accent = spread(uvWidths(body, 14))
    assert.ok(apart(under, accent))
    near((under.u[1] - under.u[0]) / (accent.u[1] - accent.u[0]), 3)
  })

  test("a bottom face at the baseline gets the bottom texture in its own area when a descender runs under it", () => {
    const rows = new Array(10).fill("111111").concat(["000001", "000001", "111111"])
    const hooked = shaped("g", rows, -3)
    const { body } = text([place(hooked, 0)], {}, { capHeight: 10, glyphs: { g: hooked } })
    const bowl = spread(uvWidths(body, 0))
    const hook = spread(uvWidths(body, -3))
    assert.ok(apart(bowl, hook))
    near((bowl.u[1] - bowl.u[0]) / (hook.u[1] - hook.u[0]), 5 / 6)
  })

  test("a letter that stops short of the topline still gets the top texture on its highest faces", () => {
    const rows = ["111111", "000000", "111111"].concat(new Array(3).fill("111111"))
    const short = shaped("x", rows)
    const { body } = text([place(short, 0)], {}, { capHeight: 10, glyphs: { x: short } })
    const top = spread(uvWidths(body, 6))
    const ledge = uvWidths(body, 4)
    near((top.u[1] - top.u[0]) / (spread(uvWidths(body, 0)).u[1] - spread(uvWidths(body, 0)).u[0]), 1)
    assert.ok(ledge.every(item => item.u[1] - item.u[0] < (top.u[1] - top.u[0]) / 2))
  })
})

describe("the rear of the text", () => {
  function coordinates(body, zOf) {
    const list = points(body.positions)
    const seen = new Set()
    for (let index = 0; index < list.length; index += 3) {
      if (list.slice(index, index + 3).every(point => point[2] === zOf)) {
        for (const corner of [index, index + 1, index + 2]) seen.add(`${body.uvs[corner * 2]},${body.uvs[corner * 2 + 1]}`)
      }
    }
    return seen
  }

  const letters = () => [place(glyph("a", 2, 2), 0), place(glyph("b", 2, 2), 3)]

  test("uses the border colour swatch when the edges fade", () => {
    const { body } = text(letters(), { painted: { ...PAINTED, fade: 0.5 }, sideFaces: true, internalFaces: true, border: 0 })
    assert.equal(coordinates(body, -2).size, 4)
  })

  test("keeps the letter art when they don't", () => {
    const { body } = text(letters(), { painted: { ...PAINTED, fade: null } })
    assert.ok(coordinates(body, -2).size > 4)
  })

  test("the visible face keeps its art either way", () => {
    const { body } = text(letters(), { painted: { ...PAINTED, fade: 0.5 } })
    assert.ok(coordinates(body, 2).size > 4)
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

describe("detail", () => {
  const ROW = [place(glyph("a", 4, 4), 0), place(glyph("b", 4, 4), 8)]
  const TURN = { ribbon: { amount: 40, centre: 0.5, same: false }, door: { amount: 0, centre: 0.5, same: false } }

  test("a plain text keeps its texture as it is", () => {
    const word = text(ROW)
    assert.equal(word.detail, 1)
    assert.equal(word.refine, null)
  })

  test("a detailed text says how far its texture can grow, and can be drawn again that big", () => {
    const word = text(ROW, { detailed: Infinity, textureLimit: 4096 })
    assert.ok(word.detail > 1)
    assert.equal(word.detail, 2 ** Math.round(Math.log2(word.detail)))
    const sharp = word.refine({ ...PAINTED, scale: word.detail })
    assert.deepEqual(Object.keys(sharp).sort(), ["crackShapes", "fades", "gradient", "labels", "panels", "texture"])
  })

  test("a limit too small to grow into leaves the texture alone", () => {
    assert.equal(text(ROW, { detailed: Infinity, textureLimit: 0 }).refine, null)
  })

  test("drawing it again lays the texture out the same after a twist", () => {
    const flat = text(ROW, { detailed: Infinity, textureLimit: 4096, internalFaces: true, sideFaces: true })
    const turned = text(ROW, { detailed: Infinity, textureLimit: 4096, internalFaces: true, sideFaces: true, twist: TURN })
    assert.deepEqual(turned.refine({ ...PAINTED, scale: turned.detail }).panels, flat.refine({ ...PAINTED, scale: flat.detail }).panels)
    assert.deepEqual(Array.from(turned.body.uvs), Array.from(flat.body.uvs))
  })
})

describe("door roll", () => {
  const ROW = [place(glyph("a", 4, 4), 0), place(glyph("b", 4, 4), 8), place(glyph("c", 4, 4), 16)]
  const STILL = { amount: 0, centre: 0.5, same: false }
  const RADIUS = 8 / (Math.PI / 2)

  function door(values) {
    return text(ROW, { twist: { ribbon: STILL, door: { amount: 90, centre: 0.5, same: false, ...values } } })
  }

  function middles(built) {
    const list = points(built.body.positions)
    return [0, 1, 2].map(index => {
      const own = list.slice(index * list.length / 3, (index + 1) * list.length / 3)
      return [0, 1, 2].map(axis => own.reduce((sum, point) => sum + point[axis], 0) / own.length)
    })
  }

  test("without it every character turns where it stands", () => {
    assert.deepEqual(middles(door({ roll: false })).map(([x, , z]) => [Math.round(x), Math.round(z)]), [[-8, 0], [0, 0], [8, 0]])
  })

  test("with it the characters sit on one circle, as far apart along it as they were in line", () => {
    const [left, middle, right] = middles(door({ roll: true }))
    near(middle[0], 0)
    near(middle[2], 0)
    const depth = (left[2] + right[2]) / 2
    near(left[2], right[2])
    near(Math.abs(depth), RADIUS)
    near(left[0], -RADIUS)
    near(right[0], RADIUS)
    for (const [x, , z] of [left, middle, right]) near(Math.hypot(x, z - depth), RADIUS)
  })

  test("it bends the same way the door turns the far edges", () => {
    const flat = points(text(ROW).body.positions)
    const plain = points(door({ amount: 30, roll: false }).body.positions)
    const farEdge = plain.filter((point, index) => index >= flat.length * 2 / 3 && flat[index][0] > 8)
    assert.ok(farEdge.reduce((sum, point) => sum + point[2], 0) > 0)
    assert.ok(middles(door({ amount: 30, roll: true }))[2][2] > 0)
    assert.ok(middles(door({ amount: -30, roll: true }))[2][2] < 0)
  })

  test("a character keeps its own shape and height", () => {
    const rolled = points(door({ roll: true }).body.positions)
    const plain = points(door({ roll: false }).body.positions)
    const [from, to] = middles(door({ roll: false }))[2].map((value, axis) => [value, middles(door({ roll: true }))[2][axis]]).reduce(([a, b], [x, y]) => [a.concat(x), b.concat(y)], [[], []])
    for (let index = plain.length * 2 / 3; index < plain.length; index++) {
      for (const axis of [0, 1, 2]) near(rolled[index][axis] - to[axis], plain[index][axis] - from[axis])
    }
  })

  test("no door turn means nothing to roll", () => {
    const still = text(ROW, { twist: { ribbon: { amount: 30, centre: 0.5, same: false }, door: { ...STILL, roll: true } } })
    const plain = text(ROW, { twist: { ribbon: { amount: 30, centre: 0.5, same: false }, door: STILL } })
    assert.deepEqual(Array.from(still.body.positions), Array.from(plain.body.positions))
  })
})
