import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { PNG } from "pngjs"
import { MAX_ANCHORS, chosenColours, mapColour, paletteHexes, paletteOf, recolour } from "../src/lib/overlayColours.js"

function pixels(colours, alpha = 255) {
  return Uint8ClampedArray.from(colours.flatMap(rgb => rgb.concat(alpha)))
}

function gradient(stops, count = 600) {
  return pixels(Array.from({ length: count }, (_, x) => {
    const at = x / (count - 1) * (stops.length - 1)
    const stop = Math.min(stops.length - 2, Math.floor(at))
    return [0, 1, 2].map(c => Math.round(stops[stop][c] + (stops[stop + 1][c] - stops[stop][c]) * (at - stop)))
  }))
}

test("a few colours are each their own anchor, most used first, then brightest", () => {
  const data = pixels([[255, 0, 0], [0, 0, 255], [0, 0, 255], [10, 200, 10]])
  assert.deepEqual(paletteHexes(paletteOf(data).anchors), ["#0000ff", "#0ac80a", "#ff0000"])
})

test("colours within a few levels of each other count as one", () => {
  assert.deepEqual(paletteHexes(paletteOf(pixels([[255, 255, 255], [254, 255, 253], [252, 253, 255]])).anchors), ["#ffffff"])
})

test("see-through pixels have no colour, and an empty image is white", () => {
  assert.deepEqual(paletteHexes(paletteOf(pixels([[255, 0, 0]], 0)).anchors), ["#ffffff"])
})

test("a smooth gradient needs only its end colours", () => {
  assert.deepEqual(paletteHexes(paletteOf(gradient([[255, 0, 0], [0, 255, 0]])).anchors).sort(), ["#00ff00", "#ff0000"])
  assert.deepEqual(paletteHexes(paletteOf(gradient([[255, 0, 0], [0, 255, 0], [0, 0, 255]])).anchors).sort(), ["#0000ff", "#00ff00", "#ff0000"])
})

test("an image that needs more than five anchors is complex", () => {
  const { anchors, complex } = paletteOf(gradient([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [0, 0, 0]]))
  assert.equal(complex, true)
  assert.equal(anchors.length, MAX_ANCHORS)
})

test("anchors take their chosen colours exactly and colours between them blend", () => {
  const anchors = [[255, 0, 0], [0, 255, 0]]
  const colours = [[0, 0, 0], [255, 255, 255]]
  assert.deepEqual(mapColour([255, 0, 0], anchors, colours), [0, 0, 0])
  assert.deepEqual(mapColour([0, 255, 0], anchors, colours), [255, 255, 255])
  assert.deepEqual(mapColour([128, 127, 0], anchors, colours).map(Math.round), [127, 127, 127])
})

test("collinear greys keep their own colours", () => {
  const anchors = [[98, 98, 98], [164, 164, 164], [231, 231, 231]]
  assert.deepEqual(mapColour([164, 164, 164], anchors, [[0, 0, 0], [255, 0, 0], [0, 0, 255]]), [255, 0, 0])
})

test("a layer without colours keeps the image's own, and missing colours fall back to the anchors", () => {
  const anchors = [[255, 255, 255], [0, 0, 0]]
  assert.equal(chosenColours({ colours: null }, anchors), null)
  assert.deepEqual(chosenColours({ colours: ["#ff0000"] }, anchors), [[255, 0, 0], [0, 0, 0]])
  const data = pixels([[255, 255, 255], [0, 0, 0]], 128)
  recolour(data, anchors, [[255, 0, 0], [0, 0, 255]])
  assert.deepEqual(Array.from(data), [255, 0, 0, 128, 0, 0, 255, 128])
})

test("every stored overlay palette matches its image, and no overlay is complex", () => {
  for (const base of ["public/font"]) {
    for (const file of fs.readdirSync(base, { recursive: true }).filter(name => name.endsWith("textures.json"))) {
      const folder = path.join(base, path.dirname(file))
      const list = JSON.parse(fs.readFileSync(path.join(base, file), "utf8"))
      for (const [id, definition] of Object.entries(list.overlays ?? {})) {
        const image = path.join(folder, "overlays", `${id}.png`)
        if (!fs.existsSync(image)) continue
        const { anchors, complex } = paletteOf(PNG.sync.read(fs.readFileSync(image)).data)
        assert.equal(complex, false, image)
        assert.deepEqual(definition.palette ?? ["#ffffff"], paletteHexes(anchors), image)
      }
    }
  }
})
