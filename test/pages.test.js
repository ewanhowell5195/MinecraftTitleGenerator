import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import { PAGES, SITE } from "../src/pages.js"

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

  test("the sitemap lists every page that is not hidden", () => {
    const listed = Array.from(fs.readFileSync("public/sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1])
    const expected = PAGES.filter(page => !page.hidden).flatMap(page => page.paths.map(path => `${SITE}${path.replace(/\/:.*$/, "")}`))
    assert.deepEqual(listed, expected)
  })
})
