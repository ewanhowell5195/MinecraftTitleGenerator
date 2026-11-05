import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { titleCase } from "../src/lib/names.js"

describe("titleCase", () => {
  test("turns underscores into spaces", () => {
    assert.equal(titleCase("dark_oak"), "Dark Oak")
  })

  test("turns hyphens into spaces", () => {
    assert.equal(titleCase("minecraft-five-bold"), "Minecraft Five Bold")
  })

  test("handles both separators in one id", () => {
    assert.equal(titleCase("minecraft-ten_outline"), "Minecraft Ten Outline")
  })

  test("capitalises a single word", () => {
    assert.equal(titleCase("wave"), "Wave")
  })

  test("lowers the rest of each word", () => {
    assert.equal(titleCase("GUI_FONT"), "Gui Font")
    assert.equal(titleCase("mcDonald"), "Mcdonald")
  })

  test("keeps digits in place", () => {
    assert.equal(titleCase("3d_text_2"), "3d Text 2")
  })

  test("keeps an apostrophe inside its word", () => {
    assert.equal(titleCase("don't_stop"), "Don't Stop")
  })

  test("returns an empty string for an empty id", () => {
    assert.equal(titleCase(""), "")
  })

  test("keeps one space per separator", () => {
    assert.equal(titleCase("a__b"), "A  B")
  })
})
