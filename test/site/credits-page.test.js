import assert from "node:assert/strict"
import { test } from "node:test"
import { licensedFontsHtml, sourceHtml } from "../../src/site/credits/build.js"

test("someone else's work links to its source and licence, and says it was adapted", () => {
  assert.equal(sourceHtml({ source: null, licence: null }), "")
  const html = sourceHtml({ source: "https://example.com/font?a=1&b=2", licence: "https://creativecommons.org/licenses/by-sa/3.0/" })
  assert.match(html, /^<span class="source">Adapted for the title generator from <a href="https:\/\/example\.com\/font\?a=1&#38;b=2" target="_blank" rel="noopener">the original<\/a> \(<a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/3\.0\/" target="_blank" rel="noopener">licence<\/a>\)<\/span>$/)
})

test("a licensed font with no name of its own is listed under its id in title case", () => {
  const html = licensedFontsHtml([{ id: "minecraft-ten" }, { id: "minecraft-ten-drip", authors: ["FloideN_"], basedOn: "minecraft-ten", multicase: true, source: "https://example.com/drip", licence: "https://example.com/licence" }])
  assert.match(html, /<a class="name" href="[^"]+">Minecraft Ten Drip<\/a>/)
  assert.match(html, /Based on Minecraft Ten/)
  assert.match(html, /By FloideN_/)
})

test("the licensed fonts tab says so when no font has a licence", () => {
  assert.match(licensedFontsHtml([{ id: "minecraft-ten" }]), /None of the fonts are shared under their own licence right now/)
})
