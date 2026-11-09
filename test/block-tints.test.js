import assert from "node:assert/strict"
import { test } from "node:test"
import { blockTints, grassColormapPixel } from "../src/lib/blockTints.js"

const FILES = {
  "assets/minecraft/items/grass_block.json": { model: { type: "minecraft:model", model: "minecraft:block/grass_block", tints: [{ type: "minecraft:grass", temperature: 0.5, downfall: 1 }] } },
  "assets/minecraft/items/spruce_leaves.json": { model: { type: "minecraft:model", model: "minecraft:block/spruce_leaves", tints: [{ type: "minecraft:constant", value: -10380959 }] } },
  "assets/minecraft/items/fern.json": { model: { type: "minecraft:model", model: "minecraft:item/fern", tints: [{ type: "minecraft:grass", temperature: 0.5, downfall: 1 }] } },
  "assets/minecraft/items/stone.json": { model: { type: "minecraft:model", model: "minecraft:block/stone" } },
  "assets/minecraft/models/block/cube.json": { elements: [{ faces: { up: { texture: "#up", tintindex: 0 }, north: { texture: "#side" } } }] },
  "assets/minecraft/models/block/grass_block.json": { parent: "block/cube", textures: { up: "block/grass_block_top", side: "#base", base: "block/grass_block_side" } },
  "assets/minecraft/models/block/spruce_leaves.json": { parent: "block/cube", textures: { up: "minecraft:block/spruce_leaves", side: "minecraft:block/spruce_leaves" } },
  "assets/minecraft/models/item/fern.json": { textures: { layer0: "minecraft:block/fern" } },
  "assets/minecraft/models/block/stone.json": { parent: "block/cube", textures: { up: "block/stone", side: "block/stone" } }
}

test("tints come from item models, following parents, texture references and generated layers", async () => {
  const sampled = []
  const tints = await blockTints(new Set(Object.keys(FILES)), file => FILES[file], (temperature, downfall) => {
    sampled.push([temperature, downfall])
    return [124, 189, 107]
  })
  assert.deepEqual(Object.fromEntries(tints), { fern: "#7cbd6b", grass_block_top: "#7cbd6b", spruce_leaves: "#619961" })
  assert.deepEqual(sampled[0], [0.5, 1])
})

test("the grass colormap is read where the game reads it", () => {
  assert.deepEqual(grassColormapPixel(0.5, 1), { x: 127, y: 127 })
  assert.deepEqual(grassColormapPixel(2, -1), { x: 0, y: 255 })
})
