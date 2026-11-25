import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import { PAGES, SITE } from "#src/site/pages.js"
import { pageAt, pageFiles, shellHtml } from "#src/site/shell.js"

const SHELL = fs.readFileSync("index.html", "utf8")

function count(html, pattern) {
  return Array.from(html.matchAll(pattern)).length
}

function unescaped(text) {
  return text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
}

describe("page shells", () => {
  for (const page of PAGES) {
    const html = shellHtml(SHELL, page)
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"))

    test(`${page.file} has one title${page.hidden ? "" : ", description"} and canonical link`, () => {
      assert.equal(count(html, /<head>/g), 1)
      assert.equal(count(head, /<title>/g), 1)
      assert.equal(count(head, /<meta name="description"/g), page.hidden ? 0 : 1)
      assert.equal(count(head, /<link rel="canonical"/g), 1)
      assert.equal(unescaped(head.match(/<title>([^<]*)<\/title>/)[1]), page.title)
      if (!page.hidden) assert.equal(unescaped(head.match(/<meta name="description" content="([^"]*)">/)[1]), page.description)
      assert.ok(head.match(/<link rel="canonical" href="([^"]*)">/)[1].startsWith(`${SITE}/`))
      assert.ok(html.includes(`<html lang="en" data-styles="${page.styles}">`))
    })

    test(`${page.file} is ${page.hidden ? "kept out of" : "left in"} search results`, () => {
      assert.equal(count(head, /<meta name="robots" content="noindex">/g), page.hidden ? 1 : 0)
    })

    test(`${page.file} has ${page.hidden ? "no" : "its"} share tags`, () => {
      const properties = Array.from(head.matchAll(/<meta property="(og:[a-z_:]+)"/g), match => match[1])
      assert.deepEqual(properties, page.hidden ? [] : ["og:type", "og:site_name", "og:locale", "og:url", "og:title", "og:description", "og:image", "og:image:width", "og:image:height", "og:image:alt"])
      assert.equal(count(head, /<meta name="twitter:card" content="summary_large_image">/g), page.hidden ? 0 : 1)
    })
  }

  test("text in the head is escaped", () => {
    const page = { ...PAGES[0], title: "Blocks & \"Items\" <new>", description: "Fonts & \"textures\"" }
    const html = shellHtml(SHELL, page)
    assert.equal(count(html, /<title>/g), 1)
    assert.equal(unescaped(html.match(/<title>([^<]*)<\/title>/)[1]), page.title)
    assert.equal(unescaped(html.match(/<meta name="description" content="([^"]*)">/)[1]), page.description)
    assert.equal(unescaped(html.match(/<meta property="og:title" content="([^"]*)">/)[1]), page.title)
  })

  test("the homepage, generator and font editor describe themselves as linked structured data", () => {
    const graphs = Object.fromEntries(PAGES.filter(item => item.data).map(page => [page.name, JSON.parse(shellHtml(SHELL, page).match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])["@graph"]]))
    assert.deepEqual(Object.keys(graphs), ["home", "app", "font-editor"])
    assert.deepEqual(graphs.home.map(item => item["@type"]), ["WebSite", "Person", "WebApplication", "WebApplication"])
    assert.deepEqual(graphs.app.map(item => item.url), [`${SITE}/`, "https://ewanhowell.com/", `${SITE}/app/`])
    assert.equal(graphs["font-editor"][2].url, `${SITE}/font-editor/`)
    const ids = new Set(Object.values(graphs).flat().map(item => item["@id"]))
    for (const item of Object.values(graphs).flat()) {
      for (const link of [item.publisher, item.author, item.isPartOf].filter(Boolean)) assert.ok(ids.has(link["@id"]), link["@id"])
    }
  })

  test("every page holds its heading, description and links for crawlers until the app mounts", () => {
    for (const page of PAGES) {
      const body = shellHtml(SHELL, page).match(/<div id="app">(.*?)<\/div>\s*<script/s)[1]
      assert.ok(body.startsWith('<div class="splash"><h1>'), page.name)
      assert.ok(unescaped(body).includes(`<p>${page.description}</p>`), page.name)
      assert.ok(body.includes('<a href="/app/">'), page.name)
    }
  })

  test("a page is found by its address", () => {
    assert.equal(pageAt("/").name, "home")
    assert.equal(pageAt("/app/").name, "app")
    assert.equal(pageAt("/app/presets").name, "app")
    assert.equal(pageAt("/app/presets/12").name, "app")
    assert.equal(pageAt("/font-editor/import").name, "font-editor")
    assert.equal(pageAt("/submissions/4/edit/").name, "submissions")
    assert.equal(pageAt("/terms/").name, "terms")
    assert.equal(pageAt("/nothing/here").name, "not-found")
  })

  test("every page's files are written from the one shell, with nothing else to keep in sync", () => {
    const files = PAGES.flatMap(pageFiles)
    assert.equal(new Set(files).size, files.length)
    assert.ok(files.includes("index.html") && files.includes("404.html"))
    for (const file of files.filter(file => file !== "index.html")) assert.equal(fs.existsSync(file), false, file)
  })

  test("the canonical link of a page with a fixed path is that path", () => {
    for (const page of PAGES.filter(page => !page.paths[0].includes(":"))) {
      assert.ok(shellHtml(SHELL, page).includes(`<link rel="canonical" href="${SITE}${page.paths[0]}">`))
    }
  })
})
