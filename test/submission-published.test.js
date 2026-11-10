import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeTitle } from "../src/lib/linkformat.js"
import { publishedTitle, thumbnailPath } from "../src/lib/submissionKinds/published.js"

const fonts = [{ id: "minecraft-ten", strips: ["minecraft-ten"] }, { id: "block-serif", strips: ["block-serif"] }]

function lineOf(item) {
  const link = publishedTitle({ name: "Shown Name", details: {}, ...item }, fonts)
  return decodeTitle(new URL(link, "https://mctitlegenerator.com").searchParams.get("title")).lines[0]
}

test("published links open each kind of submission in the generator under its name", () => {
  assert.deepEqual(lineOf({ kind: "font", asset: "ten-light" }), { text: "shown name", font: "ten-light" })
  assert.deepEqual(lineOf({ kind: "texture", target: "block-serif", asset: "gold" }), { text: "shown name", font: "block-serif", textureSource: "premade", texture: "gold" })
  assert.equal(lineOf({ kind: "overlay", target: "minecraft-ten", asset: "sparkle" }).overlays[0].overlay, "sparkle")
  assert.deepEqual(lineOf({ kind: "strip", target: "set:block-serif", asset: "bands" }), { text: "shown name", font: "block-serif", textureSource: "premade", texture: "bands" })
  assert.equal(lineOf({ kind: "strip", target: "set:missing", asset: "bands" }).font, "minecraft-ten")
  assert.deepEqual(lineOf({ kind: "tileable", target: "cobblestone", asset: "mossy" }), { text: "shown name", font: "minecraft-ten", textureSource: "tileable", tileableSource: "premade", tileable: "cobblestone", tileableVariant: "mossy" })
})

test("thumbnails point at the image the workflow renders for each kind", () => {
  assert.equal(thumbnailPath({ kind: "font", target: "", asset: "ten-light" }, fonts), "font/ten-light/thumbnails/flat.png")
  assert.equal(thumbnailPath({ kind: "font", target: "minecraft-ten", asset: "ten-greek" }, fonts), "font/minecraft-ten/ten-greek/thumbnails/flat.png")
  assert.equal(thumbnailPath({ kind: "texture", target: "block-serif", asset: "gold" }, fonts), "font/block-serif/thumbnails/gold.png")
  assert.equal(thumbnailPath({ kind: "strip", target: "set:block-serif", asset: "bands", details: {} }, fonts), "font/block-serif/thumbnails/bands.png")
  assert.equal(thumbnailPath({ kind: "tileable", target: "", asset: "mossy" }, fonts), null)
  assert.equal(thumbnailPath({ kind: "texture", target: "block-serif", asset: "" }, fonts), null)
})
