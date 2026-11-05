import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { GENERATED_EDGE_OVERLAYS, GENERATED_SETTINGS, PLACED_KINDS, edgeAlpha, generatedAlpha, generatedSetting, withGenerated } from "../src/lib/generated.js"

function glyphOf(rows, extra = {}) {
  const height = rows.length
  const bottom = extra.bottom ?? 0
  return { width: rows[0].length, height, mask: Uint8Array.from(rows.toReversed().join(""), char => Number(char)), bottom, top: bottom + height, placedX: 0, ...extra }
}

function solid(width, height, extra) {
  return glyphOf(new Array(height).fill("1".repeat(width)), extra)
}

function rowsOf(alpha, columns) {
  const rows = []
  for (let at = 0; at < alpha.length; at += columns) rows.push(Array.from(alpha.subarray(at, at + columns)))
  return rows
}

function picture(alpha, columns) {
  return rowsOf(alpha, columns).map(row => row.map(value => value === 1 ? "1" : value === 0 ? "0" : "?").join(""))
}

function columnOf(alpha, columns, index) {
  return rowsOf(alpha, columns).map(row => row[index])
}

function near(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`)
}

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

function runsOf(text) {
  return Array.from(text.matchAll(/0+|1+/g), match => match[0])
}

function columnFill(alpha, columns, index) {
  return columnOf(alpha, columns, index).reduce((sum, value) => sum + value, 0)
}

describe("settings tables", () => {
  test("every fallback sits inside its slider range", () => {
    for (const [kind, settings] of Object.entries(GENERATED_SETTINGS)) {
      for (const item of settings) assert.ok(item.fallback >= item.min && item.fallback <= item.max, `${kind}.${item.key}`)
    }
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

  test("the inverted wave fills the rest", () => {
    assert.deepEqual(picture(generatedAlpha(solid(2, 10), "wave_inverted", { ...flat, level: 50 }, 10, 1), 2), ["00", "00", "00", "00", "00", "11", "11", "11", "11", "11"])
  })

  test("the surface row is antialiased", () => {
    assert.deepEqual(columnOf(generatedAlpha(solid(1, 10), "wave", { ...flat, level: 45 }, 10, 1), 1, 0), [1, 1, 1, 1, 0.5, 0, 0, 0, 0, 0])
    assert.deepEqual(columnOf(generatedAlpha(solid(1, 10), "wave_inverted", { ...flat, level: 45 }, 10, 1), 1, 0), [0, 0, 0, 0, 0.5, 1, 1, 1, 1, 1])
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

  test("leaves empty pixels clear in both kinds", () => {
    const glyph = glyphOf(["101", "010"])
    assert.deepEqual(picture(generatedAlpha(glyph, "wave", { ...flat, level: 100 }, 2, 1), 3), ["101", "010"])
    assert.deepEqual(picture(generatedAlpha(glyph, "wave_inverted", { ...flat, level: 0 }, 2, 1), 3), ["101", "010"])
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
    assert.deepEqual(generatedAlpha(glyph, "wave", { seed: 1 }, 20, 1), generatedAlpha(glyph, "wave", { seed: 1 }, 20, 1))
    assert.notDeepEqual(generatedAlpha(glyph, "wave", { seed: 1 }, 20, 1), generatedAlpha(glyph, "wave", { seed: 2 }, 20, 1))
  })

  test("the surface carries on across neighbouring glyphs", () => {
    assertContinues("wave", {})
    assertContinues("wave_inverted", {})
  })
})

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
