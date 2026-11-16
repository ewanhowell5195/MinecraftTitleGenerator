import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { shortcutFor } from "../../src/app/shortcuts.js"

const PAGE = { matches: () => false }
const FIELD = { matches: selector => selector.includes("input[type=text]") }

function press(key, options = {}) {
  return { key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target: PAGE, ...options }
}

describe("shortcutFor", () => {
  test("maps the editor shortcuts", () => {
    assert.equal(shortcutFor(press("z")), "undo")
    assert.equal(shortcutFor(press("Z", { shiftKey: true })), "redo")
    assert.equal(shortcutFor(press("y")), "redo")
    assert.equal(shortcutFor(press("s")), "save")
    assert.equal(shortcutFor(press("o", { ctrlKey: false, metaKey: true })), "open")
  })

  test("ignores keys without the modifier or with alt", () => {
    assert.equal(shortcutFor(press("s", { ctrlKey: false })), null)
    assert.equal(shortcutFor(press("z", { altKey: true })), null)
    assert.equal(shortcutFor(press("q")), null)
  })

  test("leaves undo and redo to text fields", () => {
    assert.equal(shortcutFor(press("z", { target: FIELD })), null)
    assert.equal(shortcutFor(press("y", { target: FIELD })), null)
  })

  test("still saves and opens from a text field", () => {
    assert.equal(shortcutFor(press("s", { target: FIELD })), "save")
    assert.equal(shortcutFor(press("o", { target: FIELD })), "open")
  })
})
