import { beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fakeTimeouts, forbidFetch, stubStorage } from "../helpers/browser.js"

stubStorage()
forbidFetch()
fakeTimeouts()

const { createObject } = await import("#lib/settings/objects.js")
const { runtime, select } = await import("#lib/state/scene.js")
const { view } = await import("#lib/state/view.js")
const { canPasteSection, copySection, pasteSection } = await import("#src/app/panels/sectionClipboard.js")
const { setScene } = await import("../helpers/scene.js")

const LIST = { textures: { cracked: {}, gold: { variants: { shiny: {} } } }, overlays: { shine: {} }, edgeOverlays: {} }

let from
let to

beforeEach(() => {
  [from, to] = setScene(createObject({ text: "a", hue: 120, saturation: 40, customBorder: true, borderColour: "#123456" }), createObject({ text: "b", row: -1 }))
  for (const object of [from, to]) runtime[object.id] = { list: LIST, font: {} }
  view.shapeTab = "line"
})

describe("copying a tab's settings", () => {
  test("pastes every panel in the tab onto another line", async () => {
    select(from)
    copySection("colour")
    select(to)
    assert.equal(canPasteSection("colour"), true)
    await pasteSection("colour")
    assert.deepEqual([to.hue, to.saturation, to.customBorder, to.borderColour], [120, 40, true, "#123456"])
  })

  test("only pastes into the tab it was copied from", () => {
    select(from)
    copySection("colour")
    select(to)
    assert.equal(canPasteSection("texture"), false)
    assert.equal(canPasteSection("colour"), true)
  })

  test("a texture the other line's font doesn't have can't be pasted", async () => {
    Object.assign(from, { textureSource: "premade", texture: "gold", textureVariant: "shiny" })
    select(from)
    copySection("texture")
    select(to)
    assert.equal(canPasteSection("texture"), true)
    runtime[to.id] = { list: { ...LIST, textures: { gold: {} } }, font: {} }
    assert.equal(canPasteSection("texture"), false)
    runtime[to.id] = { list: LIST, font: {} }
    await pasteSection("texture")
    assert.deepEqual([to.texture, to.textureVariant], ["gold", "shiny"])
  })

  test("custom overlays the other line's font doesn't have can't be pasted", () => {
    Object.assign(from, { overlayMode: "custom", overlays: [{ overlay: "shine", source: "premade" }, { overlay: "mine", source: "file" }] })
    select(from)
    copySection("overlays")
    select(to)
    assert.equal(canPasteSection("overlays"), true)
    runtime[to.id] = { list: { ...LIST, overlays: {} }, font: {} }
    assert.equal(canPasteSection("overlays"), false)
  })

  test("hidden overlay layers stay hidden when pasted", async () => {
    Object.assign(from, { overlayMode: "custom", overlays: [{ overlay: "shine", source: "premade", hidden: true }] })
    select(from)
    copySection("overlays")
    select(to)
    await pasteSection("overlays")
    assert.deepEqual(to.overlays, [{ overlay: "shine", source: "premade", hidden: true }])
  })
})
