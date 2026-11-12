import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { shareTags, withoutShareTags } from "../src/server/head.js"

function properties(html) {
  return Object.fromEntries(Array.from(html.matchAll(/<meta property="([^"]+)" content="([^"]*)">/g), match => [match[1], match[2]]))
}

function embedOf(html) {
  const json = html.match(/<script id="discord:component-embed" type="application\/json">([^<]*)<\/script>/)?.[1]
  return json ? JSON.parse(json) : null
}

describe("share tags", () => {
  const page = { title: "A page", description: "About it", url: "https://example.com/page" }

  test("a page with no image gets a small card", () => {
    const html = shareTags(page)
    assert.deepEqual(Object.keys(properties(html)), ["og:type", "og:site_name", "og:locale", "og:url", "og:title", "og:description"])
    assert.ok(html.includes('<meta name="twitter:card" content="summary">'))
  })

  test("an image is described, with its size when that is known", () => {
    const plain = properties(shareTags({ ...page, image: "https://example.com/a.png" }))
    assert.deepEqual([plain["og:image"], plain["og:image:alt"], plain["og:image:width"]], ["https://example.com/a.png", "A page", undefined])
    const sized = properties(shareTags({ ...page, image: "https://example.com/a.png", alt: "A logo", width: 1200, height: 630 }))
    assert.deepEqual([sized["og:image:width"], sized["og:image:height"], sized["og:image:alt"]], ["1200", "630", "A logo"])
    assert.ok(shareTags({ ...page, image: "https://example.com/a.png" }).includes('<meta name="twitter:card" content="summary_large_image">'))
  })

  test("Discord gets an orange component embed with the image and an Open button", () => {
    const embed = embedOf(shareTags({ ...page, title: "A page | Minecraft Title Generator", image: "https://example.com/a.png" }))
    assert.equal(embed.component.accent_color, 0xF1822C)
    assert.deepEqual(embed.component.components, [
      { type: 10, content: "## A page\nAbout it" },
      { type: 12, items: [{ media: { url: "https://example.com/a.png" } }] },
      { type: 1, components: [{ type: 2, style: 5, label: "Open", url: "https://example.com/page" }] }
    ])
  })

  test("a rendered title gets a spacer between the description and its picture", () => {
    const components = embedOf(shareTags({ ...page, image: "https://example.com/a.png", spaced: true })).component.components
    assert.deepEqual(components.map(component => component.type), [10, 14, 12, 1])
    assert.deepEqual(components[1], { type: 14, divider: false, spacing: 1 })
  })

  test("the embed escapes markdown in names and stays within Discord's limits", () => {
    assert.equal(embedOf(shareTags({ ...page, title: "[click](https://bad.example) **now**" })).component.components[0].content.split("\n")[0], "## \\[click\\]\\(https://bad.example\\) \\*\\*now\\*\\*")
    const long = `https://example.com/app/?title=${"a".repeat(600)}`
    assert.equal(embedOf(shareTags({ ...page, url: long })).component.components.length, 1)
    assert.ok(!shareTags({ ...page, image: `https://example.com/${"a".repeat(3000)}.png` }).includes("component-embed"))
    assert.ok(embedOf(shareTags({ ...page, title: "</script>" })))
  })

  test("text is escaped", () => {
    assert.equal(properties(shareTags({ ...page, title: "Blocks & \"Items\"" }))["og:title"], "Blocks &#38; &#34;Items&#34;")
  })

  test("a page's own share tags can be taken out before others go in", () => {
    const html = `<head><title>x</title>${shareTags({ ...page, image: "https://example.com/a.png" })}<link rel="canonical" href="y"></head>`
    assert.equal(withoutShareTags(html), '<head><title>x</title><link rel="canonical" href="y"></head>')
  })
})
