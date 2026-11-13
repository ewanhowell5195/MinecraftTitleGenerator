import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { PNG } from "pngjs"
import { pngOf } from "./helpers/png.js"
import { REPO, context, details, editForm, hook, sendForm, serverEnv, signIn } from "./helpers/server.js"

const { accountDetails } = await import("../src/server/accounts.js")
const { addComment, clearNotifications, createSubmission, listNotifications, listSubmissions, markNotificationsSeen, reviewState, reviewSubmission, submissionDetails, submissionFile, submissionProcessing, withdrawSubmission } = await import("../src/server/submissions.js")
const { jsonText } = await import("../src/lib/jsonText.js")
const { decodeTitle } = await import("../src/lib/linkformat.js")

const TEXTURES = "public/font/minecraft-ten/textures.json"
const FLAT = PNG.sync.read(fs.readFileSync("public/font/minecraft-ten/textures/flat.png"))

let gh
let waiting
let db
let emails
let resend
let restore

function form(fields = {}, image = pngOf(FLAT.width, FLAT.height)) {
  const data = new FormData()
  const { font = "minecraft-ten", border = "#3D1F0A", ...rest } = fields
  const values = { kind: "texture", target: font, name: "Gold Bricks", credit: ["Someone"], notes: "", agree: "true", details: JSON.stringify({ border }), ...rest }
  values.credit = JSON.stringify(values.credit)
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  if (image) data.set("file", new Blob([image], { type: "image/png" }), "texture.png")
  return data
}

const send = (cookie, fields, image) => sendForm(cookie, form(fields, image))
const edit = (cookie, id, fields, image = null) => editForm(cookie, id, form(fields, image))

function branchList(id) {
  return JSON.parse(gh.filesAt(`submission/${id}`) && Buffer.from(gh.blobs.get(gh.filesAt(`submission/${id}`).get(TEXTURES))).toString())
}

function closed(number, merged, id) {
  return { action: "closed", sender: { login: "ewan" }, pull_request: { number, merged, html_url: `https://github.com/${REPO}/pull/${number}`, head: { ref: `submission/${id}` } } }
}

beforeEach(() => {
  ({ gh, waiting, db, emails, resend, restore } = serverEnv({ files: [TEXTURES] }))
})

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
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/gold_bricks.png"))
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
    const second = await send(cookie, { name: "Flat" })
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
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/cracked_gold.png"))
    assert.equal(gh.pulls.get(1).title, "Cracked Gold texture for Minecraft Ten as a variant of Cracked")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "[CF-Pages-Skip] add Cracked Gold texture to Minecraft Ten as a variant of Cracked")
    assert.equal((await details(id)).details.variantOf, "cracked")
    const plain = await send(cookie, { name: "Neon Gold", details: variantOf("neon_glow") })
    assert.deepEqual(branchList(plain.id).textures.neon_glow.variants.neon_gold, { authors: ["Someone"], border: "#3d1f0a" })
    assert.match((await send(cookie, { name: "Lost", details: variantOf("cracked_left") })).error, /Pick the texture this is a variant of/)
    const over = await send(cookie, { kind: "overlay", name: "Over", details: variantOf("cracked") }, pngOf(FLAT.width, FLAT.height))
    assert.equal((await details(over.id)).details.variantOf, undefined)
  })

  test("puts overlays in the overlays section and folder, without a border", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { kind: "overlay", name: "Soft Shading", border: "" }, pngOf(FLAT.width * 2, FLAT.height * 2))
    const list = branchList(id)
    assert.deepEqual(list.overlays.soft_shading, { authors: ["Someone"], density: 2 })
    assert.equal(list.textures.soft_shading, undefined)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/overlays/soft_shading.png"))
    assert.equal(gh.pulls.get(1).title, "Soft Shading overlay for Minecraft Ten")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "[CF-Pages-Skip] add Soft Shading overlay to Minecraft Ten")
    assert.equal((await details(id)).details.border, undefined)
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
    const fonts = JSON.parse(fs.readFileSync("public/font/fonts.json", "utf8"))
    const inherited = fonts.flatMap(font => (font.variants ?? []).filter(variant => variant.inherits).map(variant => ({ variant, owner: font })))[0]
    const flat = PNG.sync.read(fs.readFileSync(`public/font/${inherited.owner.id}/textures/flat.png`))
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
    assert.deepEqual(list.textures.shiny_gold, { authors: ["Someone"], border: "#000000" })
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/shiny_gold.png"))
    assert.equal(gh.filesAt(`submission/${id}`).has("public/font/minecraft-ten/textures/gold_bricks.png"), false)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
    assert.equal(gh.pulls.size, 1)
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
    await hook("pull_request", closed(1, true, id))
    assert.deepEqual((await (await listNotifications(context("/api/notifications", { cookie }))).json()).notifications, [])
    assert.equal((await edit(cookie, id, { name: "Again" })).status, 404)
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

  test("leaves submissions alone when main changes elsewhere", async () => {
    const { id } = await sent()
    const before = gh.refs.get(`heads/submission/${id}`)
    await hook("push", { ref: "refs/heads/main", commits: [{ added: ["README.md"], modified: [], removed: [] }] })
    assert.equal(gh.refs.get(`heads/submission/${id}`), before)
  })
})

