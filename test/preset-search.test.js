import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { parseSearch, searchWithUser } from "../src/lib/presetSearch.js"

describe("parseSearch", () => {
  test("plain text has no user", () => {
    assert.deepEqual(parseSearch("  nether  title "), { user: null, provider: null, text: "nether title" })
  })

  test("finds a user anywhere and lowercases it", () => {
    assert.deepEqual(parseSearch("nether USER:Someone title"), { user: "someone", provider: null, text: "nether title" })
  })

  test("d: means discord and g: means github", () => {
    assert.deepEqual(parseSearch("user:d:someone"), { user: "someone", provider: "discord", text: "" })
    assert.deepEqual(parseSearch("user:g:someone"), { user: "someone", provider: "github", text: "" })
    assert.deepEqual(parseSearch("USER:G:Someone"), { user: "someone", provider: "github", text: "" })
  })

  test("an unknown prefix is part of the name", () => {
    assert.deepEqual(parseSearch("user:x:someone"), { user: "x:someone", provider: null, text: "" })
  })

  test("a name starting with those letters isn't a prefix", () => {
    assert.deepEqual(parseSearch("user:dave"), { user: "dave", provider: null, text: "" })
  })

  test("the last user wins", () => {
    assert.equal(parseSearch("user:one user:g:two").user, "two")
  })

  test("a bare user: is just text", () => {
    assert.deepEqual(parseSearch("user:"), { user: null, provider: null, text: "user:" })
  })

  test("nothing is nothing", () => {
    assert.deepEqual(parseSearch(""), { user: null, provider: null, text: "" })
  })
})

describe("searchWithUser", () => {
  test("becomes the search when it's empty", () => {
    assert.equal(searchWithUser("", "someone", "discord"), "user:d:someone")
  })

  test("adds to an existing search", () => {
    assert.equal(searchWithUser("nether", "someone", "github"), "nether user:g:someone")
  })

  test("replaces another user and keeps the text", () => {
    assert.equal(searchWithUser("nether user:other", "someone", "discord"), "nether user:d:someone")
    assert.equal(searchWithUser("nether user:g:other", "someone", "discord"), "nether user:d:someone")
  })

  test("clicking the same user again changes nothing", () => {
    assert.equal(searchWithUser("nether user:d:someone", "someone", "discord"), "nether user:d:someone")
  })
})
