import { afterEach, describe, test } from "node:test"
import assert from "node:assert/strict"

globalThis.location = { pathname: "/app/", search: "", origin: "https://example.test" }

const { addressHasFilters, closePresetsPage, leavePresetsForEditor, openLinkInEditor, presetLink, presetsPage, readPresetPath, setPresetSearch, setPresetSort, showOwnPreset, showPreset, showPresetFilters } = await import("#lib/state/presetsPage.js")
const { sharedLink } = await import("#lib/state/scene.js")
const { navigated, setNavigator } = await import("#lib/state/navigation.js")

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

  test("picking another preset keeps the linked one in the history", () => {
    setAddress("/app/presets/5")
    navigated({ fullPath: "/app/presets/5", path: "/app/presets/5", meta: { name: "app" } }, { fullPath: "/", path: "/", meta: { name: "home" } })
    pushed.length = 0
    showPreset(6)
    showPreset(7)
    showPreset(null)
    assert.deepEqual(pushed, ["/app/presets/6"])
    assert.equal(location.pathname, "/app/presets")
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

describe("the way back to the editor", () => {
  function route(fullPath) {
    return { fullPath, path: new URL(fullPath, "https://example.test").pathname, meta: { name: "app" } }
  }

  const replaced = []
  globalThis.history = { state: { position: 3 }, replaceState: (state, title, url) => replaced.push([state, url.href]) }

  afterEach(() => {
    replaced.length = 0
    Object.assign(sharedLink, { open: false, preset: null })
  })

  test("going back to the editor and forward to the presets again keeps it", () => {
    sharedLink.open = true
    navigated(route("/app/presets"), route("/app/?title=abc"))
    assert.equal(presetsPage.fromEditor, true)
    navigated(route("/app/?title=abc"), route("/app/presets"))
    assert.equal(presetsPage.fromEditor, false)
    navigated(route("/app/presets"), route("/app/?title=abc"))
    assert.equal(presetsPage.fromEditor, true)
    pushed.length = 0
    closePresetsPage()
    assert.deepEqual(pushed, ["/app/?title=abc"])
  })

  test("forgets a link that was edited away", () => {
    navigated(route("/app/presets"), route("/app/?title=abc"))
    pushed.length = 0
    closePresetsPage()
    assert.deepEqual(pushed, ["/app/"])
  })

  test("opening a preset puts it in the editor's address", () => {
    sharedLink.preset = 330
    pushed.length = 0
    leavePresetsForEditor()
    assert.deepEqual(pushed, ["/app/?preset=330"])
    sharedLink.preset = null
    leavePresetsForEditor()
    assert.deepEqual(pushed, ["/app/?preset=330", "/app/"])
  })

  test("going back to an address that isn't the open preset corrects it", () => {
    sharedLink.preset = 331
    navigated(route("/app/?preset=330"), route("/app/presets"))
    assert.deepEqual(replaced, [[{ position: 3, current: "/app/?preset=331" }, "https://example.test/app/?preset=331"]])
    sharedLink.preset = null
    navigated(route("/app/?preset=330"), route("/app/presets"))
    assert.equal(replaced.at(-1)[1], "https://example.test/app/")
  })

  test("landing straight on the presets has none", () => {
    navigated(route("/app/"), route("/app/presets"))
    navigated(route("/app/presets"), { fullPath: "/", path: "/", meta: {} })
    assert.equal(presetsPage.fromEditor, false)
  })
})
