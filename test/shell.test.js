import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import { PAGES, SITE } from "../src/pages.js"
import { shellHtml, shellPage } from "../src/site/shell.js"

function count(html, pattern) {
  return Array.from(html.matchAll(pattern)).length
}

function unescaped(text) {
  return text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
}

describe("page shells", () => {
  for (const page of PAGES) {
    const html = shellHtml(fs.readFileSync(page.file, "utf8"), page)
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"))

    test(`${page.file} has one title, description and canonical link`, () => {
      assert.equal(count(html, /<head>/g), 1)
      assert.equal(count(head, /<title>/g), 1)
      assert.equal(count(head, /<meta name="description"/g), 1)
      assert.equal(count(head, /<link rel="canonical"/g), 1)
      assert.equal(unescaped(head.match(/<title>([^<]*)<\/title>/)[1]), page.title)
      assert.equal(unescaped(head.match(/<meta name="description" content="([^"]*)">/)[1]), page.description)
      assert.ok(head.match(/<link rel="canonical" href="([^"]*)">/)[1].startsWith(`${SITE}/`))
      assert.ok(html.includes(`<html lang="en" data-styles="${page.styles}">`))
    })

    test(`${page.file} is ${page.hidden ? "kept out of" : "left in"} search results`, () => {
      assert.equal(count(head, /<meta name="robots" content="noindex">/g), page.hidden ? 1 : 0)
    })

    test(`${page.file} has ${page.share ? "its" : "no"} share tags`, () => {
      const properties = Array.from(head.matchAll(/<meta property="(og:[a-z_]+)"/g), match => match[1])
      assert.deepEqual(properties, page.share ? ["og:type", "og:site_name", "og:url", "og:title", "og:description", "og:image"] : [])
      assert.equal(count(head, /<meta name="twitter:card"/g), page.share ? 1 : 0)
    })
  }

  test("text in the head is escaped", () => {
    const page = { ...PAGES[0], title: "Blocks & \"Items\" <new>", description: "Fonts & \"textures\"" }
    const html = shellHtml(fs.readFileSync(page.file, "utf8"), page)
    assert.equal(count(html, /<title>/g), 1)
    assert.equal(unescaped(html.match(/<title>([^<]*)<\/title>/)[1]), page.title)
    assert.equal(unescaped(html.match(/<meta name="description" content="([^"]*)">/)[1]), page.description)
    assert.equal(unescaped(html.match(/<meta property="og:title" content="([^"]*)">/)[1]), page.title)
  })

  test("a page is found by its file", () => {
    for (const page of PAGES) assert.equal(shellPage(page.file), page)
    assert.equal(shellPage("missing/index.html"), null)
  })

  test("the canonical link of a page with a fixed path is that path", () => {
    for (const page of PAGES.filter(page => !page.paths[0].includes(":"))) {
      assert.ok(shellHtml(fs.readFileSync(page.file, "utf8"), page).includes(`<link rel="canonical" href="${SITE}${page.paths[0]}">`))
    }
  })
})
