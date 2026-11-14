import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { flatLayers } from "../src/lib/flatSheet.js"
import { blankImage, fontScene, fontThumbnails, render } from "../src/lib/fontThumbnails.js"
import { MISSING } from "../src/lib/strips.js"
import { drawStrip } from "../src/lib/thumbnails.js"

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

  test("a strip starts at the first column its layer uses and shows missing texture where it runs out", () => {
    const glyph = { char: "a", width: 4, height: 2, bottom: 0, top: 2, mask: new Uint8Array(8).fill(1) }
    const strip = { width: 4, height: 1, data: Uint8ClampedArray.from([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255]) }
    const image = blankImage(4, 2)
    drawStrip(image, [{ glyph, x: 0, y: 0, lineX: 0, trim: 1 }], 1, { image: strip, density: 1, top: 1, tiling: "character", shape: { depth: 0, top: 1, bottom: 0, rows: 1 } })
    const red = (x, y) => image.data[(y * image.width + x) * 4]
    assert.deepEqual([0, 1, 2, 3].map(x => red(x, 1)), [40, 10, 20, 30])
    assert.deepEqual([0, 1].map(x => red(x, 0)), [MISSING[0][0], MISSING[1][0]])
  })

  test("each layer's flat thumbnail shows only that layer's shade", async () => {
    const thumbnails = await drawn()
    assert.deepEqual(shades(thumbnails.get("layer-1/flat")), [255])
    assert.deepEqual(shades(thumbnails.get("layer-2/flat")), [128])
  })
})
