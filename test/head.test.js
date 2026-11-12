import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { shareTags, withoutShareTags } from "../src/server/head.js"

function properties(html) {
  return Object.fromEntries(Array.from(html.matchAll(/<meta property="([^"]+)" content="([^"]*)">/g), match => [match[1], match[2]]))
}

describe("share tags", () => {
  const page = { title: "A page", description: "About it", url: "https://example.com/page" }

  test("a page with no image gets a small card", () => {
    const html = shareTags(page)
    assert.deepEqual(Object.keys(properties(html)), ["og:type", "og:site_name", "og:locale", "og:url", "og:title", "og:description"])
    assert.ok(html.endsWith('<meta name="twitter:card" content="summary">'))
  })

  test("an image is described, with its size when that is known", () => {
    const plain = properties(shareTags({ ...page, image: "https://example.com/a.png" }))
    assert.deepEqual([plain["og:image"], plain["og:image:alt"], plain["og:image:width"]], ["https://example.com/a.png", "A page", undefined])
    const sized = properties(shareTags({ ...page, image: "https://example.com/a.png", alt: "A logo", width: 1200, height: 630 }))
    assert.deepEqual([sized["og:image:width"], sized["og:image:height"], sized["og:image:alt"]], ["1200", "630", "A logo"])
    assert.ok(shareTags({ ...page, image: "https://example.com/a.png" }).endsWith('<meta name="twitter:card" content="summary_large_image">'))
  })

  test("text is escaped", () => {
    assert.equal(properties(shareTags({ ...page, title: "Blocks & \"Items\"" }))["og:title"], "Blocks &#38; &#34;Items&#34;")
  })

  test("a page's own share tags can be taken out before others go in", () => {
    const html = `<head><title>x</title>${shareTags({ ...page, image: "https://example.com/a.png" })}<link rel="canonical" href="y"></head>`
    assert.equal(withoutShareTags(html), '<head><title>x</title><link rel="canonical" href="y"></head>')
  })
})
