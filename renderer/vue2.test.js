import { after, before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { fileURLToPath } from "node:url"
import { encodeTitle } from "../src/lib/link/linkformat.js"
import { renderTitle } from "./index.js"

const VUE_2 = new URL("../test/helpers/useVue2.js", import.meta.url).href

const TITLES = {
  "several lines": [{ text: "Minecraft", texture: "cracked" }, { text: "edition", type: "bottom", texture: "gradient" }, { text: "small", type: "small" }],
  "several words": [{ words: [{ text: "Two", texture: "fired", hue: 180 }, { text: "Words", texture: "ice", wordRotationZ: 10 }] }],
  "a matched width": [{ text: "Minecraft", texture: "cracked" }, { text: "fits", type: "bottom", matchWidth: 0, twistFan: 30 }],
  "stacked and twisted rows": [{ text: "one", twistRibbon: 40 }, { text: "two", row: 1, arcTop: 40, scaleY: 0.5, twistDoor: 60 }],
  "separate layers": [{ text: "Layers", font: "minecraft-ten-inset", separateColour: true, layerSettings: [{ hue: 120 }, { hue: 240 }] }],
  "a shape": [{ text: "Title" }, { shape: "heart", row: 1 }]
}

function code(lines) {
  return encodeTitle({ version: 1, lines }).code
}

describe("rendering on Vue 2", () => {
  let renderer
  let jobs = 0

  before(() => {
    renderer = fork(fileURLToPath(new URL("index.js", import.meta.url)), { serialization: "advanced", execArgv: ["--import", VUE_2] })
  })

  after(() => renderer.kill())

  function rendered(title) {
    const job = jobs++
    return new Promise((fulfil, reject) => {
      renderer.on("message", function finished(message) {
        if (message.job !== job) return
        renderer.off("message", finished)
        if (message.error) reject(new Error(message.error))
        else fulfil(Buffer.from(message.picture))
      })
      renderer.send({ job, code: title, options: { format: "png" } })
    })
  }

  for (const [name, lines] of Object.entries(TITLES)) {
    test(`draws ${name} exactly as Vue 3 does`, async () => {
      const [theirs, mine] = await Promise.all([rendered(code(lines)), renderTitle(code(lines), { format: "png" })])
      assert.ok(mine.equals(theirs), "the pictures differ")
    })
  }
})
