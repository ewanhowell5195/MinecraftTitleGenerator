import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { flatLayers } from "../src/lib/flatSheet.js"
import { blankImage, fontScene, fontThumbnails, render } from "../src/lib/fontThumbnails.js"

describe("font thumbnails", () => {
  const cell = { char: "a", width: 2, height: 2, bottom: 0, top: 2, advance: 2, originX: 0, mask: Uint8Array.from([1, 1, 1, 1]), depths: Uint8Array.from([0, 0, 1, 1]) }
  const layers = [1, 0.5]
  const entry = { id: "layered", border: 0 }
  const scene = fontScene(entry, { glyphs: { a: cell }, cells: [cell], capHeight: 2, layers, kerning: {}, depth: 4 }, "a")
  const textures = { textures: { flat: { border: "#000000" } }, overlays: {} }

  function shades(image) {
    const found = new Set()
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3]) found.add(image.data[i])
    return Array.from(found).sort((a, b) => a - b)
  }

  async function drawn() {
    const flat = flatLayers([cell], 2, 4, layers)
    return new Map(await fontThumbnails(entry, scene, textures, () => flat))
  }

  test("the flat thumbnail shades each depth like the flat texture does", async () => {
    assert.deepEqual(shades((await drawn()).get("flat")), [128, 255])
  })

  test("neighbouring characters are joined and overlaps split down the middle, like the renderer", () => {
    const overlapping = fontScene({ ...entry, characterSpacing: -1 }, { glyphs: { a: cell }, cells: [cell], capHeight: 2, layers, kerning: {}, depth: 4 }, "aa")
    const [first, second] = overlapping.placed.map(item => item.glyph)
    assert.equal(second.previous, first)
    assert.equal(first.next, second)
    assert.equal(first.clips.right.get(0), 1.5)
    assert.equal(second.clips.left.get(0), 0.5)
  })

  test("a generated outline follows each depth's own shape", () => {
    const depths = Uint8Array.from([1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1])
    const square = { char: "a", width: 4, height: 4, bottom: 0, top: 4, advance: 4, originX: 0, mask: new Uint8Array(16).fill(1), depths }
    const ringed = fontScene(entry, { glyphs: { a: square }, cells: [square], capHeight: 4, layers, kerning: {}, depth: 4 }, "a")
    const image = render(ringed, blankImage(4, 4), { density: 1, border: [0, 0, 0, 0], width: 4, generated: "outline" })
    const alpha = (x, y) => image.data[(y * image.width + x) * 4 + 3]
    assert.ok(alpha(1, 1) > 0)
    assert.ok(alpha(0, 0) > 0)
  })

  test("each layer's flat thumbnail shows only that layer's shade", async () => {
    const thumbnails = await drawn()
    assert.deepEqual(shades(thumbnails.get("layer-1/flat")), [255])
    assert.deepEqual(shades(thumbnails.get("layer-2/flat")), [128])
  })
})
