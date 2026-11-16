import { describe, test } from "node:test"
import assert from "node:assert/strict"

globalThis.location = { pathname: "/app/", origin: "https://example.test" }

const { addressHasFilters, openLinkInEditor, presetLink, presetsPage, readPresetPath, setPresetSearch, setPresetSort, showOwnPreset, showPreset, showPresetFilters } = await import("../../src/lib/state/presetsPage.js")
const { setNavigator } = await import("../../src/lib/state/navigation.js")

function setAddress(address) {
  const { pathname, search } = new URL(address, "https://example.test")
  Object.assign(location, { pathname, search })
}

const pushed = []
setNavigator({
  push(address) {
    pushed.push(address)
    setAddress(address)
  },
  replace(address) {
    setAddress(address)
  }
})

describe("preset addresses", () => {
  for (const [path, expected] of [
    ["/app/presets", { open: true, id: null }],
    ["/app/presets/", { open: true, id: null }],
    ["/app/presets/12", { open: true, id: 12 }],
    ["/app/presets/12/", { open: true, id: 12 }],
    ["/app/presets/0", { open: true, id: null }],
    ["/app/presets/99999999999999999999", { open: true, id: null }],
    ["/app/presets/abc", { open: false, id: null }],
    ["/app/presets/12/more", { open: false, id: null }],
    ["/app/presetsx", { open: false, id: null }],
    ["/app/", { open: false, id: null }],
    ["/", { open: false, id: null }]
  ]) {
    test(`read ${path}`, () => {
      assert.deepEqual(readPresetPath(path), expected)
    })
  }

  test("links use the current site", () => {
    assert.equal(presetLink(12), "https://example.test/app/presets/12")
  })

  test("an unshared preset keeps its code in the address", () => {
    pushed.length = 0
    showOwnPreset("abc")
    assert.equal(location.search, "?title=abc")
    assert.equal(presetsPage.code, "abc")
    assert.equal(presetsPage.id, null)
    showOwnPreset("def")
    assert.equal(presetsPage.code, "def")
    assert.deepEqual(pushed, ["/app/presets?title=abc"])
  })

  test("a shared preset's address has no code", () => {
    showOwnPreset("abc")
    showPreset(12)
    assert.equal(presetsPage.id, 12)
    assert.equal(presetsPage.code, null)
    assert.equal(location.search, "")
  })

  test("a preset can replace the list address", () => {
    showPreset(null)
    pushed.length = 0
    showPreset(12, { replace: true })
    assert.equal(presetsPage.id, 12)
    assert.deepEqual(pushed, [])
  })

  test("a sort other than the default goes in the address", () => {
    showPreset(null)
    pushed.length = 0
    setPresetSort("top")
    assert.equal(location.search, "?sort=top")
    assert.deepEqual(pushed, [])
    setPresetSort("week")
    assert.equal(location.search, "")
  })

  test("the sort stays in the address while presets open and close", () => {
    showPreset(null)
    setPresetSort("new")
    showPreset(12)
    assert.equal(location.pathname, "/app/presets/12")
    assert.equal(location.search, "?sort=new")
    showOwnPreset("abc")
    assert.equal(new URLSearchParams(location.search).get("sort"), "new")
    assert.equal(presetsPage.code, "abc")
    setPresetSort("week")
  })

  test("a search goes in the address next to the sort and is dropped when cleared", () => {
    showPreset(null)
    pushed.length = 0
    setPresetSort("top")
    setPresetSearch("stone wall")
    assert.deepEqual(Object.fromEntries(new URLSearchParams(location.search)), { sort: "top", search: "stone wall" })
    showPreset(12)
    assert.equal(new URLSearchParams(location.search).get("search"), "stone wall")
    setPresetSearch("")
    setPresetSort("week")
    assert.equal(location.search, "")
    assert.deepEqual(pushed, ["/app/presets/12?sort=top&search=stone+wall"])
    showPreset(null)
  })

  test("hiding the filters drops them from the address and showing them puts them back", () => {
    showPreset(null)
    setPresetSort("top")
    setPresetSearch("stone")
    showPresetFilters(false)
    assert.equal(location.search, "")
    showOwnPreset("abc")
    assert.equal(location.search, "?title=abc")
    assert.deepEqual([presetsPage.sort, presetsPage.search], ["top", "stone"])
    showPreset(null)
    showPresetFilters(true)
    assert.deepEqual(Object.fromEntries(new URLSearchParams(location.search)), { sort: "top", search: "stone" })
    setPresetSearch("")
    setPresetSort("week")
  })

  test("an address with a sort or search counts as filtered", () => {
    assert.equal(addressHasFilters("?sort=new"), true)
    assert.equal(addressHasFilters("?search=stone"), true)
    assert.equal(addressHasFilters("?title=abc"), false)
    assert.equal(addressHasFilters(""), false)
  })

  test("only the known sorts can be chosen", () => {
    showPreset(null)
    setPresetSort("popular")
    assert.equal(presetsPage.sort, "popular")
    assert.throws(() => setPresetSort("best"), /no preset sort called best/)
    setPresetSort("week")
  })

  test("someone else's preset link opens the editor", () => {
    showOwnPreset("abc")
    openLinkInEditor("abc")
    assert.equal(location.pathname, "/app/")
    assert.equal(location.search, "?title=abc")
    assert.equal(presetsPage.open, false)
    assert.equal(presetsPage.code, null)
  })
})
