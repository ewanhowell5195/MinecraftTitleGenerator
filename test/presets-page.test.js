import { describe, test } from "node:test"
import assert from "node:assert/strict"

globalThis.location = { pathname: "/app/", origin: "https://example.test" }

const { presetLink, readPresetPath } = await import("../src/lib/presetsPage.js")

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
})
