import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { authorList, authorText } from "../src/lib/authors.js"
import { creditProblem } from "../src/lib/submissions.js"

describe("author lists", () => {
  test("a list keeps its names, trimmed and without repeats", () => {
    assert.deepEqual(authorList(["  Ewan  Howell ", "ShrimpSnail", "ewan howell", "", 4]), ["Ewan Howell", "ShrimpSnail"])
    assert.deepEqual(authorList(["Tom & Jerry"]), ["Tom & Jerry"])
    assert.deepEqual(authorList(undefined), [])
  })

  test("an older single line of names is split into its names", () => {
    assert.deepEqual(authorList("ShrimpSnail, Ewan Howell, & MrBrose"), ["ShrimpSnail", "Ewan Howell", "MrBrose"])
    assert.deepEqual(authorList("B1tseK & Ewan Howell"), ["B1tseK", "Ewan Howell"])
    assert.deepEqual(authorList("Ewan Howell"), ["Ewan Howell"])
  })

  test("names are shown joined the way they always were", () => {
    assert.equal(authorText(["one"]), "one")
    assert.equal(authorText(["one", "two"]), "one & two")
    assert.equal(authorText(["one", "two", "three"]), "one, two, & three")
    assert.equal(authorText([]), "")
  })

  test("a submission's credit has to be a short list of names", () => {
    assert.equal(creditProblem(["Someone", "Friend"], "texture"), null)
    assert.equal(creditProblem([], "texture"), "Add who made the texture.")
    assert.equal(creditProblem([], "texture", false), null)
    assert.equal(creditProblem("Someone", "texture"), "The credit has to be a list of names.")
    assert.equal(creditProblem(["Someone", 4], "texture"), "The credit has to be a list of names.")
    assert.match(creditProblem(Array.from({ length: 11 }, (_, index) => `Person ${index}`), "texture"), /up to 10 names/)
    assert.match(creditProblem(["x".repeat(41)], "texture"), /up to 40 characters/)
  })
})