describe("reviewing on the site", () => {
  async function admin() {
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '77', 'ewan', 0, 1)").run()
    return signIn("github", { id: 77, login: "ewan" })
  }

  async function news(cookie) {
    return (await (await listNotifications(context("/api/notifications", { cookie }))).json()).notifications.map(item => [item.kind, item.author, item.body])
  }

  async function comment(cookie, id, body) {
    const response = await addComment(context(`/api/submissions/${id}/comments`, { method: "POST", body: JSON.stringify({ body }), cookie, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  async function review(cookie, id, action, text) {
    const response = await reviewSubmission(context(`/api/submissions/${id}/review`, { method: "POST", body: JSON.stringify({ action, comment: text }), cookie, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  async function thread(id, cookie) {
    return (await (await submissionDetails(context(`/api/submissions/${id}`, { cookie, params: { id: String(id) } }))).json())
  }

  function githubComment(login, id, association = "OWNER") {
    return { action: "created", issue: { number: 1, pull_request: {} }, comment: { body: `from ${login}`, author_association: association, html_url: "https://github.com/c", user: { login, id, type: "User" } } }
  }

  test("admins are told about new and changed submissions, and stay admins without presets", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await edit(cookie, id, { name: "Shiny Gold" })
    await edit(cookie, id, { name: "Shinier Gold" })
    assert.deepEqual(await news(reviewer), [["edited", "someone", ""], ["submitted", "someone", ""]])
    await markNotificationsSeen(context("/api/notifications", { method: "POST", cookie: reviewer }))
    await edit(cookie, id, { name: "Shiniest Gold" })
    assert.deepEqual(await news(reviewer), [["edited", "someone", ""], ["edited", "someone", ""], ["submitted", "someone", ""]])
    assert.deepEqual(await news(cookie), [])
    const events = (await thread(id)).comments.filter(item => item.kind === "edit")
    assert.deepEqual(events.map(item => [item.author, item.role]), [["someone", "submitter"]])
    assert.deepEqual(gh.comments.map(item => item.body), ["` someone ` (submitter) changed the submission on the site."])
    assert.equal((await (await accountDetails(context("/api/account", { cookie: reviewer }))).json()).user.admin, true)
    assert.equal((await (await accountDetails(context("/api/account", { cookie: reviewer }))).json()).user.waiting, 1)
    assert.equal((await (await accountDetails(context("/api/account", { cookie }))).json()).user.waiting, 0)
    assert.equal((await thread(id, reviewer)).reviewer, true)
    assert.equal((await thread(id, cookie)).reviewer, false)
  })

  test("admins can change someone's submission but not its notes, which tells the submitter on the site without an email", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie, { notes: "made with love" })
    await Promise.all(waiting)
    emails.splice(0)
    const { status, submission } = await edit(reviewer, id, { name: "Shiny Gold", notes: "" })
    assert.equal(status, 200)
    assert.deepEqual([submission.name, submission.mine, submission.notes], ["Shiny Gold", false, "made with love"])
    assert.match(gh.pulls.get(1).body, /made with love/)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
    assert.match(gh.pulls.get(1).body, /Sent from the website by ` someone ` \(discord\)/)
    await edit(reviewer, id, { name: "Shinier Gold" })
    await Promise.all(waiting)
    assert.deepEqual(emails, [])
    assert.deepEqual(await news(cookie), [["edited", "ewan", ""]])
    assert.deepEqual(await news(reviewer), [["submitted", "someone", ""]])
    assert.deepEqual(gh.comments.map(item => item.body), ["` ewan ` (reviewer) changed the submission on the site."])
    await edit(cookie, id, { name: "Gold" })
    await Promise.all(waiting)
    assert.deepEqual(emails.map(email => [email.to, email.subject]), [["ewan@example.com", "someone changed Gold"]])
    assert.deepEqual(await news(cookie), [["edited", "ewan", ""]])
    assert.deepEqual(await news(reviewer), [["edited", "someone", ""], ["submitted", "someone", ""]])
    assert.deepEqual((await thread(id)).comments.map(item => [item.kind, item.author, item.role]), [["edit", "ewan", "reviewer"], ["edit", "someone", "submitter"]])
  })

  test("admins can't withdraw someone's submission, and two admins' changes are each noted", async () => {
    const reviewer = await admin()
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '78', 'second', 0, 1)").run()
    const second = await signIn("github", { id: 78, login: "second" })
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.equal((await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie: reviewer, params: { id: String(id) } }))).status, 404)
    await edit(reviewer, id, { name: "Shiny Gold" })
    await edit(second, id, { name: "Shinier Gold" })
    assert.deepEqual(await news(cookie), [["edited", "second", ""]])
    assert.deepEqual((await news(reviewer)).concat(await news(second)).filter(([kind]) => kind === "edited"), [])
    assert.deepEqual((await thread(id)).comments.map(item => [item.kind, item.author]), [["edit", "ewan"], ["edit", "second"]])
  })

  test("the submitter and admins comment on the site, and each is told about the other's comments", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.equal((await comment(cookie, id, "  is this @everyone ok?  ")).status, 201)
    assert.equal(gh.comments.at(-1).body, "` someone ` (submitter) commented on the site:\n\n```text\nis this @everyone ok?\n```")
    assert.equal((await comment(reviewer, id, "Looks good")).status, 201)
    assert.match(gh.comments.at(-1).body, /^` ewan ` \(reviewer\) commented on the site:/)
    assert.deepEqual((await news(reviewer)).slice(0, 1), [["comment", "someone", "is this @everyone ok?"]])
    assert.deepEqual(await news(cookie), [["comment", "ewan", "Looks good"]])
    const { comments } = await thread(id)
    assert.deepEqual(comments.map(item => [item.author, item.role, item.body]), [["someone", "submitter", "is this @everyone ok?"], ["ewan", "reviewer", "Looks good"]])
    const stranger = await signIn("github", { id: 9, login: "other" })
    assert.equal((await comment(stranger, id, "me too")).status, 403)
    assert.equal((await comment(null, id, "me too")).status, 401)
    assert.equal((await comment(cookie, id, "   ")).status, 400)
    assert.equal((await comment(cookie, id, "x".repeat(2001))).status, 400)
  })

  test("the submitter can only send so many comments a day, and reviewers are not limited", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    for (let sent = 0; sent < 2; sent++) assert.equal((await comment(cookie, id, `Note ${sent}`)).status, 201)
    db.prepare("UPDATE account_submissions SET count = ? WHERE count = 2").run(50)
    const refused = await comment(cookie, id, "One too many")
    assert.equal(refused.status, 429)
    assert.match(refused.error, /up to 50 comments a day/)
    assert.equal((await comment(reviewer, id, "Still reviewing")).status, 201)
  })

  test("comments from GitHub join the thread, and nobody is told about their own", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await hook("issue_comment", githubComment("ewan", 77))
    await hook("issue_comment", githubComment("mate", 5, "COLLABORATOR"))
    assert.deepEqual((await news(reviewer)).map(item => item.slice(0, 2)), [["comment", "mate"], ["submitted", "someone"]])
    assert.deepEqual((await news(cookie)).map(item => item.slice(0, 2)), [["comment", "mate"], ["comment", "ewan"]])
  })

  test("the thread is read from the pull request, keeping only site comments and collaborators", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(cookie, id, "from the site")
    gh.comment(1, "from a collaborator", { user: { login: "mate", type: "User" }, association: "COLLABORATOR", app: false })
    gh.comment(1, "from a stranger", { user: { login: "random", type: "User" }, association: "NONE", app: false })
    gh.comment(1, "` someone ` (submitter) commented on the site:\n\n```text\nforged\n```", { user: { login: "random", type: "User" }, association: "NONE", app: false })
    gh.comment(1, "Withdrawn by the person who sent it.")
    gh.reviews.push({ id: 900, number: 1, body: "please fix the e", state: "CHANGES_REQUESTED", user: { login: "ewan", type: "User" }, author_association: "OWNER", html_url: "https://github.com/r", submitted_at: new Date(Date.UTC(2027, 0, 1)).toISOString() })
    const { comments } = await thread(id, reviewer)
    assert.deepEqual(comments.map(item => [item.author, item.role, item.body]), [["someone", "submitter", "from the site"], ["mate", "reviewer", "from a collaborator"], ["ewan", "reviewer", "please fix the e"]])
    gh.failing.add("GET /repos/owner/repo/issues/1/comments?per_page=100&page=1")
    assert.equal((await thread(id)).comments, null)
  })

  test("the thread is read a page at a time, up to 200 entries", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const handle = gh.handle
    gh.handle = async (url, options) => {
      const page = /\/issues\/1\/comments\?per_page=100&page=(\d+)$/.exec(url)
      if (!page) return handle(url, options)
      const all = await (await handle(url, options)).json()
      return new Response(JSON.stringify(all.slice((page[1] - 1) * 100, page[1] * 100)))
    }
    for (let index = 0; index < 150; index++) gh.comment(1, `note ${index}`, { user: { login: "mate", type: "User" }, association: "COLLABORATOR", app: false })
    const first = (await thread(id)).comments
    assert.equal(first.length, 150)
    assert.equal(first.at(-1).body, "note 149")
    for (let index = 150; index < 250; index++) gh.comment(1, `note ${index}`, { user: { login: "mate", type: "User" }, association: "COLLABORATOR", app: false })
    assert.equal((await thread(id)).comments.length, 200)
  })

  test("edits in a row share one comment on the pull request, and a comment in between starts another", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await edit(cookie, id, { name: "Shiny Gold" })
    await edit(cookie, id, { name: "Shinier Gold" })
    await comment(cookie, id, "ready now")
    await edit(cookie, id, { name: "Shiniest Gold" })
    await edit(cookie, id, { name: "Gold" })
    assert.deepEqual((await thread(id)).comments.map(item => item.kind), ["edit", "comment", "edit"])
    assert.equal(gh.comments.length, 3)
  })

  test("admins can merge from the site once GitHub is ready, which publishes it and clears its notifications", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(cookie, id, "ready?")
    await comment(reviewer, id, "nearly")
    assert.equal((await review(cookie, id, "merge")).status, 403)
    assert.equal((await (await reviewState(context(`/api/submissions/${id}/review`, { cookie: reviewer, params: { id: String(id) } }))).json()).state, "clean")
    gh.pulls.get(1).mergeable_state = "unstable"
    const early = await review(reviewer, id, "merge")
    assert.equal(early.status, 409)
    assert.match(early.error, /Wait for its checks to finish/)
    assert.equal((await details(id)).status, "open")
    gh.pulls.get(1).mergeable_state = "clean"
    const merged = await review(reviewer, id, "merge")
    assert.equal(merged.status, 200)
    assert.equal(merged.outcome, "published")
    assert.equal(await details(id), undefined)
    assert.equal(gh.pulls.get(1).merged, true)
    assert.equal(gh.pulls.get(1).merge_method, "squash")
    assert.equal(gh.pulls.get(1).commit_message, "")
    assert.equal(gh.refs.has(`heads/submission/${id}`), false)
    assert.deepEqual(await news(reviewer), [])
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
    await hook("pull_request", closed(1, true, id))
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
    assert.equal((await review(reviewer, id, "decline")).status, 404)
  })

  test("a merge on GitHub clears the notifications too", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(cookie, id, "ready?")
    await hook("pull_request", closed(1, true, id))
    assert.deepEqual(await news(reviewer), [])
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
  })

  test("admins can decline from the site with a comment the submitter is told", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    const declined = await review(reviewer, id, "decline", "Too close to an existing one")
    assert.equal(declined.status, 200)
    assert.equal(declined.outcome, "rejected")
    assert.equal(await details(id), undefined)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.equal(gh.pulls.get(1).merged, undefined)
    assert.match(gh.comments.at(-1).body, /Too close to an existing one/)
    assert.deepEqual(await news(cookie), [["rejected", "ewan", "Too close to an existing one"]])
    assert.deepEqual(await news(reviewer), [])
  })

  function hookDuring(route, payload) {
    const handle = gh.handle
    gh.handle = async (url, options) => {
      const response = await handle(url, options)
      if (`${options?.method ?? "GET"} ${url}`.endsWith(route)) await hook("pull_request", payload)
      return response
    }
  }

  test("a decline on the site keeps its reason when GitHub's webhook gets there first", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    hookDuring("PATCH https://github.test/repos/owner/repo/pulls/1", closed(1, false, id))
    assert.equal((await review(reviewer, id, "decline", "Too close to an existing one")).status, 200)
    assert.deepEqual(await news(cookie), [["rejected", "ewan", "Too close to an existing one"]])
    assert.equal(await details(id), undefined)
  })

  test("a merge on the site tells the submitter once when GitHub's webhook gets there first", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    hookDuring("PUT https://github.test/repos/owner/repo/pulls/1/merge", closed(1, true, id))
    assert.equal((await review(reviewer, id, "merge")).outcome, "published")
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
    assert.equal(gh.refs.has(`heads/submission/${id}`), false)
  })

  test("a review GitHub refuses leaves the submission open to review again", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    gh.failing.add("PATCH /repos/owner/repo/pulls/:n")
    assert.equal((await review(reviewer, id, "decline")).status, 502)
    assert.equal((await details(id)).status, "open")
    assert.deepEqual(await news(cookie), [])
    gh.failing.clear()
    assert.equal((await review(reviewer, id, "decline")).status, 200)
  })

  test("two reviews at once only close it once", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    const outcomes = await Promise.all([review(reviewer, id, "decline", "No"), review(reviewer, id, "decline", "No")])
    assert.equal(outcomes.filter(item => item.status === 200).length, 1)
    assert.deepEqual(await news(cookie), [["rejected", "ewan", "No"]])
    assert.equal(gh.comments.length, 1)
  })

  test("clearing deletes only your own notifications", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(reviewer, id, "Looks good")
    const counts = async who => (await (await accountDetails(context("/api/account", { cookie: who }))).json()).user
    assert.equal((await counts(cookie)).notifications, 1)
    assert.equal((await counts(reviewer)).notifications, 1)
    assert.equal((await clearNotifications(context("/api/notifications", { method: "DELETE", cookie }))).status, 200)
    assert.deepEqual(await news(cookie), [])
    assert.equal((await counts(cookie)).notifications, 0)
    assert.equal((await counts(reviewer)).notifications, 1)
  })

  test("opening one submission only marks its own notifications as seen", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const first = await send(cookie)
    const second = await send(cookie, { name: "Silver Bricks" })
    await comment(reviewer, first.id, "One")
    await comment(reviewer, second.id, "Two")
    await markNotificationsSeen(context(`/api/notifications?submission=${first.id}`, { method: "POST", cookie }))
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.deepEqual(notifications.map(item => [item.body, item.seen]), [["Two", false], ["One", true]])
  })

  test("only admins see every open submission", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    await send(cookie)
    await send(await signIn("github", { id: 9, login: "other" }), { name: "Iron Bricks" })
    const listed = async who => listSubmissions(context("/api/submissions?review", { cookie: who }))
    assert.equal((await listed(cookie)).status, 403)
    assert.deepEqual((await (await listed(reviewer)).json()).submissions.map(item => item.name), ["Gold Bricks", "Iron Bricks"])
  })
})

