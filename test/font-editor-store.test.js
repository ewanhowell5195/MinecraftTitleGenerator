import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { beginStroke, canRedo, canUndo, cancelStroke, endStroke, font, glyph, openFont, redo, strokeTo, undo, updateGlyph } from "../src/fontEditor/store.js"
import { createFont, glyphOf, paint, setGlyph } from "../src/lib/fontEditor.js"

function open() {
  openFont(createFont({ height: 4, width: 4, grid: 1 }))
}

function stroke(cells, value = true) {
  beginStroke()
  strokeTo(setGlyph(font.value, "a", paint(glyphOf(font.value, "a"), cells, value)))
}

describe("strokes and undo", () => {
  test("a stroke that draws leaves one undo step", () => {
    open()
    stroke([{ x: 1, row: 1 }])
    strokeTo(setGlyph(font.value, "a", paint(glyph.value, [{ x: 2, row: 1 }], true)))
    endStroke()
    assert.equal(glyph.value.rows[1], "0110")
    undo()
    assert.equal(glyph.value.rows[1], "0000")
    assert.equal(canUndo.value, false)
  })

  test("a stroke that changes nothing leaves no undo step and keeps redo", () => {
    open()
    stroke([{ x: 1, row: 1 }])
    endStroke()
    undo()
    const before = font.value
    stroke([{ x: 3, row: 3 }], false)
    endStroke()
    assert.equal(font.value, before)
    assert.equal(canUndo.value, false)
    assert.equal(canRedo.value, true)
  })

  test("undo and redo wait until the stroke has ended", () => {
    open()
    stroke([{ x: 1, row: 1 }])
    endStroke()
    stroke([{ x: 2, row: 2 }])
    const during = font.value
    undo()
    redo()
    assert.equal(font.value, during)
    endStroke()
    undo()
    assert.deepEqual([glyph.value.rows[1], glyph.value.rows[2]], ["0100", "0000"])
    undo()
    assert.equal(glyph.value.rows[1], "0000")
    redo()
    redo()
    assert.deepEqual([glyph.value.rows[1], glyph.value.rows[2]], ["0100", "0010"])
  })

  test("a cancelled stroke puts the character back and frees undo again", () => {
    open()
    stroke([{ x: 1, row: 1 }])
    endStroke()
    stroke([{ x: 2, row: 2 }])
    cancelStroke()
    assert.equal(glyph.value.rows[2], "0000")
    undo()
    assert.equal(glyph.value.rows[1], "0000")
  })

  test("clearing a blank character or filling what is already filled leaves no undo step", () => {
    open()
    updateGlyph({ ...glyph.value, rows: glyph.value.rows.map(row => "0".repeat(row.length)) })
    assert.equal(canUndo.value, false)
    updateGlyph(paint(glyph.value, [{ x: 0, row: 0 }], true))
    updateGlyph(paint(glyph.value, [{ x: 0, row: 0 }], true))
    undo()
    assert.equal(canUndo.value, false)
    assert.equal(glyph.value.rows[0], "0000")
  })
})
