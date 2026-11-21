import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { GENERATED_EDGE_OVERLAYS, GENERATED_SETTINGS, PLACED_KINDS, generatedSetting, settingsOf, thumbnailLayer, toneKinds, withGenerated } from "../../src/lib/texture/overlays/settings.js"
import { generatedAlpha } from "../../src/lib/texture/overlays/faces.js"
import { waveOutline } from "../../src/lib/texture/overlays/patterns.js"
import { withFinalShadows } from "../../src/lib/texture/overlays/shadows.js"
import { columnOf, glyphOf, near, picture, rowsOf, solid } from "../helpers/overlays.js"

function nearAll(actual, expected, tolerance) {
  assert.equal(actual.length, expected.length)
  for (const [index, value] of expected.entries()) near(actual[index], value, tolerance)
}

function assertContinues(kind, layer) {
  const capHeight = 8
  const scale = 4
  const whole = generatedAlpha(solid(16, 8, { placedX: 3 }), kind, layer, capHeight, scale)
  const left = generatedAlpha(solid(6, 8, { placedX: 3 }), kind, layer, capHeight, scale)
  const right = generatedAlpha(solid(10, 8, { placedX: 9 }), kind, layer, capHeight, scale)
  const joined = rowsOf(left, 24).flatMap((row, index) => row.concat(rowsOf(right, 40)[index]))
  nearAll(joined, Array.from(whole), 0.00001)
}

