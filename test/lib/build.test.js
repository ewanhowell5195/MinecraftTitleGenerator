import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildHoles, buildOutline, buildText, rowBottom } from "../../src/lib/geometry/build.js"

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

function fakeCanvas(width = 1, height = 1) {
  const ctx = { setTransform() {}, clearRect() {}, fillRect() {}, drawImage() {}, beginPath() {}, rect() {}, fill() {}, putImageData() {} }
  return { width, height, getContext: () => ctx }
}

globalThis.document = { createElement: () => fakeCanvas() }

const PAINTED = { border: "rgb(0, 0, 0)", tiles: null, fade: null, edgeAverage: () => "#123456", wraps: [], sideWraps: [] }

function painter(painted, seen = []) {
  return layouts => {
    seen.push(layouts)
    return layouts.map(pages => pages.map(page => ({ ...painted, canvas: fakeCanvas(page.width, page.height) })))
  }
}

function glyph(char, width, height, extra = {}) {
  return { char, width, height, bottom: 0, mask: new Uint8Array(width * height).fill(1), ...extra }
}

function place(item, x) {
  return { glyph: item, x, spaces: 0 }
}

function text(placed, options = {}, font = {}) {
  const { painted = PAINTED, ...rest } = options
  return buildText(font, { placed, depth: 4, border: 1, sheet: { glyphs: {} }, paint: painter(painted), sideFaces: false, internalFaces: false, ...rest })
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
      return text(ROW, { twist: { ribbon: STILL, door: STILL, fan: STILL, ...twist }, ...options })
    }

    function corners(built, index) {
      const list = points(built.body.positions)
      return list.slice(index * list.length / 3, (index + 1) * list.length / 3)
    }

    function seen(built, index, scale = [1, 1]) {
      const anchor = [(built.plain?.min[0] + built.plain?.max[0]) / 2 || 0, built.plain?.min[1] ?? 0]
      return corners(built, index).map(point => [0, 1].map(axis => anchor[axis] + scale[axis] * (point[axis] - anchor[axis])))
    }

    function mover(flat, built, index, scale) {
      const [from, to] = [seen(flat, index, scale), seen(built, index, scale)]
      const other = from.findIndex(point => Math.hypot(point[0] - from[0][0], point[1] - from[0][1]) > 1)
      const angle = Math.atan2(to[other][1] - to[0][1], to[other][0] - to[0][0]) - Math.atan2(from[other][1] - from[0][1], from[other][0] - from[0][0])
      return { angle, move: ([x, y]) => [to[0][0] + Math.cos(angle) * (x - from[0][0]) - Math.sin(angle) * (y - from[0][1]), to[0][1] + Math.sin(angle) * (x - from[0][0]) + Math.cos(angle) * (y - from[0][1])] }
    }

    function hinged(flat, built, height, scale) {
      for (const index of [0, 1]) {
        const left = seen(flat, index, scale).map(point => point[0])
        const right = seen(flat, index + 1, scale).map(point => point[0])
        const hinge = [(Math.max(...left) + Math.min(...right)) / 2, height]
        const [a, b] = [mover(flat, built, index, scale).move(hinge), mover(flat, built, index + 1, scale).move(hinge)]
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4, `${a} and ${b} come apart`)
      }
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
      const built = text([place(glyph("a", 4, 4), 0)], { twist: { ribbon: { amount: 90, centre: 0 }, door: { amount: 90, centre: 1, same: true }, fan: { amount: 90, centre: 0.5, same: false } } })
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

    test("a fan turns characters flat on the screen and leaves the anchor still", () => {
      const flat = text(ROW)
      const built = twisted({ fan: { amount: 60, centre: 0 } })
      assert.deepEqual(corners(built, 0), corners(flat, 0))
      for (const index of [1, 2]) {
        assert.notDeepEqual(corners(built, index), corners(flat, index))
        assert.deepEqual(corners(built, index).map(point => point[2]), corners(flat, index).map(point => point[2]))
      }
    })

    test("a fan turns the far character the full amount", () => {
      const built = twisted({ fan: { amount: 45, centre: 0 } })
      for (const axis of [0, 1]) {
        near(spread(built, 2, axis), 4 * Math.SQRT2)
        near(spread(built, 1, axis), 4 * (Math.cos(Math.PI / 8) + Math.sin(Math.PI / 8)))
      }
    })

    test("a positive fan leans the tops of the ends away from the middle", () => {
      const built = twisted({ fan: { amount: 30, centre: 0.5 } })
      const flat = text(ROW)
      function across(index, y) {
        const list = corners(built, index).filter((point, at) => corners(flat, index)[at][1] === y)
        return list.reduce((sum, point) => sum + point[0], 0) / list.length
      }
      function lean(index) {
        return across(index, 4) - across(index, 0)
      }
      assert.ok(lean(0) < 0 && lean(2) > 0)
      assert.deepEqual(corners(built, 1), corners(flat, 1))
    })

    test("a fan mirrors its sides unless both sides turn the same way", () => {
      assert.ok(matchesMirror(twisted({ fan: { amount: 60, centre: 0.5 } })))
      assert.ok(matchesMirror(twisted({ fan: { amount: 60, centre: 0.5, roll: true, height: 1.5 } })))
      assert.ok(!matchesMirror(twisted({ fan: { amount: 60, centre: 0.5, same: true } })))
    })

    test("a fan around one shared point hinges each character on the next at the hinge height", () => {
      const flat = text(ROW)
      for (const height of [0, 0.5, 1, 1.5]) {
        const built = twisted({ fan: { amount: 30, centre: 0.5, roll: true, height } })
        assert.deepEqual(corners(built, 1), corners(flat, 1))
        hinged(flat, built, height * 4)
        near(Math.abs(mover(flat, built, 0).angle), Math.PI / 6)
      }
    })

    test("a fan off centre still keeps every character hinged", () => {
      const flat = text(ROW)
      hinged(flat, twisted({ fan: { amount: 50, centre: 0.2, roll: true, height: 0 } }), 0)
    })

    test("a fan hinges a scaled word's characters in its scaled space", () => {
      const scale = [2, 2, 1]
      const flat = text(ROW, { wordScale: scale })
      for (const height of [0, 1]) hinged(flat, twisted({ fan: { amount: 30, centre: 0.5, roll: true, height } }, { wordScale: scale }), height * 8, scale)
    })

    describe("under an uneven scale", () => {
      const EVERY = { ribbon: { amount: 45, centre: 0 }, door: { amount: 30, centre: 1, same: true, roll: true }, fan: { amount: 40, centre: 0.5, roll: true } }
      const LINE_SCALE = [0.78, 1.68, 0.77]
      const WORD_SCALE = [1.5, 0.8, 2]
      const TOTAL = LINE_SCALE.map((axis, index) => axis * WORD_SCALE[index])

      function square(positions, scale) {
        const list = triangles(positions)
        assert.ok(list.length)
        for (const triangle of list) {
          const [a, b, c] = triangle.map(point => point.map((value, axis) => value * scale[axis]))
          const turns = [[a, b, c], [b, c, a], [c, a, b]].map(([corner, left, right]) => {
            const [one, two] = [left, right].map(point => point.map((value, axis) => value - corner[axis]))
            return Math.abs(one.reduce((sum, value, axis) => sum + value * two[axis], 0)) / (Math.hypot(...one) * Math.hypot(...two))
          })
          assert.ok(Math.min(...turns) < 1e-5, `no right angle: ${turns}`)
        }
      }

      for (const [name, twist] of Object.entries(EVERY)) {
        test(`a ${name} keeps every box square`, () => {
          square(twisted({ [name]: twist }, { lineScale: LINE_SCALE }).body.positions, LINE_SCALE)
        })
      }

      test("line and word twists together keep every box square", () => {
        square(twisted(EVERY, { wordTwist: EVERY, lineScale: LINE_SCALE, wordScale: WORD_SCALE }).body.positions, TOTAL)
      })

      test("the outline stays square whether or not it scales", () => {
        const built = twisted(EVERY, { lineScale: LINE_SCALE, wordScale: WORD_SCALE })
        for (const scale of [TOTAL, LINE_SCALE, [1, 1, 1]]) square(buildOutline(built, scale).positions, TOTAL.map((axis, index) => axis / scale[index]))
      })

      test("an even scale changes nothing", () => {
        const plain = Array.from(twisted(EVERY).body.positions)
        for (const [at, value] of Array.from(twisted(EVERY, { lineScale: [3, 3, 3] }).body.positions).entries()) near(value, plain[at])
      })

      test("a fan hinges its characters in the line's scaled space", () => {
        const scale = [2, 0.5, 1]
        const flat = text(ROW, { lineScale: scale })
        for (const height of [0, 1]) hinged(flat, twisted({ fan: { amount: 30, centre: 0.5, roll: true, height } }, { lineScale: scale }), height * 2, scale)
      })
    })

    test("a word's scale doesn't stretch the line arc's lift", () => {
      const lifted = [place(glyph("a", 4, 4, { lift: 10, lineLift: 10 }), 0)]
      const plain = text(lifted, { wordScale: [1, 2, 1] })
      near(extents(plain.body.positions)[1][0], 5)
      near(plain.plain.min[1], 0)
      near(extents(text(lifted).body.positions)[1][0], 10)
    })

    test("a fanned outline still lines up with its character alongside the other twists", () => {
      const built = twisted({ ribbon: { amount: 45, centre: 0 }, door: { amount: 30, centre: 1, same: true }, fan: { amount: 40, centre: 0.5 } })
      const scale = [1, 2, 3]
      const outline = buildOutline(built, scale)
      const body = extents(built.body.positions).map((range, axis) => range.map(value => value * scale[axis]))
      const shell = extents(outline.positions)
      for (const axis of [0, 1, 2]) assert.ok(shell[axis][0] < body[axis][0] && shell[axis][1] > body[axis][1])
    })

    describe("on a word", () => {
      const ENDS = { ends: { first: -30, last: 18 } }

      function worded(twist, options = {}) {
        return text(ROW, { wordTwist: { ribbon: STILL, door: STILL, fan: STILL, ...twist }, ...options })
      }

      test("turns the word across its own span, whatever the line's ends", () => {
        const flat = text(ROW, ENDS)
        const built = worded({ door: { amount: 90, centre: 0, same: true } }, ENDS)
        assert.deepEqual(corners(built, 0), corners(flat, 0))
        near(spread(built, 2, 0), 4)
        near(spread(built, 2, 2), 4)
        assert.deepEqual(Array.from(built.body.positions), Array.from(worded({ door: { amount: 90, centre: 0, same: true } }).body.positions))
        assert.notDeepEqual(corners(twisted({ door: { amount: 90, centre: 0, same: true } }, ENDS), 0), corners(flat, 0))
      })

      test("its centre sits within the word", () => {
        const flat = text(ROW, ENDS)
        const built = worded({ fan: { amount: 40, centre: 0.5, roll: true } }, ENDS)
        assert.deepEqual(corners(built, 1), corners(flat, 1))
        assert.ok(matchesMirror(worded({ fan: { amount: 40, centre: 0.5 } })))
      })

      test("leaves a word without one alone", () => {
        const other = [place(glyph("d", 4, 4), 24)]
        assert.equal(text(other, ENDS).twist, null)
        assert.deepEqual(Array.from(text(other, { ...ENDS, wordTwist: null }).body.positions), Array.from(text(other, ENDS).body.positions))
      })

      test("adds its turn to the line's twist", () => {
        const line = { ribbon: { amount: 30, centre: 0 }, door: { amount: 50, centre: 1, same: true, roll: true }, fan: { amount: -20, centre: 0.25, roll: true } }
        const word = { ribbon: { amount: -15, centre: 0.5, same: true }, door: { amount: 25, centre: 0.5, roll: true }, fan: { amount: 35, centre: 1, roll: true } }
        const lone = text(ROW, { ...ENDS, twist: line })
        const own = text(ROW, { ...ENDS, wordTwist: word })
        const both = text(ROW, { ...ENDS, twist: line, wordTwist: word })
        for (const [index, { turn }] of both.twist.entries()) {
          for (const key of ["ribbon", "door", "fan", "moveX", "moveZ", "fanX", "fanY"]) near(turn[key], lone.twist[index].turn[key] + own.twist[index].turn[key])
        }
      })

      test("on the same span as the line it matches one bigger twist", () => {
        const both = text(ROW, { twist: { ribbon: { amount: 30, centre: 0 }, door: STILL, fan: STILL }, wordTwist: { ribbon: { amount: 20, centre: 0 }, door: { amount: 15, centre: 1 }, fan: STILL } })
        const single = twisted({ ribbon: { amount: 50, centre: 0 }, door: { amount: 15, centre: 1 } })
        const expected = Array.from(single.body.positions)
        for (const [at, value] of Array.from(both.body.positions).entries()) near(value, expected[at])
      })

      test("an all zero word twist is the same as none", () => {
        const still = { ribbon: STILL, door: { ...STILL, roll: true }, fan: { ...STILL, roll: true } }
        for (const options of [ENDS, { ...ENDS, twist: { ribbon: { amount: 30, centre: 0 }, door: { amount: 40, centre: 1, roll: true }, fan: { amount: 20, centre: 0.5, roll: true } } }]) {
          const plain = text(ROW, options)
          const zero = text(ROW, { ...options, wordTwist: still })
          assert.deepEqual(Array.from(zero.body.positions), Array.from(plain.body.positions))
          assert.deepEqual(zero.twist?.map(({ turn }) => turn) ?? null, plain.twist?.map(({ turn }) => turn) ?? null)
          assert.deepEqual(Array.from(buildOutline(zero, [1, 1, 1]).positions), Array.from(buildOutline(plain, [1, 1, 1]).positions))
        }
      })

      test("hinges a scaled word's characters across its own span", () => {
        const scale = [2, 2, 1]
        const flat = text(ROW, { ...ENDS, wordScale: scale })
        for (const height of [0, 1]) hinged(flat, worded({ fan: { amount: 30, centre: 0.5, roll: true, height } }, { ...ENDS, wordScale: scale }), height * 8, scale)
      })

      test("its outline follows the turned characters", () => {
        const built = worded({ ribbon: { amount: 45, centre: 0 }, door: { amount: 30, centre: 1, same: true }, fan: { amount: 40, centre: 0.5 } }, ENDS)
        const scale = [1, 2, 3]
        const outline = buildOutline(built, scale)
        const body = extents(built.body.positions).map((range, axis) => range.map(value => value * scale[axis]))
        const shell = extents(outline.positions)
        for (const axis of [0, 1, 2]) assert.ok(shell[axis][0] < body[axis][0] && shell[axis][1] > body[axis][1])
      })
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

  test("throws when one character's texture would pass the texture limit", () => {
    assert.throws(() => text([place(glyph("w", 2000, 1), 0)], { textureLimit: 4096 }), /over the 4096 limit/)
  })
})

