import assert from "node:assert/strict"
import { test } from "node:test"
import { jsonText } from "../../src/lib/core/jsonText.js"

test("objects always expand, however short", () => {
  assert.equal(jsonText({ flat: { border: "#000000" } }), `{\n  "flat": {\n    "border": "#000000"\n  }\n}`)
})

test("lists of plain values and empty objects always stay on one line", () => {
  const pairs = Array.from({ length: 80 }, (_, index) => `p${index}`)
  assert.equal(jsonText({ kerning: { 4: pairs }, variants: { neon: {} }, none: [] }), `{\n  "kerning": {\n    "4": ${JSON.stringify(pairs).replaceAll(",", ", ")}\n  },\n  "variants": {\n    "neon": {}\n  },\n  "none": []\n}`)
})

test("overlay layers and title lines are one line each", () => {
  const text = jsonText({ overlays: [{ overlay: "shine", opacity: 50 }], lines: [{ text: "a", words: [{ opacity: 50 }] }], other: [{ a: 1 }] })
  assert.equal(text, `{\n  "overlays": [\n    { "overlay": "shine", "opacity": 50 }\n  ],\n  "lines": [\n    { "text": "a", "words": [{ "opacity": 50 }] }\n  ],\n  "other": [\n    {\n      "a": 1\n    }\n  ]\n}`)
})

test("strips are one line each, and editor settings sit on one line unless they hold an object", () => {
  const text = jsonText({ strips: [{ id: "minecraft-ten", layer: 1 }, "other"], editor: { width: 40, grid: 2 } })
  assert.equal(text, `{\n  "strips": [\n    { "id": "minecraft-ten", "layer": 1 },\n    "other"\n  ],\n  "editor": { "width": 40, "grid": 2 }\n}`)
  assert.ok(jsonText({ editor: { width: 40, canvas: { a: { above: 1 } } } }).startsWith(`{\n  "editor": {\n    "width": 40,`))
})

test("leaves out undefined values like JSON.stringify", () => {
  assert.equal(jsonText({ a: 1, b: undefined }), `{\n  "a": 1\n}`)
})
