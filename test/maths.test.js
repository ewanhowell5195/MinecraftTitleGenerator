import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { clamp, round } from "../src/lib/maths.js"

describe("clamp", () => {
  test("keeps a value inside the range", () => {
    assert.equal(clamp(0.5, 0, 1), 0.5)
  })

  test("limits a value below the minimum", () => {
    assert.equal(clamp(-3, 0, 1), 0)
  })

  test("limits a value above the maximum", () => {
    assert.equal(clamp(3, 0, 1), 1)
  })

  test("keeps values exactly on either limit", () => {
    assert.equal(clamp(0, 0, 1), 0)
    assert.equal(clamp(1, 0, 1), 1)
  })

  test("works on an entirely negative range", () => {
    assert.equal(clamp(-5, -3, -1), -3)
    assert.equal(clamp(0, -3, -1), -1)
    assert.equal(clamp(-2, -3, -1), -2)
  })

  test("limits infinities from a zero width drag target", () => {
    assert.equal(clamp(Infinity, 0, 1), 1)
    assert.equal(clamp(-Infinity, 0, 1), 0)
  })
})

describe("round", () => {
  test("rounds to the requested places", () => {
    assert.equal(round(1.23456789, 4), 1.2346)
    assert.equal(round(1.23456789, 2), 1.23)
    assert.equal(round(2 / 3, 2), 0.67)
  })

  test("rounds to a whole number with zero places", () => {
    assert.equal(round(1.6, 0), 2)
    assert.equal(round(1.4, 0), 1)
  })

  test("rounds exact halves upward on both sides of zero", () => {
    assert.equal(round(2.5, 0), 3)
    assert.equal(round(-2.5, 0), -2)
    assert.equal(round(0.125, 2), 0.13)
    assert.equal(round(-0.125, 2), -0.12)
  })

  test("removes floating point noise", () => {
    assert.equal(round(0.1 + 0.2, 4), 0.3)
  })

  test("rounds down a value stored just under the half", () => {
    assert.equal(round(1.005, 2), 1)
  })

  test("keeps large values to the requested places", () => {
    assert.equal(round(123456.789, 2), 123456.79)
  })

  test("leaves a value that is already rounded unchanged", () => {
    assert.equal(round(round(1.23456789, 4), 4), 1.2346)
  })
})
