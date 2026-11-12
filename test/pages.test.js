import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import { PAGES, SITE } from "../src/pages.js"
import { sitemap, sitemapXml } from "../src/server/sitemap.js"

describe("pages", () => {
  test("every page has its own name and file", () => {
    assert.equal(new Set(PAGES.map(page => page.name)).size, PAGES.length)
    assert.equal(new Set(PAGES.map(page => page.file)).size, PAGES.length)
  })

  test("every page file exists with an empty head to fill", () => {
    for (const page of PAGES) {
      const html = fs.readFileSync(page.file, "utf8")
      assert.ok(html.includes("<html lang=\"en\">"), page.file)
      assert.ok(html.includes("<head></head>"), page.file)
    }
  })

  test("every page has a title, a description, styles and a path", () => {
    for (const page of PAGES) {
      assert.ok(page.title && page.description && page.styles && page.paths.length, page.name)
      assert.ok(page.paths.every(path => path.startsWith("/")), page.name)
    }
  })

  test("the sitemap lists every page that is not hidden, then every shared preset", () => {
    const listed = Array.from(sitemapXml([{ id: 3 }, { id: 18 }]).matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1])
    const expected = PAGES.filter(page => !page.hidden).flatMap(page => page.paths.map(path => `${SITE}${path.replace(/\/:.*$/, "")}`))
    assert.deepEqual(listed, expected.concat(`${SITE}/app/presets/3`, `${SITE}/app/presets/18`))
    assert.ok(sitemapXml([]).startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
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
