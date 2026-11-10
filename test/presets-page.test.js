import { describe, test } from "node:test"
import assert from "node:assert/strict"

globalThis.location = { pathname: "/app/", origin: "https://example.test" }

const { openLinkInEditor, presetLink, presetsPage, readPresetPath, showOwnPreset, showPreset } = await import("../src/lib/presetsPage.js")
const { setNavigator } = await import("../src/lib/navigation.js")

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

  test("someone else's preset link opens the editor", () => {
    showOwnPreset("abc")
    openLinkInEditor("abc")
    assert.equal(location.pathname, "/app/")
    assert.equal(location.search, "?title=abc")
    assert.equal(presetsPage.open, false)
    assert.equal(presetsPage.code, null)
  })
})