describe("emailing notifications", () => {
  async function admin() {
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '77', 'ewan', 0, 1)").run()
    return signIn("github", { id: 77, login: "ewan" })
  }

  async function comment(cookie, id, body) {
    await addComment(context(`/api/submissions/${id}/comments`, { method: "POST", body: JSON.stringify({ body }), cookie, params: { id: String(id) } }))
    await Promise.all(waiting)
  }

  function stored() {
    return db.prepare("SELECT name, email FROM users ORDER BY id").all().map(row => [row.name, row.email])
  }

  function inbox() {
    return emails.splice(0).map(email => [email.to, email.subject])
  }

  test("only keeps the email of people with submissions and reviewers", async () => {
    await admin()
    const cookie = await signIn()
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at) VALUES ('discord', '5', 'presets', 0)").run()
    await signIn("discord", { id: "5", username: "presets", email: "presets@example.com", verified: true })
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["presets", null]])
    const { id } = await send(cookie)
    await Promise.all(waiting)
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["presets", null], ["someone", "someone@example.com"]])
    await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } }))
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["presets", null]])
  })

  test("refuses submissions until there is an email to send to", async () => {
    const noEmail = await signIn("discord", { id: "6", username: "phone", email: null })
    assert.match((await send(noEmail)).error, /Add an email address to your Discord account/)
    const unverified = await signIn("github", { id: 7, login: "fresh", emails: [{ email: "fresh@example.com", primary: true, verified: false }] })
    assert.equal((await send(unverified)).status, 201)
    assert.deepEqual(stored(), [["fresh", "fresh@example.com"]])
  })

  test("sends an email Resend refused with the next ones", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    resend.status = 500
    const { id } = await send(cookie)
    await Promise.all(waiting)
    assert.deepEqual(inbox(), [])
    resend.status = 200
    await comment(reviewer, id, "Looks good")
    assert.deepEqual(inbox().sort(), [["ewan@example.com", "someone sent Gold Bricks"], ["someone@example.com", "New comment on Gold Bricks"]])
    await comment(reviewer, id, "Still good")
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Gold Bricks"]])
  })

  test("keeps the address for a final email Resend refused, and forgets it once that email is sent", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const first = await send(cookie)
    await Promise.all(waiting)
    inbox()
    resend.status = 500
    await hook("pull_request", closed(1, true, first.id))
    assert.deepEqual(inbox(), [])
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["someone", "someone@example.com"]])
    resend.status = 200
    const other = await signIn("discord", { id: "9", username: "another", email: "another@example.com", verified: true })
    const second = await send(other, { name: "Silver Bricks" })
    await comment(reviewer, second.id, "Looks good")
    assert.ok(inbox().some(([to, subject]) => to === "someone@example.com" && /Gold Bricks/.test(subject)))
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["someone", null], ["another", "another@example.com"]])
  })

  test("gives up on an email Resend says can never be sent", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    resend.status = 422
    const { id } = await send(cookie)
    await Promise.all(waiting)
    resend.status = 200
    await comment(reviewer, id, "Looks good")
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Gold Bricks"]])
  })

  test("emails reviewers and the submitter everything they are notified about", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await Promise.all(waiting)
    assert.deepEqual(inbox(), [["ewan@example.com", "someone sent Gold Bricks"]])
    await comment(cookie, id, "is this ok?")
    await comment(reviewer, id, "change the <b>")
    const [toReviewer, toSubmitter] = emails.slice()
    assert.deepEqual(inbox(), [["ewan@example.com", "New comment on Gold Bricks"], ["someone@example.com", "New comment on Gold Bricks"]])
    assert.equal(toReviewer.text, `New comment on Gold Bricks.\n\nis this ok?\n\nReply: https://mctitlegenerator.com/submissions/${id}`)
    assert.match(toSubmitter.html, /change the &#60;b&#62;/)
    await review(reviewer, id)
    assert.deepEqual(inbox(), [["someone@example.com", "Gold Bricks was published"]])
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["someone", null]])
  })

  test("emails one change until the reviewer has seen it", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await edit(cookie, id, { name: "Shiny Gold" })
    await edit(cookie, id, { name: "Shinier Gold" })
    await Promise.all(waiting)
    assert.deepEqual(inbox().map(([, subject]) => subject), ["someone sent Gold Bricks", "someone changed Shiny Gold"])
    await markNotificationsSeen(context("/api/notifications", { method: "POST", cookie: reviewer }))
    await edit(cookie, id, { name: "Shiniest Gold" })
    await Promise.all(waiting)
    assert.deepEqual(inbox().map(([, subject]) => subject), ["someone changed Shiniest Gold"])
  })

  test("emails reviewers about issues, pull requests and comments on GitHub, skipping bots and themselves", async () => {
    await admin()
    const person = { login: "mate", id: 5, type: "User" }
    await hook("issues", { action: "opened", issue: { number: 40, title: "Fonts are blurry", body: "On every title", html_url: "https://github.com/i/40", user: person } })
    await hook("pull_request", { action: "opened", pull_request: { number: 41, title: "Add a font", body: "", html_url: "https://github.com/p/41", user: person } })
    await hook("issue_comment", { action: "created", issue: { number: 40, title: "Fonts are blurry" }, comment: { body: "Same here", author_association: "NONE", html_url: "https://github.com/c/1", user: person } })
    await hook("pull_request_review", { action: "submitted", pull_request: { number: 41, title: "Add a font" }, review: { state: "changes_requested", body: "", html_url: "https://github.com/r/1", user: { login: "ewan", id: 77, type: "User" }, author_association: "OWNER" } })
    await hook("issue_comment", { action: "created", issue: { number: 40, title: "Fonts are blurry" }, comment: { body: "Deployed", author_association: "NONE", html_url: "https://github.com/c/2", user: { login: "cloudflare-workers-and-pages[bot]", id: 3, type: "Bot" } } })
    await hook("issues", { action: "opened", issue: { number: 42, title: "Mine", body: "", html_url: "https://github.com/i/42", user: { login: "ewan", id: 77, type: "User" } } })
    assert.deepEqual(inbox(), [["ewan@example.com", "New issue: Fonts are blurry"], ["ewan@example.com", "New pull request: Add a font"], ["ewan@example.com", "New comment on Fonts are blurry"]])
  })

  test("comments on a submission's pull request are emailed once, and not to the commenter's other accounts", async () => {
    await admin()
    await signIn("discord", { id: "88", username: "ewan", email: "ewan@example.com", verified: true })
    db.prepare("UPDATE users SET admin = 1 WHERE provider = 'discord' AND provider_id = '88'").run()
    await signIn("discord", { id: "88", username: "ewan", email: "ewan@example.com", verified: true })
    const cookie = await signIn()
    await send(cookie)
    await Promise.all(waiting)
    inbox()
    await hook("issue_comment", { action: "created", issue: { number: 1, title: "Gold Bricks" }, comment: { body: "Nice", author_association: "OWNER", html_url: "https://github.com/c/3", user: { login: "ewan", id: 77, type: "User" } } })
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Gold Bricks"]])
    await hook("issue_comment", { action: "created", issue: { number: 1, title: "Gold Bricks" }, comment: { body: "Cool", author_association: "NONE", html_url: "https://github.com/c/4", user: { login: "random", id: 6, type: "User" } } })
    assert.deepEqual(inbox(), [["ewan@example.com", "New comment on Gold Bricks"]])
  })

  async function review(cookie, id) {
    await reviewSubmission(context(`/api/submissions/${id}/review`, { method: "POST", body: JSON.stringify({ action: "merge" }), cookie, params: { id: String(id) } }))
    await Promise.all(waiting)
  }
})
