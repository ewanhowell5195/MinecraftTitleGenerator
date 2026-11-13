import assert from "node:assert/strict"
import { after, describe, test } from "node:test"
import { blockName, blockTexturePaths, isOpaque, pngSize, usableVersions } from "../src/lib/minecraft.js"
import { dropThumbnail, fitState, keepVersions, modelItems, modelThumbnail, stateList } from "../src/lib/minecraftModels.js"
import { firstTile } from "../src/lib/paint.js"
import { usePlatform } from "../src/lib/platform.js"

describe("blockTexturePaths", () => {
  test("finds the modern block folder", () => {
    assert.deepEqual(Array.from(blockTexturePaths(["assets/minecraft/textures/block/stone.png"])), [["stone", "assets/minecraft/textures/block/stone.png"]])
  })

  test("finds the older blocks folder", () => {
    assert.deepEqual(Array.from(blockTexturePaths(["assets/minecraft/textures/blocks/stone.png"])), [["stone", "assets/minecraft/textures/blocks/stone.png"]])
  })

  test("finds the blocks folder of a version with no assets folder", () => {
    assert.deepEqual(Array.from(blockTexturePaths(["textures/blocks/stone.png"])), [["stone", "textures/blocks/stone.png"]])
  })

  test("skips everything else", () => {
    const paths = ["assets/minecraft/textures/item/stick.png", "assets/minecraft/textures/block/stone.png.mcmeta", "assets/minecraft/textures/block/nested/stone.png", "assets/realms/textures/block/stone.png", "data/minecraft/textures/block/stone.png", "assets/minecraft/models/block/stone.json"]
    assert.equal(blockTexturePaths(paths).size, 0)
  })
})

describe("pngSize", () => {
  test("reads the size from the header", () => {
    const bytes = new Uint8Array(24)
    new DataView(bytes.buffer).setUint32(16, 16)
    new DataView(bytes.buffer).setUint32(20, 320)
    assert.deepEqual(pngSize(bytes), { width: 16, height: 320 })
  })

  test("reads from a view that does not start at the buffer's start", () => {
    const whole = new Uint8Array(34)
    new DataView(whole.buffer).setUint32(26, 32)
    new DataView(whole.buffer).setUint32(30, 64)
    assert.deepEqual(pngSize(whole.subarray(10)), { width: 32, height: 64 })
  })
})

describe("blockName", () => {
  test("splits a number from the word before it", () => {
    assert.equal(blockName("cartography_table_side1"), "Cartography Table Side 1")
  })

  test("splits the camel case of old versions", () => {
    assert.equal(blockName("activatorRail_powered"), "Activator Rail Powered")
  })

  test("keeps a number that is already separate", () => {
    assert.equal(blockName("destroy_stage_0"), "Destroy Stage 0")
  })

  test("leaves a plain name alone", () => {
    assert.equal(blockName("stone"), "Stone")
  })
})

describe("firstTile", () => {
  test("is the character's own start when the origin is there", () => {
    assert.equal(firstTile(40, 40, 32), 40)
  })

  test("starts on the line's tile grid before the character", () => {
    assert.equal(firstTile(40, 0, 32), 32)
  })

  test("works for an origin past the character", () => {
    assert.equal(firstTile(40, 100, 32), 36)
  })
})

describe("isOpaque", () => {
  test("is true when every pixel is solid", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), true)
  })

  test("is false when a pixel is fully clear", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0])), false)
  })

  test("is false when a pixel is partly clear", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([1, 2, 3, 254, 4, 5, 6, 255])), false)
  })

  test("colour values of 0 do not count as clear", () => {
    assert.equal(isOpaque(new Uint8ClampedArray([0, 0, 0, 255])), true)
  })
})

