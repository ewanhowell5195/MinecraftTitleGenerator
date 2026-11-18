import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import { PAGES, SITE } from "../../src/site/pages.js"
import { sitemap, sitemapXml } from "../../src/server/sitemap.js"

describe("pages", () => {
  test("every page has its own name and file", () => {
    assert.equal(new Set(PAGES.map(page => page.name)).size, PAGES.length)
    assert.equal(new Set(PAGES.map(page => page.file)).size, PAGES.length)
  })

  test("the shell every page is made from has an empty head to fill", () => {
    const html = fs.readFileSync("index.html", "utf8")
    assert.ok(html.includes("<html lang=\"en\">"))
    assert.ok(html.includes("<head></head>"))
  })

  test("every page has a title, a description, styles and a path", () => {
    for (const page of PAGES) {
      assert.ok(page.title && page.description && page.styles && page.paths.length, page.name)
      assert.ok(page.paths.every(path => path.startsWith("/")), page.name)
    }
  })

  test("the sitemap lists the canonical address of every page that is not hidden, then every shared preset", () => {
    const listed = Array.from(sitemapXml([{ id: 3 }, { id: 18 }]).matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1])
    const pages = ["/", "/app/", "/app/presets", "/font-editor/", "/credits/", "/submit/", "/terms/", "/privacy/"].map(path => `${SITE}${path}`)
    assert.deepEqual(listed, pages.concat(`${SITE}/app/presets/3`, `${SITE}/app/presets/18`))
    assert.ok(sitemapXml([]).startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'))
  })

  test("a shared preset with a picture lists it as the image on its page", () => {
    const xml = sitemapXml([{ id: 3, fingerprint: "abc" }, { id: 18, fingerprint: null }])
    assert.ok(xml.includes(`<loc>${SITE}/app/presets/3</loc>\n    <image:image>\n      <image:loc>https://thumbnails.mctitlegenerator.com/p/abc.png</image:loc>\n    </image:image>\n  </url>`))
    assert.ok(xml.includes(`<loc>${SITE}/app/presets/18</loc>\n  </url>`))
    assert.equal(xml.match(/<image:image>/g).length, 1)
  })

  test("the sitemap is served as XML with the shared presets from the database", async () => {
    let asked = null
    const env = { DB: { prepare: query => ({ all: async () => (asked = query, { results: [{ id: 5 }] }) }) } }
    const response = await sitemap({ env, request: new Request(`${SITE}/sitemap.xml`) })
    assert.equal(response.headers.get("Content-Type"), "application/xml; charset=utf-8")
    assert.match(asked, /WHERE shared = 1/)
    assert.ok((await response.text()).includes(`<loc>${SITE}/app/presets/5</loc>`))
  })
})
