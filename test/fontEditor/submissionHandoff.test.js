import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import { setNavigator } from "../../src/lib/state/navigation.js"
import { EDITOR_EDIT } from "../../src/lib/submissions/submissions.js"
import { EDITOR_PATH, START_PATH, editingSubmission, font, openingSubmission, submissionError, takeSubmissionFont } from "../../src/fontEditor/store.js"
import { fakeTimeouts, quietStorage } from "../helpers/browser.js"

const moves = []
const session = new Map()

globalThis.sessionStorage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) }
quietStorage()
fakeTimeouts()

setNavigator({
  async push(path) {
    moves.push(["push", path])
  },
  async replace(path) {
    moves.push(["replace", path])
  }
})

function handOff(text) {
  session.set(EDITOR_EDIT, JSON.stringify({ submission: "abc", text }))
}

describe("opening a submission's font", () => {
  beforeEach(() => {
    moves.length = 0
    session.clear()
    font.value = null
    editingSubmission.value = null
  })

  test("it opens in place on the editor page without adding history", async () => {
    handOff(JSON.stringify({ name: "Handed Over", id: "handed_over" }))
    const taking = takeSubmissionFont()
    assert.equal(openingSubmission.value, true)
    await taking
    assert.deepEqual(moves, [["replace", EDITOR_PATH]])
    assert.equal(font.value.name, "Handed Over")
    assert.equal(editingSubmission.value, "abc")
    assert.equal(openingSubmission.value, false)
    assert.equal(submissionError.value, "")
    assert.equal(session.has(EDITOR_EDIT), false)
  })

  test("a font that can't be read goes to the start page in place", async () => {
    handOff("{")
    await takeSubmissionFont()
    assert.match(submissionError.value, /^The submission's font couldn't be opened: that JSON file can't be read/)
    assert.deepEqual(moves, [["replace", START_PATH]])
    assert.equal(openingSubmission.value, false)
  })

  test("nothing happens when no font was handed over", async () => {
    await takeSubmissionFont()
    assert.deepEqual(moves, [])
    assert.equal(openingSubmission.value, false)
  })
})