describe("usableVersions", () => {
  test("keeps the versions from when the block folders first appeared", () => {
    const versions = [{ id: "26.3", releaseTime: "2026-09-01T00:00:00+00:00" }, { id: "1.5", releaseTime: "2013-03-13T00:00:00+00:00" }, { id: "1.4.7", releaseTime: "2012-12-28T00:00:00+00:00" }, { id: "b1.8.1", releaseTime: "2011-09-19T00:00:00+00:00" }]
    assert.deepEqual(usableVersions(versions).map(version => version.id), ["26.3", "1.5"])
  })
})

describe("modelItems", () => {
  test("lists the models that are items of their own", () => {
    const models = { stick: { parent: "item/generated", textures: { layer0: "item/stick" } }, apple: { parent: "minecraft:item/generated", textures: { layer0: "item/apple" } }, stone: { parent: "block/stone" }, generated: { parent: "builtin/generated" } }
    assert.deepEqual(modelItems(models), ["stick", "apple", "stone"])
  })

  test("leaves out the models another item switches to", () => {
    const models = { bow: { parent: "item/generated", textures: { layer0: "item/bow" }, overrides: [{ predicate: { pulling: 1 }, model: "item/bow_pulling_0" }] }, bow_pulling_0: { parent: "item/bow", textures: { layer0: "item/bow_pulling_0" } } }
    assert.deepEqual(modelItems(models), ["bow"])
  })

  test("an item that switches to itself is still listed", () => {
    const models = { clock: { parent: "item/generated", textures: { layer0: "item/clock_00" }, overrides: [{ predicate: { time: 0 }, model: "item/clock" }, { predicate: { time: 0.1 }, model: "item/clock_01" }] }, clock_01: { parent: "item/generated", textures: { layer0: "item/clock_01" } } }
    assert.deepEqual(modelItems(models), ["clock"])
  })

  test("leaves out the empty models other items are built from", () => {
    const models = { generated: { parent: "builtin/generated" }, handheld: { parent: "item/generated" }, handheld_rod: { parent: "item/handheld" }, sword: { parent: "item/handheld", textures: { layer0: "item/sword" } }, fishing_rod: { parent: "item/handheld_rod", textures: { layer0: "item/fishing_rod" } }, template_bed: { parent: "builtin/entity" }, red_bed: { parent: "item/template_bed" } }
    assert.deepEqual(modelItems(models), ["sword", "fishing_rod", "red_bed"])
  })

  test("keeps an item other items are built from when it draws something itself", () => {
    const models = { generated: { parent: "builtin/generated" }, bundle: { parent: "item/generated", textures: { layer0: "item/bundle" } }, red_bundle: { parent: "item/bundle", textures: { layer0: "item/red_bundle" } }, chest: { parent: "builtin/entity" }, trapped_chest: { parent: "item/chest" }, copper_bulb: { parent: "block/copper_bulb" }, waxed_copper_bulb: { parent: "item/copper_bulb" } }
    assert.deepEqual(modelItems(models), ["bundle", "red_bundle", "chest", "trapped_chest", "copper_bulb", "waxed_copper_bulb"])
  })
})

