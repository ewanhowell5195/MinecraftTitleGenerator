import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { blend } from "../src/lib/blend.js"
import { closeAll } from "./helpers/assert.js"

const near = (actual, expected, tolerance = 1e-9) => closeAll(actual, expected, tolerance)

function lum([r, g, b]) {
  return 0.3 * r + 0.59 * g + 0.11 * b
}

describe("separable modes", () => {
  test("source-over takes the colour", () => {
    near(blend("source-over", [10, 20, 30], [40, 50, 60]), [40, 50, 60])
  })

  test("multiply darkens by the colour", () => {
    near(blend("multiply", [255, 128, 0], [128, 128, 128]), [128, 128 * 128 / 255, 0])
  })

  test("multiply by white changes nothing", () => {
    near(blend("multiply", [12, 34, 56], [255, 255, 255]), [12, 34, 56])
  })

  test("screen lightens by the colour", () => {
    near(blend("screen", [128, 0, 255], [128, 200, 100]), [128 + 128 - 128 * 128 / 255, 200, 255])
  })

  test("overlay multiplies dark bases", () => {
    near(blend("overlay", [64, 0, 64], [128, 128, 0]), [2 * 64 * 128 / 255, 0, 0])
  })

  test("overlay screens light bases", () => {
    near(blend("overlay", [191, 255, 255], [128, 128, 0]), [128 + 127 - 128 * 127 / 255, 255, 255])
  })

  test("lighter adds and clamps at white", () => {
    near(blend("lighter", [200, 100, 0], [100, 100, 0]), [255, 200, 0])
  })

  test("soft-light leaves the base alone with mid grey", () => {
    near(blend("soft-light", [40, 128, 220], [127.5, 127.5, 127.5]), [40, 128, 220])
  })

  test("soft-light squares the base with black", () => {
    near(blend("soft-light", [128, 0, 255], [0, 0, 0]), [128 * 128 / 255, 0, 255])
  })

  test("soft-light with white uses the dark curve below a quarter", () => {
    near(blend("soft-light", [31.875, 31.875, 31.875], [255, 255, 255]), [87.65625, 87.65625, 87.65625])
  })

  test("soft-light with white uses the square root above a quarter", () => {
    near(blend("soft-light", [163.2, 163.2, 163.2], [255, 255, 255]), [204, 204, 204])
  })

  test("difference is the absolute gap", () => {
    near(blend("difference", [200, 10, 30], [50, 60, 30]), [150, 50, 0])
  })
})

describe("non separable modes", () => {
  test("color on grey keeps the base luminance and the colour's hue", () => {
    const result = blend("color", [128, 128, 128], [255, 0, 0])
    near([lum(result)], [128])
    assert.equal(Math.round(result[0]), 255)
    near([result[1]], [result[2]])
    assert.ok(result[1] < 128)
  })

  test("color with a grey source greys the base at its own luminance", () => {
    near(blend("color", [255, 0, 0], [10, 10, 10]), [76.5, 76.5, 76.5])
  })

  test("color clips below zero while keeping luminance", () => {
    near(blend("color", [10, 10, 10], [0, 0, 255]), [0, 0, 10 / 0.11])
  })

  test("hue takes the colour's hue at the base's saturation and luminance", () => {
    near(blend("hue", [200, 100, 100], [0, 255, 0]), [71, 171, 71])
  })

  test("hue leaves a grey base grey", () => {
    near(blend("hue", [100, 100, 100], [255, 0, 0]), [100, 100, 100])
  })

  test("saturation with a grey source removes the base's colour", () => {
    near(blend("saturation", [200, 100, 100], [50, 50, 50]), [130, 130, 130])
  })

  test("saturation takes the colour's saturation at the base's luminance", () => {
    const result = blend("saturation", [200, 100, 100], [255, 0, 0])
    near([lum(result)], [130])
    assert.equal(Math.round(result[0]), 255)
    near([result[1]], [result[2]])
  })

  test("saturation leaves a grey base grey", () => {
    near(blend("saturation", [100, 100, 100], [255, 0, 0]), [100, 100, 100])
  })
})

test("unknown modes throw", () => {
  assert.throws(() => blend("luminosity", [0, 0, 0], [0, 0, 0]), { message: "unknown blend mode luminosity" })
})
