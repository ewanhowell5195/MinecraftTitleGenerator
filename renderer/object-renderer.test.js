import { after, describe, test } from "node:test"
import assert from "node:assert/strict"

await import("./index.js")
const { effectScope, reactive, watch } = await import("vue")
const { platform } = await import("../src/lib/core/platform.js")
const { default: ObjectRenderer } = await import("../src/render/ObjectRenderer.js")
const { createTitle, OFFSCREEN_VIEW } = await import("../src/lib/title/title.js")
const { loadLibrary } = await import("../src/lib/link/titleNames.js")
const { loadFont } = await import("../src/lib/font/font.js")
const { fontTextures } = await import("../src/lib/texture/assets.js")
const { sheetFor } = await import("../src/lib/font/fontSheet.js")
const { createObject } = await import("../src/lib/settings/objects.js")

const [fonts, tileables, shapes] = await loadLibrary()
const loadImage = platform.loadImage

after(() => (platform.loadImage = loadImage))

async function warmed(id) {
  const loaded = await loadFont(fonts.find(entry => entry.id === id), fonts)
  await Promise.all([sheetFor(loaded), fontTextures(loaded.sheetFolder, loaded.strips)])
  return loaded
}

function until(read, check) {
  return new Promise((fulfil, reject) => {
    const limit = setTimeout(() => reject(new Error("timed out")), 60000)
    const stop = watch(read, value => {
      if (!check(value)) return
      clearTimeout(limit)
      queueMicrotask(() => stop())
      fulfil(value)
    }, { immediate: true })
  })
}

describe("object renderer", () => {
  test("a font switch while a paint waits on its pictures shows no error", async () => {
    const layered = await warmed("minecraft-ten-inset")
    assert.ok(layered.layers)
    await warmed("minecraft-five")
    const object = reactive(createObject({ font: "minecraft-ten", text: "Title" }))
    const title = createTitle([object], OFFSCREEN_VIEW)
    const scope = effectScope()
    scope.run(() => ObjectRenderer.setup({ object, title, fonts, tileables, shapes }))
    const entry = () => title.runtime[object.id]
    const errors = []
    const stop = watch(() => entry()?.error, error => error && errors.push(error))
    try {
      await until(entry, value => value?.settled && value.built)
      let release = null
      const held = new Promise(fulfil => (release = fulfil))
      let asked = null
      const waiting = new Promise(fulfil => (asked = fulfil))
      platform.loadImage = src => {
        asked()
        return held.then(() => loadImage(src))
      }
      object.font = "minecraft-five"
      await waiting
      assert.equal(entry().font.id, "minecraft-five")
      object.font = "minecraft-ten-inset"
      await until(entry, value => value?.font?.id === "minecraft-ten-inset")
      release()
      await until(entry, value => value?.settled && value.built && value.font.id === "minecraft-ten-inset")
      assert.deepEqual(errors, [])
    } finally {
      stop()
      platform.loadImage = loadImage
      scope.stop()
    }
  })

  test("rebuilds when the text changes and lets go when it is stopped", async () => {
    await warmed("minecraft-ten")
    const object = reactive(createObject({ font: "minecraft-ten", text: "One" }))
    const title = createTitle([object], OFFSCREEN_VIEW)
    const scope = effectScope()
    scope.run(() => ObjectRenderer.setup({ object, title, fonts, tileables, shapes }))
    const entry = () => title.runtime[object.id]
    await until(entry, value => value?.settled && value.built)
    const first = entry().built
    object.text = "Longer"
    await until(entry, value => value?.built && value.built !== first)
    assert.ok(entry().built.line.max[0] > first.line.max[0])
    scope.stop()
    assert.equal(entry(), undefined)
    assert.equal(title.heights[object.id], undefined)
  })

  test("an update text thumbnail lays its edge strips out at the thumbnail's own depth", async () => {
    await warmed("minecraft-ten")
    const object = reactive(createObject({ font: "minecraft-ten", text: "Title", type: "bottom" }))
    const title = createTitle([object], { render: false, eager: true })
    const scope = effectScope()
    scope.run(() => ObjectRenderer.setup({ object, title, fonts, tileables, shapes }))
    try {
      const { built, preview } = await until(() => title.runtime[object.id], value => value?.settled && value.built && value.preview)
      assert.notEqual(preview.built.depth, built.depth)
      for (const page of preview.built.layouts) {
        for (const entry of Object.values(page.glyphs)) {
          assert.equal(entry.upHeight, preview.built.depth)
          assert.equal(entry.downHeight, preview.built.depth)
        }
      }
    } finally {
      scope.stop()
    }
  })
})