describe("depth layers", () => {
  const LAYERED = { layers: [{ options: {} }, { options: {} }] }

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

  test("deeper text only moves the back, keeping each layer's step from the front", () => {
    const stepped = glyph("x", 3, 1, { depths: Uint8Array.from([0, 1, 0]) })
    const font = { layers: [1, 0.5], depth: 4, capHeight: 1, glyphs: { x: stepped } }
    assert.deepEqual(flatZs(text([place(stepped, 0)], { ...LAYERED, depth: 10 }, font).body), [-5, 3, 5])
    assert.deepEqual(flatZs(text([place(stepped, 0)], { ...LAYERED, depth: 2 }, font).body), [-1, 0, 1])
  })

  test("each layer packs side faces by its own setting", () => {
    const stepped = glyph("x", 3, 1, { depths: Uint8Array.from([0, 1, 0]) })
    const seen = []
    text([place(stepped, 0)], { layers: [{ options: { sideFaces: false } }, { options: { sideFaces: true } }], paint: painter(PAINTED, seen) }, { layers: [1, 0.5], capHeight: 1, glyphs: { x: stepped } })
    const [[back], [front]] = seen[0]
    assert.equal(back.runs.size, 0)
    assert.ok(front.runs.size > 0)
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

  test("independent layers each run from the back to their own depth without sharing boxes", () => {
    const stepped = glyph("x", 3, 1, { depths: Uint8Array.from([0, 1, 0]) })
    const backCapWithin = built => {
      const corners = points(built.body.positions)
      for (let index = 0; index < corners.length; index += 3) {
        const triangle = corners.slice(index, index + 3)
        if (triangle.every(point => point[2] === -2 && point[0] >= -1.5 && point[0] <= -0.5)) return true
      }
      return false
    }
    const stacked = text([place(stepped, 0)], LAYERED, { layers: [1, 0.5], capHeight: 1, glyphs: { x: stepped } })
    const independent = text([place(stepped, 0)], LAYERED, { layers: [1, 0.5], layerDepth: "independent", capHeight: 1, glyphs: { x: stepped } })
    assert.deepEqual(flatZs(independent.body), [-2, 0, 2])
    assert.equal(backCapWithin(stacked), false)
    assert.equal(backCapWithin(independent), true)
    assert.equal(independent.independent, true)
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

describe("mesh walls", () => {
  function wall(from, to, internal) {
    return { points: [[from[0], from[1], -2], [from[0], from[1], 2], [to[0], to[1], 2], [to[0], to[1], -2]], kind: "top", name: "up", internal, mesh: true }
  }

  function meshed(arc) {
    const cell = glyph("c", 4, 10)
    const faces = [wall([0, 10], [2, 10], false), wall([0, 5.5], [1, 5], true), wall([2, 10], [4, 9.5], false), wall([3, 9.5], [4, 8.5], false)]
    const font = { capHeight: 10, glyphs: { c: cell }, mesh: { glyphs: { c: {} }, tools: { meshFaces: () => ({ faces, rings: [[[0, 0], [0, 10], [4, 10], [4, 0]]] }) } } }
    text([place(arc ? { ...cell, arc } : cell, 0)], {}, font)
    return faces.map(face => face.internal)
  }

  test("a slanted wall reads its level the same through an arc that moves nothing", () => {
    assert.deepEqual(meshed({ map: Array.from({ length: 10 }, (_, row) => row) }), meshed(null))
  })

  test("a wall the mesh keeps on its curve near the top stays outside, and one deep below goes inside", () => {
    assert.deepEqual(meshed(null), [false, true, false, false])
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
  const TURN = { ribbon: { amount: 40, centre: 0.5, same: false }, door: { amount: 0, centre: 0.5, same: false }, fan: { amount: 0, centre: 0.5, same: false } }

  const FRONT = [{ front: 4 }]

  function line(count, every = 0) {
    return Array.from({ length: count }, (_, index) => ({ ...place(glyph(`g${index}`, 4, 4), index * 6), spaces: every && index && index % every === 0 ? 1 : 0 }))
  }

  test("a plain text has nothing to draw again", () => {
    const word = text(ROW)
    assert.equal(word.refine, null)
    assert.equal(word.pages.length, 1)
  })

  test("only the regions that ask for detail are drawn bigger", () => {
    const seen = []
    const word = text(ROW, { details: FRONT, paint: painter(PAINTED, seen) })
    word.refine(painter(PAINTED, seen))
    const [draft] = seen[0]
    const [sharp] = seen[1]
    const scales = (page, index) => ["front", "up", "down"].map(part => [page.regions.get(index)[part].sx, page.regions.get(index)[part].sy])
    for (const index of [0, 1]) {
      assert.deepEqual(scales(draft[0], index), [[4, 4], [4, 4], [4, 4]])
      assert.deepEqual(scales(sharp[0], index), [[16, 16], [4, 4], [4, 4]])
    }
  })

  test("an edge can be sharper along its length than across its depth", () => {
    const seen = []
    const word = text(ROW, { details: [{ edge: { along: 4, deep: 1 } }], paint: painter(PAINTED, seen) })
    word.refine(painter(PAINTED, seen))
    const [[page]] = seen[1]
    const { up, front, down } = page.regions.get(0)
    assert.deepEqual([up.sx, up.sy, down.sx, down.sy, front.sx], [16, 4, 16, 4, 4])
    assert.equal(front.y - up.y, 4 * 4)
  })

  test("drawing it again keeps the draft's texture coordinates beside the sharp ones", () => {
    const word = text(ROW, { details: FRONT })
    const sharp = word.refine(painter(PAINTED))
    assert.deepEqual(Array.from(sharp.body.plainUvs), Array.from(word.body.uvs))
    assert.notDeepEqual(Array.from(sharp.body.uvs), Array.from(word.body.uvs))
    assert.equal(sharp.pages[0].plain, word.pages[0])
  })

  test("drawing it again points the outline at the swatch in the sharp texture", () => {
    const seen = []
    const word = text(ROW, { details: FRONT, paint: painter(PAINTED, seen) })
    const sharp = word.refine(painter(PAINTED, seen))
    const [[page]] = seen[1]
    assert.deepEqual(sharp.swatch, [(page.swatch.x + page.swatch.scale / 2) / page.width, 1 - (page.swatch.y + page.swatch.scale / 2) / page.height])
  })

  test("drawing it again lays the texture out the same after a twist", () => {
    const flat = text(ROW, { details: FRONT, internalFaces: true, sideFaces: true })
    const turned = text(ROW, { details: FRONT, internalFaces: true, sideFaces: true, twist: TURN })
    const [a, b] = [flat, turned].map(word => word.refine(painter(PAINTED)))
    assert.deepEqual(b.pages[0].panels, a.pages[0].panels)
    assert.deepEqual(Array.from(b.body.uvs), Array.from(a.body.uvs))
  })

  test("packs a long line close to square", () => {
    const seen = []
    text(line(40), { paint: painter(PAINTED, seen) })
    const [[page]] = seen[0]
    assert.ok(Math.max(page.width, page.height) / Math.min(page.width, page.height) < 1.5)
  })

  test("splits a line that won't fit one texture across more, starting each at a word", () => {
    const seen = []
    const placed = line(30, 4)
    const word = text(placed, { paint: painter(PAINTED, seen), textureLimit: 128 })
    const [pages] = seen[0]
    assert.ok(pages.length > 1)
    for (const page of pages) assert.ok(page.width <= 128 && page.height <= 128)
    for (const page of pages.slice(1)) assert.equal(placed[page.indexes[0]].spaces, 1)
    assert.deepEqual(word.body.groups.map(group => group.page), pages.map((page, index) => index))
    assert.equal(word.pages.length, pages.length)
  })

  test("never lays a page out past the limit, drafted or sharp", () => {
    for (const limit of [128, 160, 200, 256, 300, 512]) {
      for (const count of [3, 5, 12, 30]) {
        const seen = []
        const word = text(line(count, 3), { details: [{ front: 4, edge: { along: 4, deep: 1 } }], paint: painter(PAINTED, seen), sideFaces: true, internalFaces: true, textureLimit: limit })
        word.refine(painter(PAINTED, seen))
        for (const page of seen.flat(2)) assert.ok(page.width <= limit && page.height <= limit, `${page.width}x${page.height} is over ${limit} with ${count} letters`)
      }
    }
  })

  test("splits instead of lowering detail when the sharp texture won't fit", () => {
    const seen = []
    const word = text(line(12), { details: FRONT, textureLimit: 256 })
    word.refine(painter(PAINTED, seen))
    const [pages] = seen[0]
    assert.ok(pages.length > 1)
    for (const page of pages) {
      assert.ok(page.width <= 256 && page.height <= 256)
      for (const regions of page.regions.values()) assert.equal(regions.front.sx, 16)
    }
    assert.equal(word.pages.length, pages.length)
  })
})

describe("door roll", () => {
  const ROW = [place(glyph("a", 4, 4), 0), place(glyph("b", 4, 4), 8), place(glyph("c", 4, 4), 16)]
  const STILL = { amount: 0, centre: 0.5, same: false }
  const RADIUS = 8 / (Math.PI / 2)

  function door(values) {
    return text(ROW, { twist: { ribbon: STILL, door: { amount: 90, centre: 0.5, same: false, ...values }, fan: STILL } })
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

  function chars(built, index) {
    const list = points(built.body.positions)
    return list.slice(index * list.length / 3, (index + 1) * list.length / 3)
  }

  function moved(flat, built, index, [x, z]) {
    const [from, to] = [chars(flat, index), chars(built, index)]
    const other = from.findIndex(point => Math.hypot(point[0] - from[0][0], point[2] - from[0][2]) > 1)
    const angle = Math.atan2(to[other][2] - to[0][2], to[other][0] - to[0][0]) - Math.atan2(from[other][2] - from[0][2], from[other][0] - from[0][0])
    return [to[0][0] + Math.cos(angle) * (x - from[0][0]) - Math.sin(angle) * (z - from[0][2]), to[0][2] + Math.sin(angle) * (x - from[0][0]) + Math.cos(angle) * (z - from[0][2])]
  }

  test("with it each character hinges on the next at the hinge depth", () => {
    const flat = text(ROW)
    for (const depth of [0, 0.5, 1, 1.5]) {
      const built = door({ roll: true, depth })
      const middle = middles(built)[1]
      near(middle[0], 0)
      near(middle[2], 0)
      const z = -flat.depth / 2 + flat.depth * depth
      for (const index of [0, 1]) {
        const left = chars(flat, index).map(point => point[0])
        const right = chars(flat, index + 1).map(point => point[0])
        const hinge = [(Math.max(...left) + Math.min(...right)) / 2, z]
        const [from, to] = [moved(flat, built, index, hinge), moved(flat, built, index + 1, hinge)]
        assert.ok(Math.hypot(from[0] - to[0], from[1] - to[1]) < 1e-4, `${from} and ${to} come apart`)
      }
    }
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
    const still = text(ROW, { twist: { ribbon: { amount: 30, centre: 0.5, same: false }, door: { ...STILL, roll: true }, fan: STILL } })
    const plain = text(ROW, { twist: { ribbon: { amount: 30, centre: 0.5, same: false }, door: STILL, fan: STILL } })
    assert.deepEqual(Array.from(still.body.positions), Array.from(plain.body.positions))
  })
})
