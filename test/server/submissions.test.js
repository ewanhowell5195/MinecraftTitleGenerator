import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { PNG } from "pngjs"
import { pngOf } from "../helpers/png.js"
import { REPO, context, details, editForm, hook, signIn } from "../helpers/server.js"
import { FLAT, LEGENDS, TEXTURES, WIKI, closed, db, edit, form, gh, holdGitHub, restore, send, textureServer, waiting } from "../helpers/submissionServer.js"

const { accountDetails } = await import("../../src/server/accounts.js")
const { createSubmission, listSubmissions, submissionDetails, submissionFile, withdrawSubmission } = await import("../../src/server/submissions/index.js")
const { addComment } = await import("../../src/server/submissions/comments.js")
const { clearNotifications, listNotifications, markNotificationsSeen } = await import("../../src/server/submissions/notifications.js")
const { submissionProcessing } = await import("../../src/server/submissions/review.js")
const { jsonText } = await import("../../src/lib/core/jsonText.js")
const { decodeTitle } = await import("../../src/lib/link/linkformat.js")

const WIKI_FLAT = PNG.sync.read(fs.readFileSync("public/fonts/minecraft-wiki/textures/flat.png"))

function branchList(id, path = TEXTURES) {
  return JSON.parse(gh.filesAt(`submission/${id}`) && Buffer.from(gh.blobs.get(gh.filesAt(`submission/${id}`).get(path))).toString())
}

beforeEach(textureServer)

afterEach(() => restore())