describe("modelThumbnail", () => {
  let drawn = []
  let release = null

  function useModels() {
    drawn = []
    const held = new Promise(resolve => (release = resolve))
    async function render({ id }) {
      await held
      drawn.push(id)
      return { toDataURL: () => `picture of ${id}` }
    }
    usePlatform({ minecraftModels: () => Promise.resolve({ lib: { renderBlock: render, renderItem: render }, assets: {}, paths: [] }) })
  }

  after(() => usePlatform({ minecraftModels: null }))

  test("draws the newest request first once the one in hand is done", async () => {
    useModels()
    const asked = ["a", "b", "c", "d"].map(id => modelThumbnail("block", id, "newest"))
    release()
    assert.deepEqual(await Promise.all(asked), ["picture of a", "picture of b", "picture of c", "picture of d"])
    assert.deepEqual(drawn, ["a", "d", "c", "b"])
  })

  test("a dropped request is never drawn, and can be asked for again", async () => {
    useModels()
    const first = modelThumbnail("block", "a", "dropped")
    modelThumbnail("block", "b", "dropped")
    const last = modelThumbnail("item", "c", "dropped")
    dropThumbnail("block", "b", "dropped")
    release()
    await Promise.all([first, last])
    assert.deepEqual(drawn, ["a", "c"])
    assert.equal(await modelThumbnail("block", "b", "dropped"), "picture of b")
  })

  test("a request two tiles wait for survives one of them leaving", async () => {
    useModels()
    const first = modelThumbnail("block", "a", "shared")
    const twice = [modelThumbnail("block", "b", "shared"), modelThumbnail("block", "b", "shared")]
    dropThumbnail("block", "b", "shared")
    release()
    assert.deepEqual(await Promise.all([first].concat(twice)), ["picture of a", "picture of b", "picture of b"])
  })

  test("a picture that is already drawn is handed back without drawing again", async () => {
    useModels()
    release()
    await modelThumbnail("block", "a", "kept")
    dropThumbnail("block", "a", "kept")
    await modelThumbnail("block", "a", "kept")
    assert.deepEqual(drawn, ["a"])
  })

  test("forgets the thumbnails of versions that are no longer in use", async () => {
    useModels()
    release()
    await Promise.all([modelThumbnail("block", "a", "left"), modelThumbnail("block", "a", "kept")])
    keepVersions(new Set(["kept"]))
    drawn = []
    await Promise.all([modelThumbnail("block", "a", "left"), modelThumbnail("block", "a", "kept")])
    assert.deepEqual(drawn, ["a"])
  })
})

describe("block states", () => {
  const preferred = { properties: { half: ["bottom", "lower"], age: [7, 3, 2] }, blocks: [{ match: "*_stairs", defaults: { facing: "south" } }] }
  const base = { properties: { facing: "north", half: "bottom", age: "0", north: "false" }, blocks: [{ match: "oak_fence", defaults: { waterlogged: false } }] }

  test("lists every value the variants use, with the preferred defaults", () => {
    const json = { variants: { "facing=east,half=bottom": {}, "facing=north,half=top": {}, "facing=south,half=top": {} } }
    assert.deepEqual(stateList(json, [preferred, base], "oak_stairs"), [{ name: "facing", values: ["east", "north", "south"], value: "south" }, { name: "half", values: ["bottom", "top"], value: "bottom" }])
  })

  test("reads multipart conditions, fills in booleans and adds waterlogging", () => {
    const json = { multipart: [{ apply: {} }, { when: { north: "true" }, apply: {} }, { when: { OR: [{ age: "1|3" }, { AND: [{ age: "2" }] }] }, apply: {} }] }
    assert.deepEqual(stateList(json, [preferred, base], "oak_fence", true), [{ name: "north", values: ["false", "true"], value: "false" }, { name: "age", values: ["1", "2", "3"], value: "3" }, { name: "waterlogged", values: ["false", "true"], value: "false" }])
  })

  test("adds the game's default when the blockstate never names it", () => {
    const json = { multipart: [{ when: { north: "low" }, apply: {} }, { when: { north: "tall" }, apply: {} }] }
    assert.deepEqual(stateList(json, [{}, { blocks: [{ match: "*_wall", defaults: { north: "none" } }] }], "stone_wall"), [{ name: "north", values: ["low", "tall", "none"], value: "none" }])
  })

  test("leaves out properties with one value", () => {
    assert.deepEqual(stateList({ variants: { "axis=y": {} } }, [], "stone"), [])
  })

  test("keeps the values the new block still has", () => {
    const list = [{ name: "facing", values: ["north", "east"], value: "north" }, { name: "half", values: ["bottom", "top"], value: "bottom" }]
    assert.deepEqual(fitState(list, { facing: "east", half: "upper", lit: "true" }), { facing: "east", half: "bottom" })
    assert.deepEqual(fitState(list, null), { facing: "north", half: "bottom" })
  })
})