function insidePolygon(points, x, y) {
  let inside = false
  for (let index = 0, last = points.length - 1; index < points.length; last = index++) {
    const [ax, ay] = points[index]
    const [bx, by] = points[last]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

function runsOf(text) {
  return Array.from(text.matchAll(/0+|1+/g), match => match[0])
}

function columnFill(alpha, columns, index) {
  return columnOf(alpha, columns, index).reduce((sum, value) => sum + value, 0)
}

describe("settings tables", () => {
  test("every fallback sits inside its slider range", () => {
    for (const [kind, settings] of Object.entries(GENERATED_SETTINGS)) {
      for (const item of settings) assert.ok(item.options ? item.options.some(option => option.value === item.fallback) : item.fallback >= item.min && item.fallback <= item.max, `${kind}.${item.key}`)
    }
  })

  test("the seed only shows once there is randomness to seed", () => {
    for (const kind of ["wave", "shine_random"]) {
      const seed = GENERATED_SETTINGS[kind].find(item => item.key === "seed")
      assert.deepEqual([0, 1, 60].map(randomness => seed.shown({ randomness })), [false, true, true], kind)
    }
    assert.equal(GENERATED_SETTINGS.cracks.find(item => item.key === "seed").shown, undefined)
  })

  test("every setting key is unique within its kind", () => {
    for (const [kind, settings] of Object.entries(GENERATED_SETTINGS)) assert.equal(new Set(settings.map(item => item.key)).size, settings.length, kind)
  })

  test("every generated overlay has settings", () => {
    for (const [id, overlay] of Object.entries(withGenerated({}))) assert.ok(GENERATED_SETTINGS[overlay.generated], id)
    for (const [id, overlay] of Object.entries(GENERATED_EDGE_OVERLAYS)) assert.ok(GENERATED_SETTINGS[overlay.generated], id)
  })

  test("every placed kind has settings", () => {
    for (const kind of PLACED_KINDS) assert.ok(GENERATED_SETTINGS[kind], kind)
  })
})

describe("withGenerated", () => {
  test("adds the built in overlays", () => {
    const overlays = withGenerated({ custom: { name: "Custom" } })
    assert.equal(overlays.highlights_top.generated, "top")
    assert.equal(overlays.corner_dots.generated, "corners")
    assert.deepEqual(overlays.custom, { name: "Custom" })
  })

  test("a font's own overlay replaces a built in one with the same id", () => {
    assert.deepEqual(withGenerated({ shine: { name: "Mine" } }).shine, { name: "Mine" })
  })

  test("does not change the table for later fonts", () => {
    withGenerated({ shine: { name: "Mine" } })
    assert.equal(withGenerated({}).shine.generated, "shine")
  })
})

describe("thumbnailLayer", () => {
  test("raises a thickness under a pixel to one pixel", () => {
    assert.equal(thumbnailLayer({ overlay: "outline", thickness: 0.25 }).thickness, 1)
    assert.equal(thumbnailLayer({ overlay: "outline", thickness: 0.5 }).thickness, 1)
  })

  test("leaves a pixel or more, or no thickness, alone", () => {
    const layer = { overlay: "outline", thickness: 2 }
    assert.equal(thumbnailLayer(layer), layer)
    assert.equal("thickness" in thumbnailLayer({ overlay: "shine" }), false)
  })
})

describe("generatedSetting", () => {
  const item = { key: "thickness", fallback: 3 }

  test("uses the layer's value", () => {
    assert.equal(generatedSetting({ thickness: 5 }, item), 5)
  })

  test("keeps a zero value", () => {
    assert.equal(generatedSetting({ thickness: 0 }, item), 0)
  })

  test("falls back when missing or null", () => {
    assert.equal(generatedSetting({}, item), 3)
    assert.equal(generatedSetting({ thickness: null }, item), 3)
  })
})

describe("side highlights", () => {
  test("each side lights the matching edge", () => {
    const glyph = solid(3, 3)
    assert.deepEqual(picture(generatedAlpha(glyph, "top", {}, 3, 1), 3), ["111", "000", "000"])
    assert.deepEqual(picture(generatedAlpha(glyph, "bottom", {}, 3, 1), 3), ["000", "000", "111"])
    assert.deepEqual(picture(generatedAlpha(glyph, "left", {}, 3, 1), 3), ["100", "100", "100"])
    assert.deepEqual(picture(generatedAlpha(glyph, "right", {}, 3, 1), 3), ["001", "001", "001"])
  })

  test("thickness reaches further in from the edge", () => {
    assert.deepEqual(picture(generatedAlpha(solid(3, 3), "top", { thickness: 2 }, 3, 1), 3), ["111", "111", "000"])
    assert.deepEqual(picture(generatedAlpha(solid(3, 3), "right", { thickness: 2 }, 3, 1), 3), ["011", "011", "011"])
  })

  test("thickness past the glyph lights everything", () => {
    assert.deepEqual(picture(generatedAlpha(solid(2, 2), "top", { thickness: 8 }, 2, 1), 2), ["11", "11"])
  })

  test("a gap starts a new edge below it", () => {
    const glyph = glyphOf(["1", "1", "0", "1", "1", "1"])
    assert.deepEqual(picture(generatedAlpha(glyph, "top", { thickness: 2 }, 6, 1), 1), ["1", "1", "0", "1", "1", "0"])
  })

  test("follows a stepped outline and leaves empty pixels clear", () => {
    assert.deepEqual(picture(generatedAlpha(glyphOf(["10", "11"]), "top", {}, 2, 1), 2), ["10", "01"])
  })

  test("upscales each pixel into a block", () => {
    assert.deepEqual(picture(generatedAlpha(glyphOf(["10", "11"]), "top", {}, 2, 2), 4), ["1100", "1100", "0011", "0011"])
  })
})

describe("outline", () => {
  test("defaults to a one pixel ring", () => {
    assert.deepEqual(picture(generatedAlpha(solid(5, 5), "outline", {}, 5, 1), 5), ["11111", "10001", "10001", "10001", "11111"])
  })

  test("inset moves the ring inward", () => {
    assert.deepEqual(picture(generatedAlpha(solid(5, 5), "outline", { inset: 1 }, 5, 1), 5), ["00000", "01110", "01010", "01110", "00000"])
  })

  test("thickness widens the ring", () => {
    assert.deepEqual(picture(generatedAlpha(solid(5, 5), "outline", { thickness: 2 }, 5, 1), 5), ["11111", "11111", "11011", "11111", "11111"])
  })

  test("inset and thickness combine", () => {
    assert.deepEqual(picture(generatedAlpha(solid(5, 5), "outline", { inset: 1, thickness: 2 }, 5, 1), 5), ["00000", "01110", "01110", "01110", "00000"])
  })

  test("an inset deeper than the glyph leaves nothing", () => {
    assert.deepEqual(picture(generatedAlpha(solid(5, 5), "outline", { inset: 3 }, 5, 1), 5), ["00000", "00000", "00000", "00000", "00000"])
  })

  test("a hole gets its own ring including diagonals", () => {
    const glyph = glyphOf(["1111111", "1111111", "1111111", "1110111", "1111111", "1111111", "1111111"])
    assert.deepEqual(picture(generatedAlpha(glyph, "outline", {}, 7, 1), 7), ["1111111", "1000001", "1011101", "1010101", "1011101", "1000001", "1111111"])
  })
})

describe("two-tone outline", () => {
  function toned(glyph, layer, columns) {
    const [light, dark] = toneKinds("two_tone_outline").map(kind => picture(generatedAlpha(glyph, kind, layer, glyph.height, 1), columns))
    return light.map((row, y) => Array.from(row, (value, x) => value === "1" ? dark[y][x] === "1" ? "?" : "L" : dark[y][x] === "1" ? "D" : "0").join(""))
  }

  test("is built in with white and black colours and the default layer settings", () => {
    const overlay = withGenerated({}).two_tone_outline
    assert.equal(overlay.name, "Two-Tone Outline")
    assert.deepEqual(overlay.palette, ["#ffffff", "#000000"])
    assert.equal(overlay.default, undefined)
  })

  test("splits into a light and a dark tone", () => {
    assert.deepEqual(toneKinds("two_tone_outline"), ["two_tone_outline_light", "two_tone_outline_dark"])
    assert.deepEqual(toneKinds("outline"), ["outline"])
  })

  test("lights the top and left sides and darkens the bottom and right, with the top and left winning the corners", () => {
    assert.deepEqual(toned(solid(5, 5), {}, 5), ["LLLLL", "L000D", "L000D", "L000D", "LDDDD"])
  })

  test("covers the same ring as the plain outline", () => {
    const glyph = glyphOf(["111000", "111000", "111000", "111111", "111111", "111111"])
    for (const layer of [{}, { thickness: 2 }]) assert.deepEqual(picture(generatedAlpha(glyph, "two_tone_outline", layer, 6, 1), 6), picture(generatedAlpha(glyph, "outline", layer, 6, 1), 6))
  })

  test("direction turns which sides are light", () => {
    assert.deepEqual(toned(solid(5, 5), { direction: 90 }, 5), ["LLLLL", "D000L", "D000L", "D000L", "DDDDL"])
    assert.deepEqual(toned(solid(5, 5), { direction: 180 }, 5), ["DDDDL", "D000L", "D000L", "D000L", "LLLLL"])
    assert.deepEqual(toned(solid(5, 5), { direction: 270 }, 5), ["LDDDD", "L000D", "L000D", "L000D", "LLLLL"])
  })

  test("thickness widens each side and the overlapping corners stay light", () => {
    assert.deepEqual(toned(solid(5, 5), { thickness: 2 }, 5), ["LLLLL", "LLLLL", "LL0DD", "LLDDD", "LLDDD"])
  })

  test("an inner corner counts as top", () => {
    assert.deepEqual(toned(glyphOf(["111000", "111000", "111000", "111111", "111111", "111111"]), {}, 6), ["LLL000", "L0D000", "L0D000", "L0LLLL", "L0000D", "LDDDDD"])
  })

  test("a hole is shaded the other way round", () => {
    const glyph = glyphOf(["1111111", "1111111", "1111111", "1110111", "1111111", "1111111", "1111111"])
    assert.deepEqual(toned(glyph, {}, 7), ["LLLLLLL", "L00000D", "L0DDL0D", "L0D0L0D", "L0LLL0D", "L00000D", "LDDDDDD"])
  })
})

describe("outline fade", () => {
  test("is strongest at mid height and fades evenly to both ends", () => {
    const strength = columnOf(generatedAlpha(solid(3, 10), "outline_fade", { spread: 100 }, 10, 1), 3, 0)
    near(strength[0], 0.1417)
    near(strength[4], 0.9645)
    for (let row = 0; row < 5; row++) near(strength[row], strength[9 - row], 0.00001)
    for (let row = 0; row < 4; row++) assert.ok(strength[row] < strength[row + 1])
  })

  test("only touches the outline pixels", () => {
    const alpha = generatedAlpha(solid(3, 10), "outline_fade", { spread: 100 }, 10, 1)
    assert.deepEqual(columnOf(alpha, 3, 1).slice(1, 9), new Array(8).fill(0))
    assert.ok(columnOf(alpha, 3, 2)[5] > 0)
  })

  test("thickness widens the faded band", () => {
    const alpha = generatedAlpha(solid(5, 10), "outline_fade", { spread: 100, thickness: 2 }, 10, 1)
    assert.ok(rowsOf(alpha, 5)[5][1] > 0)
    assert.equal(rowsOf(alpha, 5)[5][2], 0)
  })

  test("a small spread limits the fade to the middle rows", () => {
    const strength = columnOf(generatedAlpha(solid(3, 10), "outline_fade", { spread: 20 }, 10, 1), 3, 0)
    near(strength[4], 0.634)
    near(strength[5], 0.634)
    assert.deepEqual(strength.slice(0, 4).concat(strength.slice(6)), new Array(8).fill(0))
  })

  test("recentres on the stretched span of an arced glyph", () => {
    const raised = columnOf(generatedAlpha(solid(3, 14, { arc: { top: 4, bottom: 0 } }), "outline_fade", { spread: 100 }, 10, 1), 3, 0)
    const dropped = columnOf(generatedAlpha(solid(3, 14, { bottom: -4, arc: { top: 0, bottom: 4 } }), "outline_fade", { spread: 100 }, 10, 1), 3, 0)
    for (const strength of [raised, dropped]) {
      near(strength[6], strength[7], 0.00001)
      near(strength[0], strength[13], 0.00001)
      assert.equal(Math.max(...strength), strength[6])
    }
  })

  test("sits off centre on a tall glyph with no arc", () => {
    const strength = columnOf(generatedAlpha(solid(3, 14), "outline_fade", { spread: 100 }, 10, 1), 3, 0)
    assert.equal(Math.max(...strength), strength[9])
    assert.equal(strength[0], 0)
  })
})

describe("inverted outline fade", () => {
  test("is strongest at the ends and clear in the middle", () => {
    const strength = columnOf(generatedAlpha(solid(3, 10), "outline_fade_inverted", { spread: 100 }, 10, 1), 3, 0)
    nearAll(strength, [0.9, 0.7, 0.5, 0.3, 0.1, 0.1, 0.3, 0.5, 0.7, 0.9])
  })

  test("a small spread limits the fade to the ends", () => {
    const strength = columnOf(generatedAlpha(solid(3, 10), "outline_fade_inverted", { spread: 20 }, 10, 1), 3, 0)
    nearAll(strength, [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.5])
  })

  test("fades smoothly inside each letter pixel at higher detail", () => {
    for (const kind of ["outline_fade", "outline_fade_inverted"]) {
      const coarse = columnOf(generatedAlpha(solid(3, 10), kind, { spread: 100 }, 10, 1), 3, 0)
      const fine = columnOf(generatedAlpha(solid(3, 10), kind, { spread: 100 }, 10, 4), 12, 0)
      assert.equal(new Set(fine.slice(4, 8)).size, 4, kind)
      for (let row = 0; row < 10; row++) near((fine[row * 4 + 1] + fine[row * 4 + 2]) / 2, coarse[row], 0.06)
    }
  })
})

describe("corner dots", () => {
  test("marks each outer corner", () => {
    assert.deepEqual(picture(generatedAlpha(solid(3, 3), "corners", { size: 1, inset: 0 }, 3, 1), 3), ["101", "000", "101"])
  })

  test("default dots are two wide and inset by one", () => {
    assert.deepEqual(picture(generatedAlpha(solid(8, 8), "corners", {}, 8, 1), 8), ["00000000", "01100110", "01100110", "00000000", "00000000", "01100110", "01100110", "00000000"])
  })

  test("skips inner corners", () => {
    assert.deepEqual(picture(generatedAlpha(glyphOf(["110", "111", "111"]), "corners", { size: 1, inset: 0 }, 3, 1), 3), ["110", "001", "101"])
  })

  test("drops a dot that would fall outside the glyph", () => {
    assert.deepEqual(picture(generatedAlpha(solid(2, 2), "corners", { size: 2, inset: 1 }, 2, 1), 2), ["00", "00"])
  })

  test("drops a dot that would cross a gap in the shape", () => {
    assert.deepEqual(picture(generatedAlpha(glyphOf(["10", "11"]), "corners", { size: 2, inset: 0 }, 2, 1), 2), ["00", "00"])
  })
})

describe("shine", () => {
  const upright = { width: 2, gap: 2, angle: 90, offset: 0, fade: 0 }

  test("an upright band repeats every width plus gap", () => {
    assert.deepEqual(picture(generatedAlpha(solid(8, 2, { placedX: 1.25 }), "shine", upright, 2, 1), 8), ["11001100", "11001100"])
  })

  test("offset slides the bands along", () => {
    assert.deepEqual(picture(generatedAlpha(solid(8, 2, { placedX: 1.25 }), "shine", { ...upright, offset: 2 }, 2, 1), 8), ["00110011", "00110011"])
  })

  test("the glyph's place on the line moves its bands", () => {
    assert.deepEqual(picture(generatedAlpha(solid(8, 1, { placedX: 3.25 }), "shine", upright, 1, 1), 8), ["00110011"])
  })

  test("resolves band edges below a whole pixel when scaled", () => {
    const alpha = generatedAlpha(solid(4, 1, { placedX: 1.75 }), "shine", { width: 1, gap: 1, angle: 90, offset: 0, fade: 0 }, 1, 2)
    assert.deepEqual(picture(alpha, 8), ["10011001", "10011001"])
  })

  test("a flat band ignores the place on the line and stays regular past zero", () => {
    const expected = Array.from({ length: 30 }, (_, row) => row % 4 === 1 || row % 4 === 2 ? "1" : "0")
    const flat = { width: 2, gap: 2, angle: 0, offset: 0, fade: 0 }
    assert.deepEqual(picture(generatedAlpha(solid(1, 30), "shine", flat, 30, 1), 1), expected)
    assert.deepEqual(picture(generatedAlpha(solid(1, 30, { placedX: 7 }), "shine", flat, 30, 1), 1), expected)
  })

  test("fade darkens from the top of the cap height down", () => {
    const wide = { width: 32, gap: 1, angle: 90, offset: 0 }
    nearAll(columnOf(generatedAlpha(solid(2, 4, { placedX: 1.25 }), "shine", { ...wide, fade: 100 }, 4, 1), 2, 0), [0.875, 0.625, 0.375, 0.125])
    nearAll(columnOf(generatedAlpha(solid(2, 4, { placedX: 1.25 }), "shine", { ...wide, fade: 50 }, 4, 1), 2, 0), [0.9375, 0.8125, 0.6875, 0.5625])
  })

  test("fade measures across the arced height", () => {
    const glyph = solid(2, 6, { placedX: 1.25, arc: { top: 2, bottom: 0 } })
    const alpha = generatedAlpha(glyph, "shine", { width: 32, gap: 1, angle: 90, offset: 0, fade: 100 }, 4, 1)
    nearAll(columnOf(alpha, 2, 0), [11 / 12, 9 / 12, 7 / 12, 5 / 12, 3 / 12, 1 / 12])
  })

  test("reads the mask top row first", () => {
    const alpha = generatedAlpha(glyphOf(["11", "00"], { placedX: 1.25 }), "shine", { width: 32, gap: 1, angle: 90, offset: 0, fade: 0 }, 2, 1)
    assert.deepEqual(picture(alpha, 2), ["11", "00"])
  })

  test("leaves empty pixels clear", () => {
    const alpha = generatedAlpha(glyphOf(["101", "010"], { placedX: 1.25 }), "shine", { width: 32, gap: 1, angle: 90, offset: 0, fade: 0 }, 2, 1)
    assert.deepEqual(picture(alpha, 3), ["101", "010"])
  })

  test("bands carry on across neighbouring glyphs", () => {
    assertContinues("shine", {})
  })
})

describe("random shine", () => {
  const upright = { width: 6, gap: 11, angle: 90, offset: 0, fade: 0 }

  test("zero randomness gives regular bands", () => {
    const [row] = picture(generatedAlpha(solid(120, 1), "shine_random", { ...upright, randomness: 0 }, 1, 1), 120)
    const inner = runsOf(row).slice(1, -1)
    assert.ok(inner.length >= 8)
    for (const run of inner) assert.equal(run.length, run[0] === "1" ? 6 : 11)
  })

  test("randomness varies the band widths", () => {
    const [row] = picture(generatedAlpha(solid(200, 1), "shine_random", { ...upright, randomness: 75 }, 1, 1), 200)
    const lengths = new Set(runsOf(row).slice(1, -1).filter(run => run[0] === "1").map(run => run.length))
    assert.ok(lengths.size > 1)
  })

  test("the same seed repeats the same pattern", () => {
    const glyph = solid(60, 4)
    assert.deepEqual(generatedAlpha(glyph, "shine_random", { seed: 3 }, 4, 1), generatedAlpha(glyph, "shine_random", { seed: 3 }, 4, 1))
  })

  test("a different seed changes the pattern", () => {
    const glyph = solid(60, 4)
    assert.notDeepEqual(generatedAlpha(glyph, "shine_random", { seed: 3 }, 4, 1), generatedAlpha(glyph, "shine_random", { seed: 4 }, 4, 1))
  })

  test("bands carry on across neighbouring glyphs", () => {
    assertContinues("shine_random", {})
  })
})

describe("wave", () => {
  const flat = { amplitude: 0, randomness: 0 }

  test("a flat wave fills from the cap top down to the level", () => {
    assert.deepEqual(picture(generatedAlpha(solid(2, 10), "wave", { ...flat, level: 50 }, 10, 1), 2), ["11", "11", "11", "11", "11", "00", "00", "00", "00", "00"])
  })

  test("turned upside down, the wave fills up from the bottom", () => {
    assert.deepEqual(picture(generatedAlpha(solid(2, 10), "wave", { ...flat, level: 50, angle: 180 }, 10, 1), 2), ["00", "00", "00", "00", "00", "11", "11", "11", "11", "11"])
  })

  test("turned a quarter, the wave fills in from the side", () => {
    assert.deepEqual(picture(generatedAlpha(solid(4, 10), "wave", { ...flat, level: 30, angle: 90 }, 10, 1), 4), new Array(10).fill("0011"))
  })

  test("the surface row is antialiased", () => {
    assert.deepEqual(columnOf(generatedAlpha(solid(1, 10), "wave", { ...flat, level: 45 }, 10, 1), 1, 0), [1, 1, 1, 1, 0.5, 0, 0, 0, 0, 0])
    assert.deepEqual(columnOf(generatedAlpha(solid(1, 10), "wave", { ...flat, level: 55, angle: 180 }, 10, 1), 1, 0), [0, 0, 0, 0, 0.5, 1, 1, 1, 1, 1])
  })

  test("scale sharpens the surface", () => {
    const strength = columnOf(generatedAlpha(solid(1, 10), "wave", { ...flat, level: 45 }, 10, 2), 2, 0)
    assert.deepEqual(strength, new Array(9).fill(1).concat(new Array(11).fill(0)))
  })

  test("the level limits empty and fill the glyph", () => {
    assert.deepEqual(picture(generatedAlpha(solid(2, 2), "wave", { ...flat, level: 0 }, 2, 1), 2), ["00", "00"])
    assert.deepEqual(picture(generatedAlpha(solid(2, 2), "wave", { ...flat, level: 100 }, 2, 1), 2), ["11", "11"])
  })

  test("the surface holds its height for shorter and taller glyphs", () => {
    const low = generatedAlpha(solid(1, 10, { bottom: -2 }), "wave", { ...flat, level: 50 }, 10, 1)
    const tall = generatedAlpha(solid(1, 12), "wave", { ...flat, level: 50 }, 10, 1)
    assert.equal(columnFill(low, 1, 0), 3)
    assert.equal(columnFill(tall, 1, 0), 7)
  })

  test("leaves empty pixels clear at any angle", () => {
    const glyph = glyphOf(["101", "010"])
    assert.deepEqual(picture(generatedAlpha(glyph, "wave", { ...flat, level: 100 }, 2, 1), 3), ["101", "010"])
    assert.deepEqual(picture(generatedAlpha(glyph, "wave", { ...flat, level: 100, angle: 180 }, 2, 1), 3), ["101", "010"])
  })

  test("the surface swings by the amplitude around the level", () => {
    const alpha = generatedAlpha(solid(160, 40), "wave", { level: 50, amplitude: 7, length: 40, randomness: 0 }, 40, 1)
    const fills = Array.from({ length: 160 }, (_, column) => columnFill(alpha, 160, column))
    near(Math.min(...fills), 13, 0.05)
    near(Math.max(...fills), 27, 0.05)
  })

  test("zero randomness repeats every two lengths", () => {
    const alpha = generatedAlpha(solid(160, 40), "wave", { level: 50, amplitude: 7, length: 40, randomness: 0 }, 40, 1)
    for (let column = 0; column < 80; column++) near(columnFill(alpha, 160, column), columnFill(alpha, 160, column + 80))
  })

  test("offset slides the surface to the right", () => {
    const layer = { level: 50, amplitude: 7, length: 40, randomness: 0 }
    const still = generatedAlpha(solid(60, 40), "wave", layer, 40, 1)
    const moved = generatedAlpha(solid(60, 40), "wave", { ...layer, offset: 10 }, 40, 1)
    for (let column = 10; column < 60; column++) near(columnFill(moved, 60, column), columnFill(still, 60, column - 10))
  })

  test("the seed does nothing at zero randomness", () => {
    const layer = { amplitude: 7, randomness: 0 }
    assert.deepEqual(generatedAlpha(solid(30, 10), "wave", { ...layer, seed: 1 }, 10, 1), generatedAlpha(solid(30, 10), "wave", { ...layer, seed: 2 }, 10, 1))
  })

  test("the seed changes a random wave and repeats exactly", () => {
    const glyph = solid(60, 20)
    assert.deepEqual(generatedAlpha(glyph, "wave", { randomness: 60, seed: 1 }, 20, 1), generatedAlpha(glyph, "wave", { randomness: 60, seed: 1 }, 20, 1))
    assert.notDeepEqual(generatedAlpha(glyph, "wave", { randomness: 60, seed: 1 }, 20, 1), generatedAlpha(glyph, "wave", { randomness: 60, seed: 2 }, 20, 1))
  })

  test("the surface carries on across neighbouring glyphs", () => {
    assertContinues("wave", {})
    assertContinues("wave", { angle: 180 })
    assertContinues("wave", { angle: 35, waveShape: "triangle" })
    assertContinues("wave", { waveShape: "square" })
    assertContinues("wave", { pixelation: 3 })
    assertContinues("wave", { pixelation: 2, angle: 60 })
  })

  test("a square wave only sits at its top and bottom", () => {
    const alpha = generatedAlpha(solid(160, 40), "wave", { waveShape: "square", level: 50, amplitude: 7, length: 40, randomness: 0 }, 40, 1)
    const fills = new Set(Array.from({ length: 160 }, (_, column) => columnFill(alpha, 160, column)))
    assert.deepEqual(Array.from(fills).sort((a, b) => a - b), [13, 27])
  })

  test("a triangle wave climbs in straight lines", () => {
    const alpha = generatedAlpha(solid(160, 40), "wave", { waveShape: "triangle", level: 50, amplitude: 7, length: 40, randomness: 0 }, 40, 1)
    const fills = Array.from({ length: 160 }, (_, column) => columnFill(alpha, 160, column))
    const steps = fills.slice(1).map((fill, column) => Math.abs(fill - fills[column]))
    assert.ok(steps.every(step => step <= 0.351))
    assert.ok(steps.filter(step => Math.abs(step - 0.35) < 0.001).length >= 150)
    near(Math.min(...fills), 13, 0.2)
    near(Math.max(...fills), 27, 0.2)
  })

  test("pixelation snaps the surface to blocks of that size", () => {
    for (const waveShape of ["sine", "square", "triangle"]) {
      const alpha = generatedAlpha(solid(80, 40), "wave", { waveShape, level: 50, amplitude: 7, length: 40, randomness: 0, pixelation: 4 }, 40, 2)
      const fills = Array.from({ length: 160 }, (_, column) => columnFill(alpha, 160, column) / 2)
      for (let column = 0; column < 160; column++) {
        assert.equal(fills[column] % 4, 0)
        assert.equal(fills[column], fills[column - column % 8])
      }
    }
  })

  test("pixelation keeps square blocks on the pixel grid at any angle", () => {
    const alpha = generatedAlpha(solid(24, 24), "wave", { level: 50, amplitude: 5, length: 16, randomness: 0, angle: 45, pixelation: 2 }, 24, 2)
    const rows = rowsOf(alpha, 48)
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) assert.equal(rows[y][x], rows[y - y % 4][x - x % 4])
    }
    assert.ok(alpha.some(value => value === 1) && alpha.some(value => value === 0))
  })

  function blockHeights(layer, block) {
    const alpha = generatedAlpha(solid(240, 48), "wave", { level: 50, amplitude: 9, length: 36, randomness: 0, ...layer, pixelation: block }, 48, 1)
    return Array.from({ length: 240 / block }, (_, column) => columnFill(alpha, 240, column * block))
  }

  function runsOf(heights) {
    const runs = []
    for (const height of heights) {
      if (runs.at(-1)?.height === height) runs.at(-1).length++
      else runs.push({ height, length: 1 })
    }
    return runs
  }

  test("every pixelated bump is the same", () => {
    for (const waveShape of ["sine", "triangle", "square"]) {
      const heights = blockHeights({ waveShape }, 2)
      for (let column = 0; column + 36 < heights.length; column++) assert.equal(heights[column], heights[column + 36], waveShape)
    }
  })

  test("pixelated slopes only shorten towards the middle and lengthen again", () => {
    const runs = runsOf(blockHeights({ waveShape: "sine", amplitude: 12, length: 60 }, 2))
    for (let index = 2; index < runs.length - 2; index++) {
      const [before, run, after] = runs.slice(index - 1, index + 2)
      if ((before.height - run.height) * (run.height - after.height) > 0) assert.ok(!(run.length > before.length && run.length > after.length), `run ${index}`)
    }
  })

  test("a pixelated triangle comes to a point", () => {
    const runs = runsOf(blockHeights({ waveShape: "triangle" }, 2))
    const peaks = runs.slice(1, -1).filter((run, index) => run.height > runs[index].height && run.height > runs[index + 2].height)
    assert.ok(peaks.length)
    for (const peak of peaks) assert.ok(peak.length <= 2)
  })

  test("an angled pixelated wave leaves no stray blocks", () => {
    const alpha = generatedAlpha(solid(120, 48), "wave", { level: 50, amplitude: 9, length: 36, angle: 20, pixelation: 3 }, 48, 1)
    const blocks = rowsOf(alpha, 120).filter((_, y) => y % 3 === 0).map(row => row.filter((_, x) => x % 3 === 0))
    for (let y = 1; y < blocks.length - 1; y++) {
      for (let x = 1; x < blocks[y].length - 1; x++) {
        const value = blocks[y][x]
        assert.ok([blocks[y - 1][x], blocks[y + 1][x], blocks[y][x - 1], blocks[y][x + 1]].some(other => other === value), `${x},${y}`)
      }
    }
  })

  test("pixelation blocks start at the letter's own left edge", () => {
    const alpha = generatedAlpha(solid(12, 12, { placedX: 3 }), "wave", { level: 50, amplitude: 5, length: 10, angle: 30, pixelation: 4 }, 12, 1)
    for (const row of rowsOf(alpha, 12)) {
      for (let x = 0; x < 12; x++) assert.equal(row[x], row[x - x % 4])
    }
  })

  test("the angle turns around the middle of the line", () => {
    const layer = { level: 40, amplitude: 5, length: 12, randomness: 0 }
    const turned = generatedAlpha(solid(4, 10, { placedX: 0, lineSpan: [0, 20] }), "wave", { ...layer, angle: 180 }, 10, 1)
    const plain = generatedAlpha(solid(4, 10, { placedX: 16, lineSpan: [0, 20] }), "wave", layer, 10, 1)
    nearAll(Array.from(turned).reverse(), Array.from(plain), 0.00001)
  })

  test("the horizontal offset slides a turned wave sideways", () => {
    const layer = { level: 40, amplitude: 5, length: 12, angle: 30 }
    const moved = generatedAlpha(solid(20, 10, { placedX: 5, lineSpan: [0, 40] }), "wave", { ...layer, horizontalOffset: 5 }, 10, 1)
    const still = generatedAlpha(solid(20, 10, { placedX: 0, lineSpan: [0, 40] }), "wave", layer, 10, 1)
    nearAll(Array.from(moved), Array.from(still), 0.00001)
  })

  test("the wave offset slides along a turned wave rather than across the screen", () => {
    const layer = { level: 40, amplitude: 5, length: 12, angle: 30 }
    const glyph = solid(20, 10, { placedX: 0, lineSpan: [0, 20] })
    assert.notDeepEqual(generatedAlpha(glyph, "wave", { ...layer, offset: 5 }, 10, 1), generatedAlpha(glyph, "wave", { ...layer, horizontalOffset: 5 }, 10, 1))
  })

  test("both offsets match on an unturned wave", () => {
    const layer = { level: 40, amplitude: 5, length: 12 }
    const glyph = solid(20, 10, { placedX: 0, lineSpan: [0, 20] })
    assert.deepEqual(generatedAlpha(glyph, "wave", { ...layer, offset: 5 }, 10, 1), generatedAlpha(glyph, "wave", { ...layer, horizontalOffset: 5 }, 10, 1))
  })

  test("an unturned wave ignores where the middle of the line is", () => {
    const layer = { level: 40, amplitude: 5, length: 12 }
    assert.deepEqual(generatedAlpha(solid(8, 10, { placedX: 4, lineSpan: [0, 60] }), "wave", layer, 10, 1), generatedAlpha(solid(8, 10, { placedX: 4 }), "wave", layer, 10, 1))
  })

  test("a wave far to the left of the start still draws", () => {
    const alpha = generatedAlpha(solid(20, 20, { placedX: 3000 }), "wave", { level: 50, angle: 180 }, 20, 1)
    assert.ok(alpha.some(value => value > 0) && alpha.some(value => value === 0))
  })

  test("no pixelation leaves the wave smooth", () => {
    const layer = { level: 50, amplitude: 7, length: 40, randomness: 0 }
    assert.deepEqual(generatedAlpha(solid(60, 40), "wave", { ...layer, pixelation: 0 }, 40, 2), generatedAlpha(solid(60, 40), "wave", layer, 40, 2))
  })

  test("a smooth wave draws exactly the same unturned, turned over and turned at an angle", () => {
    const glyph = solid(30, 20, { placedX: 7, lineSpan: [0, 60] })
    const layer = { randomness: 40, seed: 3, amplitude: 5, length: 17, offset: 3, horizontalOffset: 2, level: 40 }
    const digest = (angle, waveShape) => createHash("sha1").update(generatedAlpha(glyph, "wave", { ...layer, angle, waveShape }, 20, 3)).digest("hex").slice(0, 16)
    assert.deepEqual([0, 180, 35].map(angle => ["sine", "square", "triangle"].map(waveShape => digest(angle, waveShape))), [
      ["e84540fd2500b72c", "99d3d96ff86aaa45", "286ccf9a12e88ecd"],
      ["2ebb0247ccae57db", "9fb862accd4abcf8", "a9c52e9fbcaf9e88"],
      ["cb6e720c0ed981c9", "c69a8a00eb7efd68", "67df6fd9e9984e67"]
    ])
  })

  test("the exact outline covers the same pixels as the drawn wave, at any angle and shape", () => {
    const glyph = solid(30, 20, { placedX: 7, lineSpan: [0, 60] })
    const layer = { randomness: 40, seed: 3, amplitude: 5, length: 17, offset: 3, horizontalOffset: 2, level: 40 }
    const scale = 3
    for (const angle of [0, 180, 35]) {
      for (const waveShape of ["sine", "square", "triangle"]) {
        const settings = { ...layer, angle, waveShape }
        const alpha = generatedAlpha(glyph, "wave", settings, 20, scale)
        const outline = waveOutline(glyph, { ...settingsOf("wave", settings), capHeight: 20 })
        for (let sy = 0; sy < 20 * scale; sy++) {
          for (let sx = 0; sx < 30 * scale; sx++) {
            const value = alpha[sy * 30 * scale + sx]
            if (value > 0.02 && value < 0.98) continue
            assert.equal(insidePolygon(outline, (sx + 0.5) / scale, (sy + 0.5) / scale), value >= 0.5, `${waveShape} at ${angle} degrees, pixel ${sx}, ${sy}`)
          }
        }
      }
    }
  })

  test("a pixelated wave has no exact outline, so it is traced as drawn", () => {
    assert.equal(waveOutline(solid(4, 4), { ...settingsOf("wave", { pixelation: 2 }), capHeight: 4 }), null)
  })
})