describe("sending a submission", () => {
  test("needs an account", async () => {
    assert.equal((await send(null)).status, 401)
  })

  test("opens a pull request with the texture and its textures.json entry on top of main", async () => {
    const cookie = await signIn()
    const { status, id, pull } = await send(cookie, { notes: "made with love" })
    assert.equal(status, 201)
    assert.equal(pull, 1)
    const branch = gh.refs.get(`heads/submission/${id}`)
    assert.deepEqual(gh.commits.get(branch).parents, [gh.main()])
    assert.equal(gh.commits.get(branch).message, "[CF-Pages-Skip] add Gold Bricks texture to Minecraft Ten")
    const main = JSON.parse(fs.readFileSync(TEXTURES, "utf8"))
    const text = Buffer.from(gh.blobs.get(gh.filesAt(`submission/${id}`).get(TEXTURES))).toString()
    assert.equal(text, `${jsonText({ ...main, textures: { ...main.textures, gold_bricks: { authors: ["Someone"], border: "#3d1f0a" } } })}\n`)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/fonts/minecraft-ten/textures/gold_bricks.png"))
    const opened = gh.pulls.get(1)
    assert.equal(opened.head, `submission/${id}`)
    assert.equal(opened.title, "Gold Bricks texture for Minecraft Ten")
    assert.match(opened.body, new RegExp(`https://mctitlegenerator.com/submissions/${id}`))
    assert.match(opened.body, /made with love/)
    assert.match(opened.body, /` someone ` \(discord\)/)
  })

  test("only a font can be based on someone else's work", async () => {
    const cookie = await signIn()
    const links = { source: "https://example.com/texture", licence: "https://creativecommons.org/licenses/by-sa/3.0/" }
    assert.equal((await send(cookie, { details: JSON.stringify({ border: "#000000", ...links }) })).error, "Only fonts can be based on someone else's work.")
  })

  test("keeps the submitter's text out of mentions and markdown", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { credit: ["@everyone `x`", "Friend"], notes: "@ewan ```\n# heading" })
    const { body } = gh.pulls.get(1)
    assert.match(body, /`` @everyone `x` ``/)
    assert.match(body, /````text\n@ewan ```\n# heading\n````/)
    assert.deepEqual((await details(id)).credit, ["@everyone `x`", "Friend"])
    assert.match(body, /credited to `` @everyone `x` ``, ` Friend `\./)
  })

  test("records the density of bigger textures and names ids that would clash", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { name: "Flat" }, pngOf(FLAT.width * 2, FLAT.height * 2))
    assert.deepEqual(branchList(id).textures.flat_2, { name: "Flat", authors: ["Someone"], density: 2, border: "#3d1f0a" })
    const second = await send(await signIn("github", { id: 9, login: "other" }), { name: "Flat" })
    assert.ok(branchList(second.id).textures.flat_3)
    assert.equal((await details(second.id)).asset, "flat_3")
  })

  test("adds a texture variant under its texture, with its own density when the texture's isn't 1", async () => {
    const cookie = await signIn()
    const main = JSON.parse(fs.readFileSync(TEXTURES, "utf8"))
    const variantOf = id => JSON.stringify({ border: "#3D1F0A", variantOf: id })
    const { status, id } = await send(cookie, { name: "Cracked Gold", details: variantOf("cracked") })
    assert.equal(status, 201)
    const list = branchList(id)
    assert.deepEqual(list.textures.cracked, { ...main.textures.cracked, variants: { ...main.textures.cracked.variants, cracked_gold: { authors: ["Someone"], density: 1, border: "#3d1f0a" } } })
    assert.equal(list.textures.cracked_gold, undefined)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/fonts/minecraft-ten/textures/cracked_gold.png"))
    assert.equal(gh.pulls.get(1).title, "Cracked Gold texture for Minecraft Ten as a variant of Cracked")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "[CF-Pages-Skip] add Cracked Gold texture to Minecraft Ten as a variant of Cracked")
    assert.equal((await details(id)).details.variantOf, "cracked")
    const plain = await send(cookie, { name: "Neon Gold", details: variantOf("neon_glow") })
    assert.deepEqual(branchList(plain.id).textures.neon_glow.variants.neon_gold, { authors: ["Someone"], border: "#3d1f0a" })
    const same = await send(cookie, { name: "Neon Dim", details: JSON.stringify({ border: "#18041A", variantOf: "neon_glow" }) })
    assert.deepEqual(branchList(same.id).textures.neon_glow.variants.neon_dim, { authors: ["Someone"] })
    const black = await send(cookie, { name: "Neon Dark", details: JSON.stringify({ border: "#000000", variantOf: "neon_glow" }) })
    assert.deepEqual(branchList(black.id).textures.neon_glow.variants.neon_dark, { authors: ["Someone"], border: "#000000" })
    assert.match((await send(cookie, { name: "Lost", details: variantOf("cracked_left") })).error, /Pick the texture this is a variant of/)
    const over = await send(cookie, { kind: "overlay", name: "Over", details: variantOf("cracked") }, pngOf(FLAT.width, FLAT.height))
    assert.equal((await details(over.id)).details.variantOf, undefined)
  })

  test("makes a texture the font's primary or secondary only while the font has none", async () => {
    const cookie = await signIn()
    const legends = PNG.sync.read(fs.readFileSync("public/fonts/minecraft-legends/textures/flat.png"))
    const roles = JSON.stringify({ border: "#3D1F0A", primary: true, secondary: true })
    const { status, id } = await send(cookie, { font: "minecraft-legends", details: roles }, pngOf(legends.width, legends.height))
    assert.equal(status, 201)
    const list = JSON.parse(Buffer.from(gh.blobs.get(gh.filesAt(`submission/${id}`).get(LEGENDS))).toString())
    assert.deepEqual([list.primary, list.secondary], ["gold_bricks", "gold_bricks"])
    assert.deepEqual((await details(id)).details, { border: "#3d1f0a", primary: true, secondary: true, density: 1 })
    assert.match((await send(cookie, { details: roles })).error, /already has a primary texture/)
    const variant = await send(cookie, { details: JSON.stringify({ border: "#3D1F0A", variantOf: "cracked", primary: true }) })
    assert.equal((await details(variant.id)).details.primary, undefined)
  })

  test("gives a texture default overlays, storing only what differs from each overlay's defaults", async () => {
    const cookie = await signIn()
    const layered = layers => JSON.stringify({ border: "#3D1F0A", ...layers })
    const { status, id } = await send(cookie, { details: layered({ overlays: [{ overlay: "outline", source: "premade", file: null, blend: "source-over", colours: ["#FF0000"], opacity: 80 }], edgeOverlays: [{ overlay: "edge_outline_fade", opacity: 46 }] }) })
    assert.equal(status, 201)
    const entry = branchList(id).textures.gold_bricks
    assert.deepEqual(entry.overlays, [{ overlay: "outline", colours: ["#ff0000"], opacity: 80 }])
    assert.deepEqual(entry.edgeOverlays, [{ overlay: "edge_outline_fade", opacity: 46 }])
    assert.match((await send(cookie, { details: layered({ overlays: [{ overlay: "nope" }] }) })).error, /default overlays isn't valid/)
    assert.match((await send(cookie, { details: layered({ overlays: [{ overlay: "outline", source: "file", file: "data:x" }] }) })).error, /default overlays isn't valid/)
    assert.match((await send(cookie, { details: layered({ overlays: [{ overlay: "outline", opacity: 101 }] }) })).error, /default overlays isn't valid/)
    assert.match((await send(cookie, { details: layered({ overlays: [] }) })).error, /Add a default overlay/)
    const plain = await send(cookie, { name: "Plain Bricks", details: layered({}) })
    assert.equal(branchList(plain.id).textures[(await details(plain.id)).asset].overlays, undefined)
  })

  test("gives a texture default face colours", async () => {
    const cookie = await signIn()
    const { status, id } = await send(cookie, { details: JSON.stringify({ border: "#3D1F0A", sides: "#575757", inner: "#3F3F3F" }) })
    assert.equal(status, 201)
    const entry = branchList(id).textures.gold_bricks
    assert.equal(entry.sides, "#575757")
    assert.equal(entry.inner, "#3f3f3f")
    assert.equal(entry.faces, undefined)
    assert.match((await send(cookie, { details: JSON.stringify({ border: "#3D1F0A", sides: "red" }) })).error, /hex colours/)
  })

  test("gives each layer of a layered font its own defaults when asked to", async () => {
    const cookie = await signIn()
    const image = pngOf(WIKI_FLAT.width, WIKI_FLAT.height)
    const perLayer = fields => JSON.stringify({ border: "#000000", perLayer: true, ...fields })
    const overlays = [[{ overlay: "two_tone_outline", thickness: 0.5 }], [{ overlay: "extrusion_outline", colours: ["#1a1a1a"] }]]
    const { status, id } = await send(cookie, { font: "minecraft-wiki", details: perLayer({ overlays, sides: ["#575757", null] }) }, image)
    assert.equal(status, 201)
    const entry = branchList(id, WIKI).textures.gold_bricks
    assert.deepEqual(entry.overlays, [[{ overlay: "two_tone_outline", thickness: 0.5 }], [{ overlay: "extrusion_outline", colours: ["#1a1a1a"] }]])
    assert.deepEqual(entry.sides, ["#575757", null])
    assert.match((await send(cookie, { font: "minecraft-wiki", details: perLayer({ overlays: [[{ overlay: "extrusion_outline" }], []] }) }, image)).error, /default overlays isn't valid/)
    assert.match((await send(cookie, { font: "minecraft-wiki", details: perLayer({ sides: ["#575757"] }) }, image)).error, /each of the font's 2 layers/)
    assert.match((await send(cookie, { details: perLayer({ sides: ["#575757", "#242424"] }) })).error, /only has one layer/)
  })

  test("puts overlays in the overlays section and folder, without a border", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { kind: "overlay", name: "Soft Shading", border: "" }, pngOf(FLAT.width * 2, FLAT.height * 2))
    const list = branchList(id)
    assert.deepEqual(list.overlays.soft_shading, { authors: ["Someone"], density: 2, palette: ["#c8c8c8"] })
    assert.equal(list.textures.soft_shading, undefined)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/fonts/minecraft-ten/overlays/soft_shading.png"))
    assert.equal(gh.pulls.get(1).title, "Soft Shading overlay for Minecraft Ten")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "[CF-Pages-Skip] add Soft Shading overlay to Minecraft Ten")
    assert.equal((await details(id)).details.border, undefined)
  })

  test("stores no palette for a white overlay, and refuses one with too many colours", async () => {
    const cookie = await signIn()
    const white = await send(cookie, { kind: "overlay", name: "Soft Glow", border: "" }, pngOf(FLAT.width, FLAT.height, [255, 255, 255, 120]))
    assert.equal(branchList(white.id).overlays.soft_glow.palette, undefined)
    const busy = await send(cookie, { kind: "overlay", name: "Busy", border: "" }, pngOf(FLAT.width, FLAT.height, (x, y) => [x * 7 % 256, y * 13 % 256, x * y % 256, 255]))
    assert.match(busy.error, /too many colours/)
  })

  test("keeps ids clear of textures, overlays and generated overlays, which share the thumbnails folder", async () => {
    const cookie = await signIn()
    const overlay = await send(cookie, { kind: "overlay", name: "Outline" })
    assert.ok(branchList(overlay.id).overlays.outline_2)
    const texture = await send(cookie, { name: "Bevel" })
    assert.deepEqual(branchList(texture.id).textures.bevel_2, { name: "Bevel", authors: ["Someone"], border: "#3d1f0a" })
  })

  test("is refused before GitHub hears about it when the image or fields are wrong", async () => {
    assert.match((await send(await signIn(), { kind: "nope" })).error, /Pick what you're submitting/)
    const cookie = await signIn()
    assert.match((await send(cookie, {}, pngOf(100, 100))).error, new RegExp(`template size, ${FLAT.width}x${FLAT.height}`))
    assert.match((await send(cookie, {}, pngOf(4560, 3552))).error, /up to 4096 pixels/)
    assert.match((await send(cookie, { name: "fuck" })).error, /isn't allowed/)
    assert.match((await send(cookie, { agree: "false" })).error, /Agree/)
    assert.match((await send(cookie, { font: "nope" })).error, /Pick the font/)
    assert.match((await send(cookie, {}, null)).error, /Choose the texture's file/)
    assert.equal(gh.calls.length, 0)
  })

  test("goes to the font that owns the textures when a variant is picked", async () => {
    const fonts = JSON.parse(fs.readFileSync("public/fonts/fonts.json", "utf8"))
    const inherited = fonts.flatMap(font => (font.variants ?? []).filter(variant => variant.inherits).map(variant => ({ variant, owner: font })))[0]
    const flat = PNG.sync.read(fs.readFileSync(`public/fonts/${inherited.owner.id}/textures/flat.png`))
    const { id } = await send(await signIn(), { font: inherited.variant.id }, pngOf(flat.width, flat.height))
    assert.equal((await details(id)).target, inherited.owner.id)
  })

  test("is limited per day", async () => {
    const cookie = await signIn()
    for (let index = 0; index < 10; index++) assert.equal((await send(cookie, { name: `Texture ${index}` })).status, 201)
    assert.equal((await send(cookie, { name: "One more" })).status, 429)
  })

  test("is limited per day even when each one is withdrawn", async () => {
    const cookie = await signIn()
    for (let index = 0; index < 10; index++) {
      const { status, id } = await send(cookie, { name: `Texture ${index}` })
      assert.equal(status, 201)
      assert.equal((await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } }))).status, 200)
    }
    assert.equal((await send(cookie, { name: "One more" })).status, 429)
    assert.equal(gh.pulls.size, 10)
  })

  test("sent at once can't go past the daily limit", async () => {
    const cookie = await signIn()
    const sent = await Promise.all(Array.from({ length: 12 }, (_, index) => send(cookie, { name: `Texture ${index}` })))
    assert.equal(sent.filter(item => item.status === 201).length, 10)
    assert.equal(sent.filter(item => item.status === 429).length, 2)
  })

  test("is undone when GitHub won't open the pull request", async () => {
    const cookie = await signIn()
    gh.failing.add("POST /repos/owner/repo/pulls")
    const { status, error } = await send(cookie)
    assert.equal(status, 502)
    assert.match(error, /GitHub isn't taking submissions/)
    assert.deepEqual(await (await listSubmissions(context("/api/submissions", { cookie }))).json(), { submissions: [] })
    assert.equal(gh.refs.has("heads/submission/1"), false)
    assert.equal(db.prepare("SELECT count FROM account_submissions").get().count, 0)
  })

  test("is refused when it says it is bigger than a submission can be", async () => {
    const cookie = await signIn()
    const response = await createSubmission(context("/api/submissions", { method: "POST", body: form(), cookie, headers: { "Content-Length": "12020001" } }))
    assert.equal(response.status, 413)
    assert.equal(gh.calls.length, 0)
  })
})

describe("a sent submission", () => {
  test("can be seen by anyone, but only changed by the person who sent it", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const shown = await details(id)
    assert.equal(shown.mine, false)
    assert.equal(shown.pullUrl, `https://github.com/${REPO}/pull/1`)
    assert.equal(shown.previewUrl, `https://submission-${id}.minecrafttitlegenerator.pages.dev`)
    assert.equal(shown.owner, undefined)
    assert.equal((await details(id, cookie)).mine, true)
    const other = await signIn("github", { id: 9, login: "other" })
    assert.equal((await edit(other, id, { name: "Mine Now" })).status, 404)
    const image = await submissionFile(context(`/api/submissions/${id}/file?v=${shown.file}`, { params: { id: String(id) } }))
    assert.equal(image.headers.get("Content-Type"), "image/png")
    assert.match(image.headers.get("Cache-Control"), /immutable/)
    assert.deepEqual(PNG.sync.read(Buffer.from(await image.arrayBuffer())).width, FLAT.width)
  })

  test("edits rewrite the branch and the pull request", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const { status, submission } = await edit(cookie, id, { name: "Shiny Gold", border: "#000000" })
    assert.equal(status, 200)
    assert.equal(submission.asset, "shiny_gold")
    const list = branchList(id)
    assert.equal(list.textures.gold_bricks, undefined)
    assert.deepEqual(list.textures.shiny_gold, { authors: ["Someone"] })
    assert.ok(gh.filesAt(`submission/${id}`).has("public/fonts/minecraft-ten/textures/shiny_gold.png"))
    assert.equal(gh.filesAt(`submission/${id}`).has("public/fonts/minecraft-ten/textures/gold_bricks.png"), false)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
    assert.equal(gh.pulls.size, 1)
  })

  test("a save from a page opened before someone else's save is refused and changes nothing", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const opened = String(db.prepare("SELECT updated_at FROM submissions WHERE id = ?").get(id).updated_at)
    assert.equal((await edit(cookie, id, { name: "Shiny Gold" })).status, 200)
    const head = gh.refs.get(`heads/submission/${id}`)
    const stale = form({ name: "Dull Gold" }, null)
    stale.set("revision", opened)
    const { status, error } = await editForm(cookie, id, stale)
    assert.equal(status, 409)
    assert.match(error, /changed after you opened it/)
    assert.equal(gh.refs.get(`heads/submission/${id}`), head)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
  })

  test("two saves of the same version at once only let one through", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const pushes = () => gh.calls.filter(call => call.method === "POST" && call.route.endsWith("/git/commits")).length
    const before = pushes()
    const handle = gh.handle
    let held = 0
    let release
    const gate = new Promise(resolve => (release = resolve))
    gh.handle = async (url, options = {}) => {
      if (options.method === "POST" && url.endsWith("/git/commits") && ++held === 2) release()
      if (options.method === "POST" && url.endsWith("/git/commits")) await gate
      return handle(url, options)
    }
    const saves = await Promise.all([edit(cookie, id, { name: "Shiny Gold" }), edit(cookie, id, { name: "Dull Gold" })].map(save => save.finally(release)))
    assert.deepEqual(saves.map(save => save.status).sort(), [200, 409])
    assert.match(saves.find(save => save.status === 409).error, /changed after you opened it/)
    const winner = saves.find(save => save.status === 200).submission
    assert.equal(pushes(), before + 1)
    assert.equal(gh.pulls.get(1).title, `${winner.name} texture for Minecraft Ten`)
    assert.equal(db.prepare("SELECT updated_at FROM submissions WHERE id = ?").get(id).updated_at, winner.updatedAt)
  })

  test("a save that GitHub refuses can be tried again from the same page", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const opened = String(db.prepare("SELECT updated_at FROM submissions WHERE id = ?").get(id).updated_at)
    gh.failing.add("POST /repos/owner/repo/git/commits")
    const broken = form({ name: "Shiny Gold" }, null)
    broken.set("revision", opened)
    assert.equal((await editForm(cookie, id, broken)).status, 502)
    gh.failing.clear()
    const retry = form({ name: "Shiny Gold" }, null)
    retry.set("revision", opened)
    assert.equal((await editForm(cookie, id, retry)).status, 200)
  })

  test("saving without changing anything leaves the branch, pull request and notifications alone", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const head = gh.refs.get(`heads/submission/${id}`)
    const comments = gh.comments.length
    const notes = () => db.prepare("SELECT COUNT(*) AS total FROM notifications").get().total
    const before = notes()
    const same = await edit(cookie, id, {})
    assert.equal(same.status, 200)
    assert.equal(same.submission.name, "Gold Bricks")
    assert.equal(gh.refs.get(`heads/submission/${id}`), head)
    assert.equal(gh.comments.length, comments)
    assert.equal(notes(), before)
    const again = await edit(cookie, id, {}, pngOf(FLAT.width, FLAT.height))
    assert.equal(gh.refs.get(`heads/submission/${id}`), head)
    assert.equal(again.status, 200)
    await edit(cookie, id, { name: "Shiny Gold" })
    assert.notEqual(gh.refs.get(`heads/submission/${id}`), head)
  })

  test("needs the image again to move to another font", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.match((await edit(cookie, id, { font: "minecraft-five" })).error, /Choose the texture's file again/)
  })

  test("reports processing until the workflow has run on the branch", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const processing = async () => (await (await submissionProcessing(context(`/api/submissions/${id}/processing`, { params: { id: String(id) } }))).json())
    const head = () => gh.refs.get(`heads/submission/${id}`)
    assert.deepEqual(await processing(), { state: "processing" })
    gh.runs.push({ head_sha: head(), status: "in_progress", conclusion: null, html_url: "https://github.com/run/1" })
    assert.deepEqual(await processing(), { state: "processing" })
    Object.assign(gh.runs[0], { status: "completed", conclusion: "failure" })
    assert.deepEqual(await processing(), { state: "failed", url: "https://github.com/run/1" })
    gh.runs[0].conclusion = "success"
    assert.deepEqual(await processing(), { state: "done" })
    gh.refs.set(`heads/submission/${id}`, gh.commit(gh.filesAt(`submission/${id}`), [head()], "add thumbnails and compress textures"))
    assert.deepEqual(await processing(), { state: "done" })
  })

  describe("at the edge", () => {
    let entries

    beforeEach(() => {
      entries = new Map()
      globalThis.caches = { default: { match: async request => entries.get(request.url)?.clone(), put: async (request, response) => { entries.set(request.url, response) }, delete: async request => entries.delete(request.url) } }
    })

    afterEach(() => {
      delete globalThis.caches
    })

    async function calls(work) {
      const before = gh.calls.length
      const result = await work()
      await Promise.all(waiting)
      return { result, made: gh.calls.length - before }
    }

    async function shownTo(id, cookie) {
      return (await submissionDetails(context(`/api/submissions/${id}?${Math.random()}`, { cookie, params: { id: String(id) } }))).json()
    }

    test("keeps the thread for everyone, without anyone's own details", async () => {
      db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '77', 'ewan', 0, 1)").run()
      const reviewer = await signIn("github", { id: 77, login: "ewan" })
      const cookie = await signIn()
      const { id } = await send(cookie)
      const first = await calls(() => shownTo(id, cookie))
      assert.equal(first.made, 2)
      assert.deepEqual([first.result.submission.mine, first.result.reviewer], [true, false])
      const second = await calls(() => shownTo(id, reviewer))
      assert.equal(second.made, 0)
      assert.deepEqual([second.result.submission.mine, second.result.reviewer], [false, true])
      const third = await calls(() => shownTo(id))
      assert.equal(third.made, 0)
      assert.deepEqual([third.result.submission.mine, third.result.reviewer, third.result.comments], [false, false, []])
      assert.deepEqual(Array.from(entries.keys()), [`https://mctitlegenerator.com/api/submissions/${id}/thread?pull=1`])
      assert.equal(await entries.get(`https://mctitlegenerator.com/api/submissions/${id}/thread?pull=1`).clone().text(), "[]")
    })

    test("shows a new comment or edit straight away", async () => {
      const cookie = await signIn()
      const { id } = await send(cookie)
      await calls(() => shownTo(id))
      await addComment(context(`/api/submissions/${id}/comments`, { method: "POST", body: JSON.stringify({ body: "hello" }), cookie, params: { id: String(id) } }))
      assert.deepEqual((await shownTo(id)).comments.map(item => item.body), ["hello"])
      await Promise.all(waiting)
      await edit(cookie, id, { name: "Shiny Gold" })
      assert.deepEqual((await shownTo(id)).comments.map(item => item.kind), ["comment", "edit"])
    })

    test("doesn't keep a thread GitHub couldn't give", async () => {
      const cookie = await signIn()
      const { id } = await send(cookie)
      gh.failing.add("GET /repos/owner/repo/issues/1/comments?per_page=100&page=1")
      assert.equal((await calls(() => shownTo(id))).result.comments, null)
      assert.equal(entries.size, 0)
    })

    test("asks GitHub about processing once for everyone", async () => {
      const cookie = await signIn()
      const { id } = await send(cookie)
      const processing = () => submissionProcessing(context(`/api/submissions/${id}/processing?${Math.random()}`, { params: { id: String(id) } }))
      const first = await calls(processing)
      assert.ok(first.made > 0)
      assert.equal(first.result.headers.get("Cache-Control"), "no-store")
      const second = await calls(processing)
      assert.equal(second.made, 0)
      assert.deepEqual(await second.result.json(), { state: "processing" })
    })

    test("reads each file from GitHub once, whatever the address says", async () => {
      const cookie = await signIn()
      const { id } = await send(cookie)
      const { file } = await details(id)
      const read = query => submissionFile(context(`/api/submissions/${id}/file${query}`, { params: { id: String(id) } }))
      const first = await calls(() => read(""))
      assert.equal(first.made, 1)
      assert.equal(first.result.headers.get("Cache-Control"), "no-store")
      const second = await calls(() => read(`?v=${file}`))
      assert.equal(second.made, 0)
      assert.equal(second.result.headers.get("Cache-Control"), "public, max-age=31536000, immutable")
      assert.equal(second.result.headers.get("Content-Type"), "image/png")
      assert.equal(PNG.sync.read(Buffer.from(await second.result.arrayBuffer())).width, FLAT.width)
      assert.equal((await calls(() => read("?v=other&x=1"))).made, 0)
    })
  })

  test("can be withdrawn, which closes the pull request but keeps its branch, and the site forgets it", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const response = await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } }))
    assert.equal(response.status, 200)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.ok(gh.refs.has(`heads/submission/${id}`))
    assert.match(gh.comments[0].body, /Reopen this pull request to accept it anyway/)
    assert.equal(await details(id), undefined)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM withdrawn_pulls").get().count, 1)
    await hook("pull_request", closed(1, true, id))
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM withdrawn_pulls").get().count, 0)
    assert.deepEqual((await (await listNotifications(context("/api/notifications", { cookie }))).json()).notifications, [])
    assert.equal((await edit(cookie, id, { name: "Again" })).status, 404)
  })

  test("isn't withdrawn when it is reviewed while being withdrawn", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const sending = context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } })
    const prepare = sending.env.DB.prepare
    sending.env = { ...sending.env, DB: { ...sending.env.DB, prepare: sql => {
      if (sql.startsWith("UPDATE submissions SET status = ?")) db.prepare("UPDATE submissions SET status = 'published' WHERE id = ?").run(id)
      return prepare(sql)
    } } }
    assert.equal((await withdrawSubmission(sending)).status, 409)
    assert.equal(gh.pulls.get(1).state, "open")
    assert.equal(gh.comments.length, 0)
    assert.equal(db.prepare("SELECT status FROM submissions WHERE id = ?").get(id).status, "published")
  })
})

