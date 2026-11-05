import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { blend, cssGradient, gradientLine, gradientStops } from "../src/lib/material.js"
import { rgbOf } from "../src/lib/colour.js"

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

function nearPoint(actual, expected) {
  near(actual[0], expected[0])
  near(actual[1], expected[1])
}

describe("blend", () => {
  const colours = ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffcf76", "#da371e", "#336699"]

  test("returns the start colour at 0 and the end colour at 1", () => {
    for (const a of colours) {
      for (const b of colours) {
        assert.equal(blend(a, b, 0), a)
        assert.equal(blend(a, b, 1), b)
      }
    }
  })

  test("leaves a colour blended with itself unchanged", () => {
    for (const colour of colours) assert.equal(blend(colour, colour, 0.5), colour)
  })

  test("keeps grey and follows srgb lightness between black and white", () => {
    const [r, g, b] = rgbOf(blend("#000000", "#ffffff", 0.5))
    assert.ok(Math.abs(r - 127.5) <= 1, `${r}`)
    assert.ok(Math.abs(g - r) <= 1 && Math.abs(b - r) <= 1, `${r} ${g} ${b}`)
  })

  test("goes through purple between red and blue", () => {
    const [r, g, b] = rgbOf(blend("#ff0000", "#0000ff", 0.5))
    assert.ok(r > g && b > g, `${r} ${g} ${b}`)
  })

  test("is symmetric when the ends swap", () => {
    for (const t of [0.1, 0.25, 0.5, 0.8]) {
      const forward = rgbOf(blend("#ffcf76", "#da371e", t))
      const back = rgbOf(blend("#da371e", "#ffcf76", 1 - t))
      for (const channel of [0, 1, 2]) assert.ok(Math.abs(forward[channel] - back[channel]) <= 1, `${t} ${forward} ${back}`)
    }
  })
})

describe("gradientStops", () => {
  const black = { colour: "#000000", position: 0 }
  const white = { colour: "#ffffff", position: 100 }

  test("turns stepped stops into hard bands", () => {
    assert.deepEqual(gradientStops([{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 50 }], false), [{ position: 0, colour: "#000000" }, { position: 0.5, colour: "#000000" }, { position: 0.5, colour: "#ffffff" }, { position: 1, colour: "#ffffff" }])
  })

  test("runs the first band from 0 and the last band to 1", () => {
    const list = gradientStops([{ colour: "#000000", position: 25 }, { colour: "#ffffff", position: 75 }], false)
    assert.deepEqual(list.map(stop => stop.position), [0, 0.75, 0.75, 1])
  })

  test("covers the whole range with one stepped stop", () => {
    assert.deepEqual(gradientStops([{ colour: "#123456", position: 40 }], false), [{ position: 0, colour: "#123456" }, { position: 1, colour: "#123456" }])
  })

  test("sorts stops without touching the input", () => {
    const stops = [white, black]
    assert.deepEqual(gradientStops(stops, false).map(stop => stop.colour), ["#000000", "#000000", "#ffffff", "#ffffff"])
    assert.deepEqual(stops, [white, black])
  })

  test("clamps positions into range", () => {
    const list = gradientStops([{ colour: "#000000", position: -20 }, { colour: "#ffffff", position: 150 }], true)
    assert.equal(list[0].position, 0)
    assert.equal(list[list.length - 1].position, 1)
  })

  test("adds evenly spaced stops when smooth", () => {
    const list = gradientStops([black, white], true)
    assert.equal(list.length, 25)
    assert.deepEqual(list[0], { position: 0, colour: "#000000" })
    assert.deepEqual(list[24], { position: 1, colour: "#ffffff" })
    assert.deepEqual(list[12], { position: 0.5, colour: blend("#000000", "#ffffff", 0.5) })
  })

  test("brightens steadily from black to white when smooth", () => {
    const reds = gradientStops([black, white], true).map(stop => rgbOf(stop.colour)[0])
    for (let i = 1; i < reds.length; i++) assert.ok(reds[i] >= reds[i - 1], `step ${i}: ${reds[i - 1]} to ${reds[i]}`)
    assert.ok(reds[12] > reds[0] && reds[12] < reds[24])
  })

  test("hits every original stop when smooth", () => {
    const list = gradientStops([black, { colour: "#ff0000", position: 25 }, white], true)
    assert.equal(list.length, 49)
    assert.deepEqual(list[24], { position: 0.25, colour: "#ff0000" })
    assert.deepEqual(list[48], { position: 1, colour: "#ffffff" })
  })

  test("stays between the outer stops when smooth", () => {
    const list = gradientStops([{ colour: "#000000", position: 25 }, { colour: "#ffffff", position: 75 }], true)
    assert.equal(list[0].position, 0.25)
    assert.equal(list[list.length - 1].position, 0.75)
  })

  test("keeps a single smooth stop", () => {
    assert.deepEqual(gradientStops([{ colour: "#123456", position: 40 }], true), [{ colour: "#123456", position: 0.4 }])
  })
})

describe("cssGradient", () => {
  test("is a plain colour with one stop", () => {
    assert.equal(cssGradient([{ colour: "#123456", position: 0 }], false, "to right"), "#123456")
    assert.equal(cssGradient([{ colour: "#123456", position: 0 }], true, "to right"), "#123456")
  })

  test("writes stepped stops as percentages", () => {
    assert.equal(cssGradient([{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 50 }], false, "to right"), "linear-gradient(to right, #000000 0%, #000000 50%, #ffffff 50%, #ffffff 100%)")
  })

  test("passes the direction through", () => {
    assert.ok(cssGradient([{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }], false, "225deg").startsWith("linear-gradient(225deg, "))
  })

  test("writes every smooth stop", () => {
    const css = cssGradient([{ colour: "#000000", position: 0 }, { colour: "#ffffff", position: 100 }], true, "to right")
    assert.equal(css.split(", ").length, 26)
    assert.ok(css.startsWith("linear-gradient(to right, #000000 0%, "))
    assert.ok(css.endsWith(", #ffffff 100%)"))
  })
})

describe("gradientLine", () => {
  test("runs top to bottom at 0 degrees", () => {
    const [from, to] = gradientLine(10, 20, 100, 50, 0)
    nearPoint(from, [60, 20])
    nearPoint(to, [60, 70])
  })

  test("runs right to left at 90 degrees", () => {
    const [from, to] = gradientLine(10, 20, 100, 50, 90)
    nearPoint(from, [110, 45])
    nearPoint(to, [10, 45])
  })

  test("runs bottom to top at 180 degrees", () => {
    const [from, to] = gradientLine(0, 0, 100, 50, 180)
    nearPoint(from, [50, 50])
    nearPoint(to, [50, 0])
  })

  test("reaches opposite corners of a square at 45 degrees", () => {
    const [from, to] = gradientLine(0, 0, 100, 100, 45)
    nearPoint(from, [100, 0])
    nearPoint(to, [0, 100])
  })

  test("centres on the box and spans it exactly at any angle", () => {
    for (const angle of [17, 30, 123, 200, 300]) {
      const [from, to] = gradientLine(10, 20, 200, 100, angle)
      nearPoint([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], [110, 70])
      const along = [to[0] - from[0], to[1] - from[1]]
      const length = along[0] ** 2 + along[1] ** 2
      const shares = [[10, 20], [210, 20], [10, 120], [210, 120]].map(([x, y]) => ((x - from[0]) * along[0] + (y - from[1]) * along[1]) / length)
      near(Math.min(...shares), 0)
      near(Math.max(...shares), 1)
    }
  })
})