describe("layer shadow", () => {
  const caster = glyphOf(["1100", "1100", "1100", "1100"]).mask
  const receiver = glyphOf(["1111", "1111", "1111", "0000"], { caster })
  const row = (alpha, y) => Array.from(alpha.subarray(y * 4, y * 4 + 4))

  test("casts the layer in front of it along the angle, only onto its own pixels", () => {
    const right = generatedAlpha(receiver, "shadow", { angle: 0, distance: 1, blur: 0 }, 4, 1)
    assert.deepEqual(row(right, 0), [0, 0, 1, 0])
    assert.deepEqual(row(right, 3), [0, 0, 0, 0])
    const down = generatedAlpha({ ...receiver, caster: glyphOf(["1111", "0000", "0000", "0000"]).mask }, "shadow", { angle: 90, distance: 2, blur: 0 }, 4, 1)
    assert.deepEqual([0, 1, 2, 3].map(y => row(down, y)[0]), [0, 1, 1, 0])
  })

  test("joins onto the corners of the layer in front", () => {
    const block = { ...glyphOf(["1111", "1111", "1111", "1111"]), caster: glyphOf(["1100", "1100", "0000", "0000"]).mask }
    const diagonal = generatedAlpha(block, "shadow", { angle: 45, distance: Math.SQRT2 * 2, blur: 0 }, 4, 1)
    assert.equal(row(diagonal, 1)[2], 1)
    assert.equal(row(diagonal, 2)[1], 1)
    assert.equal(row(diagonal, 3)[0], 0)
  })

  test("a blurred shadow leaves the far side of a hole lit and the side it falls from dark", () => {
    const framed = { ...glyphOf(["11111111", "11111111", "11111111", "11111111", "11111111", "11111111", "11111111", "11111111"]), caster: glyphOf(["11111111", "10000001", "10000001", "10000001", "10000001", "10000001", "10000001", "11111111"]).mask }
    const alpha = generatedAlpha(framed, "shadow", { angle: 0, distance: 1, blur: 2 }, 8, 4)
    const at = (column, row) => alpha[(row * 4 + 2) * 32 + column * 4 + 2]
    assert.ok(at(6, 4) < 0.1)
    assert.ok(at(1, 4) > 0.4)
  })

  test("never carries light or shadow between holes that only touch at a corner", () => {
    const full = glyphOf(["11111111", "11111111", "11111111", "11111111", "11111111", "11111111", "11111111", "11111111"])
    const both = generatedAlpha({ ...full, caster: glyphOf(["11111111", "10001111", "10001111", "10001111", "11110001", "11110001", "11110001", "11111111"]).mask }, "shadow", { angle: 0, distance: 1, blur: 2 }, 8, 4)
    const alone = generatedAlpha({ ...full, caster: glyphOf(["11111111", "10001111", "10001111", "10001111", "11111111", "11111111", "11111111", "11111111"]).mask }, "shadow", { angle: 0, distance: 1, blur: 2 }, 8, 4)
    for (let row = 4; row < 16; row++) {
      for (let column = 4; column < 16; column++) assert.ok(Math.abs(both[row * 32 + column] - alone[row * 32 + column]) < 1e-6)
    }
  })

  test("stays sharp against the layer in front and softens as it falls away", () => {
    const strip = { ...glyphOf(["111111111111", "111111111111", "111111111111"]), caster: glyphOf(["100000000000", "100000000000", "100000000000"]).mask }
    const alpha = withFinalShadows(() => generatedAlpha(strip, "shadow", { angle: 0, distance: 4, blur: 4 }, 3, 4))
    const at = px => alpha[6 * 48 + px]
    assert.ok(at(4) > 0.99)
    assert.ok(at(20) > 0.1 && at(20) < 0.9)
  })

  test("only paints the full quality shadow when asked to", () => {
    const strip = { ...glyphOf(["111111111111", "111111111111", "111111111111"]), caster: glyphOf(["100000000000", "100000000000", "100000000000"]).mask }
    const settings = { angle: 0, distance: 4, blur: 4 }
    const quick = generatedAlpha(strip, "shadow", settings, 3, 16)
    const full = withFinalShadows(() => generatedAlpha(strip, "shadow", settings, 3, 16))
    assert.ok(quick.some((value, index) => Math.abs(value - full[index]) > 0.01))
    assert.deepEqual(generatedAlpha(strip, "shadow", settings, 3, 16), quick)
  })

  test("antialiases a sharp shadow's slanted edges but keeps straight ones crisp", () => {
    const block = { ...glyphOf(["1111", "1111", "1111", "1111"]), caster: glyphOf(["1000", "0000", "0000", "0000"]).mask }
    const slanted = generatedAlpha(block, "shadow", { angle: 30, distance: 3, blur: 0 }, 4, 4)
    assert.ok(slanted.some(value => value > 0 && value < 1))
    const straight = generatedAlpha(block, "shadow", { angle: 0, distance: 2, blur: 0 }, 4, 4)
    assert.ok(straight.every(value => value === 0 || value === 1))
  })

  test("carries on across a touching neighbour without fading at the join", () => {
    const left = { ...glyphOf(["1111", "1111"]), caster: glyphOf(["0011", "0011"]).mask }
    const right = { ...glyphOf(["1111", "1111"], { placedX: 4 }), caster: glyphOf(["0000", "0000"]).mask, previous: left }
    left.next = right
    const sharp = generatedAlpha(right, "shadow", { angle: 0, distance: 2, blur: 0 }, 2, 1)
    assert.deepEqual(Array.from(sharp.subarray(0, 4)), [1, 1, 0, 0])
    const blurred = { angle: 0, distance: 2, blur: 2 }
    const whole = generatedAlpha({ ...glyphOf(["11111111", "11111111"]), caster: glyphOf(["00110000", "00110000"]).mask }, "shadow", blurred, 2, 4)
    const after = generatedAlpha(right, "shadow", blurred, 2, 4)
    for (let row = 0; row < 8; row++) {
      for (let px = 0; px < 16; px++) assert.ok(Math.abs(after[row * 16 + px] - whole[row * 32 + 16 + px]) < 0.05)
    }
    assert.ok(after[2 * 16] > 0.4)
  })

  test("the first layer, with nothing in front of it, gets no shadow", () => {
    assert.ok(generatedAlpha({ ...receiver, caster: null }, "shadow", {}, 4, 1).every(value => value === 0))
  })

  test("blur softens the edge of the shadow", () => {
    const soft = generatedAlpha(receiver, "shadow", { angle: 0, distance: 1, blur: 2 }, 4, 1)
    assert.ok(row(soft, 1)[2] > 0 && row(soft, 1)[2] < 1)
    assert.ok(row(soft, 1)[3] > 0)
  })

  test("is only offered as a layered overlay", () => {
    assert.equal(withGenerated({}).layer_shadow.layered, true)
  })
})