describe("sending the same thing again", () => {
  function withdraw(cookie, id) {
    return withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } }))
  }

  function kept() {
    return db.prepare("SELECT * FROM withdrawn_pulls").all()
  }

  test("while it is waiting for review is refused, pointing at the one already sent", async () => {
    const cookie = await signIn()
    const first = await send(cookie)
    const again = await send(cookie, { credit: ["Someone Else"] })
    assert.equal(again.status, 409)
    assert.equal(again.id, first.id)
    assert.equal(again.error, "You already have this texture waiting for review. Change that one instead.")
    assert.equal(gh.pulls.size, 1)
    assert.equal(db.prepare("SELECT count FROM account_submissions").get().count, 1)
    assert.equal((await send(cookie, { name: "Silver Bricks" })).status, 201)
    const legends = PNG.sync.read(fs.readFileSync("public/fonts/minecraft-legends/textures/flat.png"))
    assert.equal((await send(cookie, { font: "minecraft-legends" }, pngOf(legends.width, legends.height))).status, 201)
    const other = await send(await signIn("github", { id: 9, login: "other" }))
    assert.equal(other.status, 201)
    assert.equal((await details(other.id)).asset, "gold_bricks_2")
  })

  test("after withdrawing it keeps only what is needed to find its pull request again", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { notes: "private notes" })
    await withdraw(cookie, id)
    const [row] = kept()
    assert.deepEqual(Object.keys(row), ["account_hash", "kind", "target", "asset", "pull", "branch", "withdrawn_at"])
    assert.deepEqual([row.kind, row.target, row.asset, row.pull, row.branch], ["texture", "minecraft-ten", "gold_bricks", 1, `submission/${id}`])
    assert.equal(JSON.stringify(row).includes("1234"), false)
    assert.equal(JSON.stringify(row).includes("someone"), false)
  })

  test("after withdrawing it reopens its old pull request on its old branch", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    const again = await send(cookie, { credit: ["Someone Else"], notes: "fixed it" })
    assert.equal(again.status, 201)
    assert.equal(again.id, id)
    assert.equal(again.pull, 1)
    assert.equal(gh.pulls.size, 1)
    assert.equal(gh.pulls.get(1).state, "open")
    assert.match(gh.pulls.get(1).body, /fixed it/)
    assert.match(gh.pulls.get(1).body, /` Someone Else `/)
    assert.equal(gh.comments.at(-1).body, "Sent again by the person who withdrew it.")
    assert.deepEqual(branchList(id).textures.gold_bricks.authors, ["Someone Else"])
    assert.deepEqual(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).parents, [gh.main()])
    const shown = await details(id, cookie)
    assert.deepEqual([shown.status, shown.pull, shown.mine, shown.notes], ["open", 1, true, "fixed it"])
    assert.deepEqual(kept(), [])
    assert.equal((await send(cookie, { name: "Silver Bricks" })).id, id + 1)
  })

  test("can be withdrawn and sent again more than once", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    await send(cookie)
    assert.equal((await withdraw(cookie, id)).status, 200)
    assert.equal(kept().length, 1)
    const again = await send(cookie)
    assert.deepEqual([again.status, again.id, again.pull, gh.pulls.size, gh.pulls.get(1).state], [201, id, 1, 1, "open"])
  })

  test("opens a new pull request when the old branch was deleted", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    gh.refs.delete(`heads/submission/${id}`)
    const again = await send(cookie)
    assert.deepEqual([again.status, again.id, again.pull], [201, id, 2])
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.equal(gh.pulls.get(2).head, `submission/${id}`)
    assert.ok(gh.refs.has(`heads/submission/${id}`))
    assert.deepEqual(kept(), [])
  })

  test("opens a new pull request when GitHub won't reopen the old one", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    gh.refs.set(`heads/submission/${id}`, gh.main())
    const again = await send(cookie)
    assert.deepEqual([again.status, again.id, again.pull], [201, id, 2])
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.ok(branchList(id).textures.gold_bricks)
  })

  test("opens a new pull request when the old one was merged anyway", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    gh.pulls.get(1).merged = true
    const again = await send(cookie)
    assert.deepEqual([again.status, again.pull], [201, 2])
    assert.equal(gh.pulls.get(1).state, "closed")
  })

  test("from another account, or as something else, opens a new pull request", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    const other = await send(await signIn("github", { id: 9, login: "other" }))
    assert.notEqual(other.id, id)
    assert.equal(other.pull, 2)
    const renamed = await send(cookie, { name: "Silver Bricks" })
    assert.notEqual(renamed.id, id)
    assert.equal(renamed.pull, 3)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.equal(kept().length, 1)
  })

  test("puts everything back when it fails after reopening", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await withdraw(cookie, id)
    const before = kept()
    gh.failing.add("POST /repos/owner/repo/git/trees")
    const again = await send(cookie)
    assert.equal(again.status, 502)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.deepEqual(kept(), before)
    assert.equal(await details(id), undefined)
    assert.ok(gh.refs.has(`heads/submission/${id}`))
    gh.failing.clear()
    const retried = await send(cookie)
    assert.deepEqual([retried.status, retried.id, retried.pull, gh.pulls.get(1).state], [201, id, 1, "open"])
  })
})

