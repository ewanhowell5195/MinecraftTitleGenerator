import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { quoted, unquoted } from "../../src/server/submissions/quoted.js"

describe("quoted", () => {
  test("leaves plain writing readable", () => {
    assert.equal(quoted("It's broken (again), see \"edition.png\".\n\nThanks!"), "> It's broken (again), see \"edition.png\".\n> \n> Thanks!")
  })

  test("keeps mentions, issues, links, commits and maths in code", () => {
    for (const word of ["@someone", "#12", "owner/repo#12", "GH-12", "https://example.com/#a", "(www.example.com)", "me@example.com", "7fd1a60b", "$x$"]) assert.equal(quoted(`see ${word} ok`), `> see \`${word}\` ok`)
    assert.equal(quoted("a`@b`"), "> `` a`@b` ``")
  })

  test("escapes markdown", () => {
    assert.equal(quoted("**a** _b_ <c> [d] `e` \\f"), "> \\*\\*a\\*\\* \\_b\\_ \\<c\\> \\[d\\] \\`e\\` \\\\f")
    assert.equal(quoted("- a\n+ b\n1. c\n2) d\n---\n===\n5.2 e"), "> \\- a\n> \\+ b\n> 1\\. c\n> 2\\) d\n> \\---\n> \\===\n> 5.2 e")
    assert.equal(quoted("    code"), "> &#32;&#32;&#32;&#32;code")
  })

  test("reads back what was written", () => {
    for (const text of ["", "plain", "  indented\n\n\tlines  ", "```js\n@a\n```", "a``b #c` \\` &#32; &amp;", "`` ` `` @`", "1. 2) - > # | ~ $ & ! ^", "こんにちは :smile:"]) assert.equal(unquoted(quoted(text)), text)
  })
})
