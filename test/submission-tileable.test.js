import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { pngOf } from "./helpers/png.js"
import { details, editForm, hook, sendForm, serverEnv, signIn } from "./helpers/server.js"
import { publicContext } from "./helpers/site.js"

const { jsonText } = await import("../src/lib/jsonText.js")
const { TILEABLE_SIDES, seeThrough, tileable, tileableImage, tileableSizeProblem } = await import("../src/lib/submissionKinds/tileable.js")
const { tileable: client } = await import("../src/submissions/kinds/tileable.js")

const LIST = "public/tileables/tileables.json"

function png(width, height = width, alpha = 255) {
  return pngOf(width, height, [90, 140, 60, alpha])
}

function published() {
  return JSON.parse(fs.readFileSync(LIST, "utf8"))
}

async function checked(target, bytes) {
  return tileable.check({ target, details: { border: "#000000", size: 99 }, bytes: bytes && new Uint8Array(bytes) }, publicContext())
}

let gh
let restore

function form(fields = {}, image = png(16)) {
  const data = new FormData()
  const values = { kind: "tileable", target: "", name: "Mossy Tiles", credit: "Someone", notes: "", agree: "true", details: "{}", ...fields }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  if (image) data.set("file", new Blob([image], { type: "image/png" }), "tileable.png")
  return data
}

const send = (cookie, fields, image) => sendForm(cookie, form(fields, image))
const edit = (cookie, id, fields, image = null) => editForm(cookie, id, form(fields, image))

function branchFiles(id) {
  return gh.filesAt(`submission/${id}`)
}

function branchText(id) {
  return Buffer.from(gh.blobs.get(branchFiles(id).get(LIST))).toString()
}

describe("tileable checks", () => {
  test("take square tileables from 8x8 to 64x64", async () => {
    for (const side of TILEABLE_SIDES) assert.deepEqual(await checked("", png(side)), { problems: { file: null }, target: "", details: { size: side } })
    assert.match((await checked("", png(16, 32))).problems.file, /have to be square, 8x8, 16x16, 32x32 or 64x64, and this one is 16x32/)
    assert.match((await checked("", png(24))).problems.file, /this one is 24x24/)
    assert.match((await checked("", png(128))).problems.file, /this one is 128x128/)
    assert.match((await checked("", Buffer.from("nope"))).problems.file, /has to be a PNG/)
    assert.match(tileableSizeProblem({ width: 4, height: 4 }), /this one is 4x4/)
  })

  test("take a variant of a published tileable at that tileable's size", async () => {
    assert.deepEqual(await checked("checkerboard", png(8)), { problems: { file: null }, target: "checkerboard", details: { size: 8 } })
    assert.match((await checked("diagonal_up", png(32))).problems.file, /same size as Diagonal Up, 16x16, and this one is 32x32/)
    assert.match((await checked("diagonal_down", png(16))).problems.target, /Pick the tileable/)
    assert.match((await checked("nope", png(16))).problems.target, /Pick the tileable/)
    assert.match((await checked("toString", png(16))).problems.target, /Pick the tileable/)
  })

  test("skip the file when an edit doesn't send one", async () => {
    assert.deepEqual(await checked("checkerboard", null), { problems: {}, target: "checkerboard", details: {} })
  })

  test("find see-through pixels", () => {
    assert.equal(seeThrough(PNG.sync.read(png(8)).data), false)
    assert.equal(seeThrough(PNG.sync.read(png(8, 8, 254)).data), true)
  })

  test("describe the submission for its pages", () => {
    assert.equal(client.summary({ target: "", details: {} }), "A new tileable")
    assert.equal(client.summary({ target: "diagonal_up", details: {} }), "A variant of the Diagonal Up tileable")
    assert.deepEqual(client.rows({ target: "diagonal_up", details: { size: 16 } }), [{ label: "Variant of", value: "Diagonal Up" }, { label: "Size", value: "16x16" }])
    assert.deepEqual(client.line({ target: "", details: {} }, "data:image/png;base64,AA", "Hi"), { text: "Hi", font: "minecraft-ten", textureSource: "custom", customTexture: "data:image/png;base64,AA", customTextureMode: "tileable" })
  })
})

describe("published tileables", () => {
  test("follow the submission rules", () => {
    const list = published()
    for (const [id, data] of Object.entries(list)) {
      const own = PNG.sync.read(fs.readFileSync(path.join("public", tileableImage(list, id))))
      assert.equal(tileableSizeProblem(own), null, id)
      assert.equal(seeThrough(own.data), false, `${id} has see-through pixels`)
      for (const [variantId, variant] of Object.entries(data.variants ?? {})) {
        const image = PNG.sync.read(fs.readFileSync(path.join("public/tileables", variant.path ?? data.path ?? "minecraft", `${variantId}.png`)))
        assert.deepEqual([image.width, image.height], [own.width, own.height], `${variantId} is the size of ${id}`)
        assert.equal(seeThrough(image.data), false, `${variantId} has see-through pixels`)
      }
    }
  })
})