describe("the GitHub webhook", () => {
  async function sent() {
    const cookie = await signIn()
    const { id } = await send(cookie)
    return { cookie, id }
  }

  async function unread(cookie) {
    return (await (await accountDetails(context("/api/account", { cookie }))).json()).user.unread
  }

  test("a new submission never takes the id of one that was withdrawn, so its kept branch is left alone", async () => {
    const cookie = await signIn()
    const first = await send(cookie)
    const kept = gh.refs.get(`heads/submission/${first.id}`)
    await withdrawSubmission(context(`/api/submissions/${first.id}`, { method: "DELETE", cookie, params: { id: String(first.id) } }))
    const second = await send(cookie, { name: "Silver Bricks" })
    assert.equal(second.status, 201)
    assert.notEqual(second.id, first.id)
    assert.equal(gh.refs.get(`heads/submission/${first.id}`), kept)
    assert.ok(gh.refs.has(`heads/submission/${second.id}`))
  })

  test("refuses unsigned deliveries", async () => {
    assert.equal((await hook("ping", {}, "wrong")).status, 401)
  })

  test("forgets the submission on merge, leaving the submitter a notification that opens it in the generator", async () => {
    const { cookie, id } = await sent()
    await hook("pull_request", closed(1, true, id))
    assert.equal(await details(id), undefined)
    assert.equal(gh.refs.has(`heads/submission/${id}`), false)
    assert.equal(await unread(cookie), 1)
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.deepEqual([notifications[0].kind, notifications[0].submission, notifications[0].submissionName], ["published", null, "Gold Bricks"])
    const { lines } = decodeTitle(new URL(notifications[0].link, "https://mctitlegenerator.com").searchParams.get("title"))
    assert.deepEqual(lines[0], { text: "gold bricks", font: "minecraft-ten", textureSource: "premade", texture: "gold_bricks" })
    await markNotificationsSeen(context("/api/notifications", { method: "POST", cookie }))
    assert.equal(await unread(cookie), 0)
  })

  test("forgets a closed pull request, leaving a notification that links to it", async () => {
    const { cookie, id } = await sent()
    await hook("pull_request", closed(1, false, id))
    assert.equal(await details(id), undefined)
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.deepEqual([notifications[0].kind, notifications[0].link], ["rejected", `https://github.com/${REPO}/pull/1`])
  })

  test("a submitter with a notification left over can still withdraw their next submission", async () => {
    const { cookie, id } = await sent()
    await hook("pull_request", closed(1, true, id))
    const next = await send(cookie, { name: "Silver Bricks" })
    assert.equal((await withdrawSubmission(context(`/api/submissions/${next.id}`, { method: "DELETE", cookie, params: { id: String(next.id) } }))).status, 200)
    assert.equal(await details(next.id), undefined)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, 1)
    assert.equal((await clearNotifications(context("/api/notifications", { method: "DELETE", cookie }))).status, 200)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, 0)
  })

  test("passes on comments and reviews from collaborators only", async () => {
    const { cookie } = await sent()
    const comment = (login, association, type = "User") => ({ action: "created", issue: { number: 1, pull_request: {} }, comment: { body: `from ${login}`, author_association: association, html_url: "https://github.com/c", user: { login, type } } })
    await hook("issue_comment", comment("ewan", "OWNER"))
    await hook("issue_comment", comment("stranger", "NONE"))
    await hook("issue_comment", comment("helper[bot]", "OWNER", "Bot"))
    await hook("pull_request_review", { action: "submitted", pull_request: { number: 1 }, review: { state: "changes_requested", body: "", author_association: "COLLABORATOR", html_url: "https://github.com/r", user: { login: "mate", type: "User" } } })
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.deepEqual(notifications.map(item => [item.kind, item.author, item.body]), [["changes", "mate", ""], ["comment", "ewan", "from ewan"]])
  })

  test("rebuilds open submissions on the new main when their textures.json changes", async () => {
    const { id } = await sent()
    const files = new Map(gh.filesAt("main"))
    const main = JSON.parse(fs.readFileSync(TEXTURES, "utf8"))
    files.set(TEXTURES, gh.blob(Buffer.from(`${jsonText({ ...main, textures: { ...main.textures, gold_bricks: { authors: ["Earlier"], border: "#000000" } } })}\n`)))
    gh.refs.set("heads/main", gh.commit(files, [gh.main()], "someone else's texture"))
    await hook("push", { ref: "refs/heads/main", commits: [{ added: [], modified: [TEXTURES], removed: [] }] })
    assert.deepEqual(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).parents, [gh.main()])
    const list = branchList(id)
    assert.deepEqual(list.textures.gold_bricks.authors, ["Earlier"])
    assert.deepEqual(list.textures.gold_bricks_2, { name: "Gold Bricks", authors: ["Someone"], border: "#3d1f0a" })
  })

  test("a rebuild that read a submission before an edit leaves the edit alone", async () => {
    const { cookie, id } = await sent()
    const hold = holdGitHub((method, url) => method === "GET" && url.endsWith("/pulls/1"))
    const rebuilding = hook("push", { ref: "refs/heads/main", commits: [{ added: [], modified: [TEXTURES], removed: [] }] })
    await hold.arrived
    assert.equal((await edit(cookie, id, { name: "Shiny Gold" })).status, 200)
    const head = gh.refs.get(`heads/submission/${id}`)
    hold.release()
    await rebuilding
    assert.equal(db.prepare("SELECT name FROM submissions WHERE id = ?").get(id).name, "Shiny Gold")
    assert.equal(gh.refs.get(`heads/submission/${id}`), head)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
  })

  test("an edit while a rebuild is pushing is refused, then works once it's done", async () => {
    const { cookie, id } = await sent()
    const hold = holdGitHub((method, url) => method === "POST" && url.endsWith("/git/commits"))
    const rebuilding = hook("push", { ref: "refs/heads/main", commits: [{ added: [], modified: [TEXTURES], removed: [] }] })
    await hold.arrived
    const during = await edit(cookie, id, { name: "Shiny Gold" })
    assert.equal(during.status, 409)
    assert.match(during.error, /changed after you opened it/)
    hold.release()
    await rebuilding
    assert.equal(db.prepare("SELECT name FROM submissions WHERE id = ?").get(id).name, "Gold Bricks")
    assert.equal((await edit(cookie, id, { name: "Shiny Gold" })).status, 200)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
  })

  test("leaves submissions alone when main changes elsewhere", async () => {
    const { id } = await sent()
    const before = gh.refs.get(`heads/submission/${id}`)
    await hook("push", { ref: "refs/heads/main", commits: [{ added: ["README.md"], modified: [], removed: [] }] })
    assert.equal(gh.refs.get(`heads/submission/${id}`), before)
  })
})
