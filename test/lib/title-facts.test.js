import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { LIMITS } from "../../src/lib/core/limits.js"
import { limitProblem, titleFacts } from "../../src/lib/link/titleFacts.js"

describe("limitProblem", () => {
  function words(count, text = "a") {
    return Array.from({ length: count }, () => ({ text }))
  }

  test("allows a title at every limit", () => {
    assert.equal(limitProblem(words(LIMITS.lines)), null)
    assert.equal(limitProblem([{ words: words(LIMITS.words) }]), null)
    assert.equal(limitProblem([{ text: "a".repeat(LIMITS.characters) }]), null)
  })

  test("names the limit a title is over", () => {
    assert.equal(limitProblem(words(LIMITS.lines + 1)), `A shared title can have up to ${LIMITS.lines} lines.`)
    assert.equal(limitProblem([{ words: words(LIMITS.words + 1) }]), `A shared title can have up to ${LIMITS.words} words.`)
    assert.equal(limitProblem([{ text: "a".repeat(LIMITS.characters + 1) }]), `A shared title can have up to ${LIMITS.characters} characters of text.`)
  })

  test("uses the facts it is given", () => {
    const lines = [{ text: "short" }]
    assert.equal(limitProblem(lines, { ...titleFacts(lines), words: LIMITS.words + 1 }), `A shared title can have up to ${LIMITS.words} words.`)
  })
})