describe("sending a tileable", () => {
  beforeEach(() => {
    ({ gh, restore } = serverEnv({ files: [LIST] }))
  })

  afterEach(() => restore())

  test("opens a pull request with the PNG in the community folder and its tileables.json entry", async () => {
    const cookie = await signIn()
    const { status, id, pull } = await send(cookie, { notes: "seamless" })
    assert.equal(status, 201)
    assert.equal(pull, 1)
    const branch = gh.refs.get(`heads/submission/${id}`)
    assert.deepEqual(gh.commits.get(branch).parents, [gh.main()])
    assert.equal(gh.commits.get(branch).message, "add Mossy Tiles tileable")
    assert.equal(branchText(id), `${jsonText({ ...published(), mossy_tiles: { author: "Someone", path: "community" } })}\n`)
    const image = branchFiles(id).get("public/tileables/community/mossy_tiles.png")
    assert.equal(PNG.sync.read(Buffer.from(gh.blobs.get(image))).width, 16)
    const opened = gh.pulls.get(1)
    assert.equal(opened.title, "Mossy Tiles tileable")
    assert.match(opened.body, /New tileable ` Mossy Tiles `, credited to ` Someone `/)
    assert.match(opened.body, /public\/tileables\/community\/mossy_tiles\.png/)
    assert.match(opened.body, /seamless/)
    const shown = await details(id)
    assert.deepEqual([shown.target, shown.asset, shown.details], ["", "mossy_tiles", { size: 16 }])
  })

  test("adds a variant to its tileable, keeping the PNG in the community folder", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { target: "checkerboard", name: "Red Checkerboard", credit: "Someone & Friend", details: JSON.stringify({ size: 64, border: "#000000" }) }, png(8))
    const main = published()
    const expected = { ...main, checkerboard: { ...main.checkerboard, variants: { red_checkerboard: { author: "Someone & Friend", path: "community" } } } }
    assert.equal(branchText(id), `${jsonText(expected)}\n`)
    assert.ok(branchFiles(id).has("public/tileables/community/red_checkerboard.png"))
    assert.equal(gh.pulls.get(1).title, "Red Checkerboard tileable as a variant of Checkerboard")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "add Red Checkerboard tileable as a variant of Checkerboard")
    assert.deepEqual((await details(id)).details, { size: 8 })
    const second = await send(cookie, { target: "diagonal_up", name: "Diagonal Left" })
    assert.deepEqual(Object.keys(JSON.parse(branchText(second.id)).diagonal_up.variants), ["diagonal_down", "diagonal_left"])
  })

  test("keeps ids clear of every tileable and variant", async () => {
    const cookie = await signIn()
    const top = await send(cookie, { name: "Checkerboard" }, png(8))
    assert.deepEqual(JSON.parse(branchText(top.id)).checkerboard_2, { name: "Checkerboard", author: "Someone", path: "community" })
    const variant = await send(cookie, { name: "Diagonal Down" })
    assert.ok(JSON.parse(branchText(variant.id)).diagonal_down_2)
    assert.ok(branchFiles(variant.id).has("public/tileables/community/diagonal_down_2.png"))
    const again = await send(cookie, { name: "Checkerboard" }, png(8))
    assert.equal((await details(again.id)).asset, "checkerboard_3")
  })

  test("keeps new tileables and variants from claiming the same id", async () => {
    const cookie = await signIn()
    const top = await send(cookie, { name: "Red Check" }, png(8))
    const variant = await send(cookie, { name: "Red Check", target: "checkerboard" }, png(8))
    assert.equal((await details(top.id)).asset, "red_check")
    assert.equal((await details(variant.id)).asset, "red_check_2")
  })

  test("is refused before GitHub hears about it when the tileable is wrong", async () => {
    const cookie = await signIn()
    assert.match((await send(cookie, {}, png(16, 8))).error, /have to be square/)
    assert.match((await send(cookie, {}, png(128))).error, /this one is 128x128/)
    assert.match((await send(cookie, { target: "diagonal_up" }, png(8))).error, /same size as Diagonal Up/)
    assert.match((await send(cookie, { target: "diagonal_down" })).error, /Pick the tileable this is a variant of/)
    assert.match((await send(cookie, {}, null)).error, /Choose the tileable's file/)
    assert.equal(gh.calls.length, 0)
  })

  test("edits keep the size and move the entry", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const { status, submission } = await edit(cookie, id, { name: "Moss" })
    assert.equal(status, 200)
    assert.deepEqual([submission.asset, submission.details], ["moss", { size: 16 }])
    const list = JSON.parse(branchText(id))
    assert.equal(list.mossy_tiles, undefined)
    assert.deepEqual(list.moss, { author: "Someone", path: "community" })
    assert.match((await edit(cookie, id, { target: "checkerboard" })).error, /Choose the tileable's file again/)
    const moved = await edit(cookie, id, { target: "diagonal_up", name: "Moss" }, png(16))
    assert.equal(moved.status, 200)
    assert.ok(JSON.parse(branchText(id)).diagonal_up.variants.moss)
  })

  test("is rebuilt when tileables.json changes on main", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const files = new Map(gh.filesAt("main"))
    files.set(LIST, gh.blob(Buffer.from(`${jsonText({ ...published(), mossy_tiles: { author: "Earlier", path: "patterns" } })}\n`)))
    gh.refs.set("heads/main", gh.commit(files, [gh.main()], "someone else's tileable"))
    await hook("push", { ref: "refs/heads/main", commits: [{ added: [], modified: [LIST], removed: [] }] })
    assert.deepEqual(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).parents, [gh.main()])
    const list = JSON.parse(branchText(id))
    assert.equal(list.mossy_tiles.author, "Earlier")
    assert.deepEqual(list.mossy_tiles_2, { name: "Mossy Tiles", author: "Someone", path: "community" })
  })
})
