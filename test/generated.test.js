import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { GENERATED_EDGE_OVERLAYS, GENERATED_SETTINGS, PLACED_KINDS, crackList, crackTriangle, crackWrap, edgeAlpha, generatedAlpha, generatedSetting, withFinalShadows, withGenerated } from "../src/lib/generated.js"

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
