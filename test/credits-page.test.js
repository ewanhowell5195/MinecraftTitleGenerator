import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { creditsHtml, sourceHtml } from "../src/server/credits.js"

test("the credits page builds from the published fonts and textures, splitting shared credits", () => {
  const html = creditsHtml(path.resolve(import.meta.dirname, ".."))
  const people = Array.from(html.matchAll(/<h2>([^<]+)<\/h2><p>/g), match => match[1])
  assert.ok(people.length > 1)
  assert.equal(new Set(people).size, people.length)
  assert.ok(people.every(person => !/[,&]/.test(person)), people.filter(person => /[,&]/.test(person)).join(", "))
})

test("someone else's work links to its source and licence, and says it was adapted", () => {
  assert.equal(sourceHtml({ source: null, licence: null }), "")
  const html = sourceHtml({ source: "https://example.com/font?a=1&b=2", licence: "https://creativecommons.org/licenses/by-sa/3.0/" })
  assert.match(html, /^<span class="source">Adapted for the title generator from <a href="https:\/\/example\.com\/font\?a=1&#38;b=2" target="_blank" rel="noopener">the original<\/a> \(<a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/3\.0\/" target="_blank" rel="noopener">licence<\/a>\)<\/span>$/)
})
