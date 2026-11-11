import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { createMemoryHistory, createRouter } from "vue-router"
import { PAGES } from "../src/pages.js"
import { pageRoutes, routed } from "../src/site/routes.js"

const HERE = new URL("https://mctitlegenerator.com/credits/?search=oak")
const router = createRouter({ history: createMemoryHistory(), routes: pageRoutes(Object.fromEntries(PAGES.map(page => [page.name, {}]))) })

function link(href, attributes = {}) {
  return { href: new URL(href, HERE).href, target: attributes.target ?? "", hasAttribute: name => name in attributes }
}

function followed(href, attributes) {
  return routed(link(href, attributes), HERE, path => router.resolve(path))
}

describe("page routes", () => {
  test("every path of every page has a route that carries the page", () => {
    const routes = pageRoutes(Object.fromEntries(PAGES.map(page => [page.name, {}])))
    assert.equal(routes.length, PAGES.reduce((sum, page) => sum + page.paths.length, 0))
    assert.equal(new Set(routes.map(route => route.name)).size, routes.length)
    for (const page of PAGES) assert.deepEqual(routes.filter(route => route.meta === page).map(route => route.path), page.paths)
  })

  test("the first path of a page is named after the page", () => {
    for (const page of PAGES) assert.equal(router.resolve({ name: page.name }).meta.name, page.name)
  })
})

describe("routed", () => {
  test("links to pages of the site stay in the app", () => {
    assert.equal(followed("/").meta.name, "home")
    assert.equal(followed("/app/").meta.name, "app")
    assert.equal(followed("/app/presets").meta.name, "app")
    assert.equal(followed("/app/presets/12").meta.name, "app")
    assert.equal(followed("/submissions/7/edit/").meta.name, "submissions")
    assert.equal(followed("/terms/").fullPath, "/terms/")
  })

  test("the search and hash of the link are kept", () => {
    assert.equal(followed("/privacy/#cookies").fullPath, "/privacy/#cookies")
    assert.equal(followed("/credits/?search=id:font.minecraft-ten").query.search, "id:font.minecraft-ten")
  })

  test("a hash on the current page is left to the browser", () => {
    assert.equal(followed("#libraries"), null)
    assert.equal(followed("/credits/?search=oak#libraries"), null)
  })

  test("a hash on the same path with another search stays in the app", () => {
    assert.equal(followed("/credits/#libraries").fullPath, "/credits/#libraries")
  })

  test("a link to the current page without a hash stays in the app", () => {
    assert.equal(followed("/credits/?search=oak").meta.name, "credits")
  })

  test("downloads are left to the browser", () => {
    assert.equal(followed("/terms/", { download: "" }), null)
    assert.equal(followed("/terms/", { download: "terms.html" }), null)
  })

  test("links that open elsewhere are left to the browser", () => {
    assert.equal(followed("/terms/", { target: "_blank" }), null)
    assert.equal(followed("/terms/", { target: "preview" }), null)
    assert.equal(followed("/terms/", { target: "_self" }).meta.name, "terms")
  })

  test("other origins are left to the browser", () => {
    assert.equal(followed("https://ewanhowell.com/"), null)
    assert.equal(followed("http://mctitlegenerator.com/terms/"), null)
    assert.equal(followed("mailto:contact@ewanhowell.com"), null)
  })

  test("paths that are not pages fall through to a real navigation", () => {
    assert.equal(followed("/nothing-here"), null)
    assert.equal(followed("/sitemap.xml"), null)
    assert.equal(followed("/home/og.jpg"), null)
    assert.equal(followed("/app/presets/latest"), null)
    assert.equal(followed("/api/presets/12"), null)
  })
})
