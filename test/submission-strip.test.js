import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHmac, generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { PNG } from "pngjs"
import { readMask } from "../generator/fonts.js"
import { prepare } from "../generator/submissionKinds/strip.js"
import { stripRange } from "../src/lib/assets.js"
import { flattenFonts, stripsOf } from "../src/lib/font.js"
import { jsonText } from "../src/lib/jsonText.js"
import { titleCase } from "../src/lib/names.js"
import { defaultDepth } from "../src/lib/settings.js"
import { centredOffset, stripUse } from "../src/lib/strips.js"
import { submissionContext } from "../src/lib/submissionKinds/index.js"
import { strip as checker } from "../src/lib/submissionKinds/strip.js"
import { fitOffset, fitProblems, fontMeasure, heightList, offsetRange, remapStrip, setEntry, stripHeights, stripTarget } from "../src/lib/submissionKinds/stripFit.js"
import { decodePng } from "../src/lib/submissionKinds/png.js"
import { strip as writer } from "../src/server/submissionKinds/strip.js"
import { fakeGitHub } from "./fakeGitHub.js"

const { finishSignIn, receiveSignIn, startSignIn } = await import("../src/server/accounts.js")
const { createSubmission, editSubmission, receiveWebhook, submissionDetails } = await import("../src/server/submissions.js")

const REPO = "owner/repo"
const API = "https://github.test"
const FONTS = "public/font/fonts.json"
const SET = "public/strips/minecraft-ten/textures.json"
const SEEDED = [FONTS, SET].concat(fs.readdirSync("public/font", { recursive: true }).filter(file => file.endsWith("textures.json")).map(file => `public/font/${file.replaceAll("\\", "/")}`))
const NEW_SHAPE = { depth: 16, baseline: 24, height: 40 }
const realFetch = globalThis.fetch
const published = flattenFonts(JSON.parse(fs.readFileSync(FONTS, "utf8")))

function png(width, height) {
  const image = new PNG({ width, height })
  for (let i = 0; i < image.data.length; i += 4) image.data.set([(i / 4) % 256, 100, 50, 255], i)
  return PNG.sync.write(image)
}

function files(url) {
  const file = path.join("public", decodeURIComponent(new URL(url, "https://site.test").pathname))
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response("missing", { status: 404 })
}

function siteContext() {
  return submissionContext(published.map(font => ({ ...font, name: font.name ?? titleCase(font.id) })), path => Promise.resolve(files(path)))
}

async function checked(target, details, image) {
  const result = await checker.check({ target, details: { border: "#000000", ...details }, bytes: image ? new Uint8Array(image) : null }, siteContext())
  return { ...result, problems: Object.fromEntries(Object.entries(result.problems).filter(([, problem]) => problem)) }
}

describe("strip shapes", () => {
  test("reads every font sheet the same as pngjs", async () => {
    for (const file of SEEDED.filter(item => item.startsWith("public/font/") && item !== FONTS).map(item => path.join(path.dirname(item), "font.png")).filter(item => fs.existsSync(item))) {
      const bytes = fs.readFileSync(file)
      const mine = await decodePng(new Uint8Array(bytes))
      assert.deepEqual(Buffer.from(mine.data), PNG.sync.read(bytes).data, file)
    }
  })

  test("measures fonts the way the thumbnails do", async () => {
    const ctx = siteContext()
    for (const font of published.filter(item => !item.inherits)) {
      const { cells, capHeight } = readMask(font, published)
      assert.deepEqual(await fontMeasure(ctx, font), { range: stripRange({ cells, capHeight }), capHeight, depth: defaultDepth(font) })
    }
  })

  test("a strip can be any power of two times its rows", () => {
    assert.deepEqual(stripHeights(92), [23, 46, 92, 184, 368, 736, 1472, 2944])
    assert.deepEqual(stripHeights(80).slice(0, 4), [5, 10, 20, 40])
    assert.equal(heightList([1, 2, 4]), "1, 2 or 4")
  })

  test("targets", () => {
    assert.deepEqual(stripTarget("set:minecraft-ten"), { kind: "set", id: "minecraft-ten" })
    assert.deepEqual(stripTarget("font:minecraft-five"), { kind: "font", id: "minecraft-five" })
    assert.deepEqual(stripTarget("new"), { kind: "new", id: "" })
    assert.deepEqual(stripTarget("minecraft-five"), { kind: "font", id: "minecraft-five" })
  })

  test("the offset is the one nearest centred that keeps the letters inside", () => {
    const measure = { range: { top: 36, bottom: -8 }, capHeight: 30, depth: 16 }
    const set = { id: "s", ...NEW_SHAPE }
    assert.deepEqual(offsetRange(set, measure, false), { low: -5, high: -1 })
    assert.equal(fitOffset(set, measure, false), -1)
    assert.deepEqual(fitProblems(set, measure, -1, false), [])
    assert.equal(fitProblems(set, measure, 0, false).length, 1)
    assert.equal(fitOffset({ ...set, depth: 8, baseline: 16 }, measure, false), null)
    assert.equal(fitOffset({ ...set, height: 20 }, measure, false), null)
    assert.equal(fitOffset({ ...set, height: 20 }, measure, true), 5)
  })

  test("a strip type's strip is redrawn in the font's own rows for the custom strip mode", () => {
    const measure = { range: { top: 36, bottom: -8 }, capHeight: 36, depth: 16 }
    const set = { id: "s", depth: 22, baseline: 30, height: 40 }
    const image = { width: 1, height: 92, data: new Uint8ClampedArray(Array.from({ length: 92 }, (_, row) => [row, 0, 0, 255]).flat()) }
    const remapped = remapStrip(image, setEntry(set, 0, false), measure)
    const rows = Array.from({ length: remapped.height }, (_, row) => remapped.data[row * 4])
    assert.equal(remapped.height, 16 * 2 + 36 + 8)
    assert.equal(rows[0], 0)
    assert.equal(rows[15], 21)
    assert.deepEqual(rows.slice(16, 20), [24, 25, 26, 27])
    assert.equal(rows[16 + 36], 60)
    assert.equal(rows[16 + 43], 67)
    assert.equal(rows[16 + 44], 70)
    assert.equal(rows.at(-1), 91)
  })
})

describe("checking a strip", () => {
  test("a strip type's strips are its depth, baseline and height tall", async () => {
    assert.deepEqual((await checked("set:minecraft-ten", {}, png(1, 92))).problems, {})
    assert.deepEqual((await checked("set:minecraft-ten", {}, png(16, 46))).details, { border: "#000000", size: { width: 16, height: 46 } })
    assert.match((await checked("set:minecraft-ten", {}, png(1, 90))).problems.file, /Minecraft Ten strip type have to be 23, 46, 92, 184/)
  })

  test("a font's own strips are its depth twice plus its letters' reach", async () => {
    const result = await checked("font:minecraft-five", {}, png(1, 19))
    assert.deepEqual(result.problems, {})
    assert.equal(result.target, "font:minecraft-five")
    assert.match((await checked("font:minecraft-five", {}, png(1, 92))).problems.file, /Minecraft Five have to be 19, 38, 76/)
  })

  test("variants and bare font ids go to the font that owns the textures", async () => {
    assert.equal((await checked("font:minecraft-ten-v2", {}, png(1, 92))).target, "font:minecraft-ten")
    assert.equal((await checked("minecraft-five", {}, png(1, 76))).target, "font:minecraft-five")
    assert.match((await checked("set:nope", {}, png(1, 92))).problems.target, /strip type/)
    assert.match((await checked("font:nope", {}, png(1, 92))).problems.target, /font/)
  })

  test("only strip types with a height can stretch", async () => {
    assert.equal((await checked("set:minecraft-ten", { stretch: true }, png(1, 92))).details.stretch, true)
    assert.equal((await checked("font:minecraft-five", { stretch: true }, png(1, 76))).details.stretch, undefined)
  })

  test("a new strip type needs fonts that fit it, and moves them off centre when that helps", async () => {
    const good = await checked("new", { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-five", "geo-squares"] }, png(1, 80))
    assert.deepEqual(good.problems, {})
    assert.deepEqual(good.details, { border: "#000000", size: { width: 1, height: 80 }, set: "soft-edge", ...NEW_SHAPE, fonts: ["minecraft-five", "geo-squares"], offsets: { "minecraft-five": -1 } })
    const bad = await checked("new", { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-earth"] }, png(1, 92))
    assert.match(bad.problems.fonts, /Minecraft Earth won't fit: it's 30 deep/)
    assert.match(bad.problems.file, /this strip type have to be 5, 10, 20, 40, 80/)
  })

  test("a new strip type's name and shape are checked", async () => {
    const result = await checked("new", { set: "Minecraft Ten", depth: 0, baseline: 3, height: 999, fonts: [] })
    assert.match(result.problems.set, /already a strip type called Minecraft Ten/)
    assert.match(result.problems.depth, /depth has to be a whole number from 1/)
    assert.match(result.problems.height, /height has to be a whole number/)
    assert.match(result.problems.fonts, /Pick the fonts/)
    assert.match((await checked("new", { set: "!!!", ...NEW_SHAPE, fonts: ["minecraft-five"] })).problems.set, /letters or numbers/)
    assert.match((await checked("new", { set: "Soft", ...NEW_SHAPE, baseline: 10, fonts: ["minecraft-five"] })).problems.baseline, /from 16 to 80/)
  })

  test("a new strip type passes the published strips test for every font it lists", async () => {
    const { details } = await checked("new", { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-five", "geo-squares", "minecraft-seven"] }, png(1, 80))
    for (const id of details.fonts) {
      const font = published.find(item => item.id === id)
      const { cells, capHeight } = readMask(font, published)
      const range = stripRange({ cells, capHeight })
      const offset = centredOffset(details.height, capHeight) + (details.offsets?.[id] ?? 0)
      assert.ok(defaultDepth(font) <= details.depth)
      assert.ok(-range.bottom <= details.baseline - details.depth + offset)
      assert.ok(range.top + offset <= details.height)
      assert.ok(Number.isInteger(Math.log2(80 / (details.baseline + details.height + details.depth))))
    }
  })
})

let env
let gh
let waiting
let profile

function d1(sqlite) {
  function statement(sql, values = []) {
    return {
      bind: (...next) => statement(sql, next),
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
      execute() {
        return /RETURNING/.test(sql) ? { results: sqlite.prepare(sql).all(...values) } : { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }
      }
    }
  }
  return {
    prepare: sql => statement(sql),
    batch: async statements => {
      sqlite.exec("BEGIN")
      try {
        const results = statements.map(item => item.execute())
        sqlite.exec("COMMIT")
        return results
      } catch (err) {
        sqlite.exec("ROLLBACK")
        throw err
      }
    }
  }
}

function context(url, { method = "GET", body, cookie, params = {}, headers = {} } = {}) {
  const request = new Request(`https://mctitlegenerator.com${url}`, { method, body, headers: { ...(cookie && { Cookie: cookie }), ...headers } })
  return { request, env, params, waitUntil: promise => waiting.push(promise) }
}

async function signIn() {
  profile = { id: "1234", username: "someone", email: "someone@example.com", verified: true }
  const started = await startSignIn(context(`/api/account/login/discord?return=${encodeURIComponent("https://mctitlegenerator.com")}`, { params: { provider: "discord" } }))
  const state = new URL(started.headers.get("Location")).searchParams.get("state")
  const stateCookie = started.headers.getSetCookie().find(line => line.startsWith("signin_state=")).split(";")[0]
  const back = await receiveSignIn(context(`/api/account/login/discord/callback?${new URLSearchParams({ code: "abc", state })}`, { params: { provider: "discord" } }))
  const { pathname, search } = new URL(back.headers.get("Location"))
  const done = await finishSignIn(context(`${pathname}${search}`, { cookie: stateCookie, params: { provider: "discord" } }))
  return done.headers.getSetCookie().find(line => line.startsWith("session=")).split(";")[0]
}

function form({ target = "set:minecraft-ten", details = {}, ...fields } = {}, image = png(1, 92)) {
  const data = new FormData()
  const values = { kind: "strip", target, name: "Pale Dawn", credit: "Someone", notes: "", agree: "true", details: JSON.stringify({ border: "#3D1F0A", ...details }), ...fields }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  if (image) data.set("file", new Blob([image], { type: "image/png" }), "strip.png")
  return data
}

async function send(cookie, fields, image) {
  const response = await createSubmission(context("/api/submissions", { method: "POST", body: form(fields, image), cookie }))
  return { status: response.status, ...await response.json() }
}

async function edit(cookie, id, fields, image = null) {
  const response = await editSubmission(context(`/api/submissions/${id}`, { method: "PATCH", body: form(fields, image), cookie, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

async function details(id) {
  return (await (await submissionDetails(context(`/api/submissions/${id}`, { params: { id: String(id) } }))).json()).submission
}

function branchFile(id, file) {
  const sha = gh.filesAt(`submission/${id}`).get(file)
  return sha ? Buffer.from(gh.blobs.get(sha)).toString() : null
}

function branchJson(id, file) {
  return JSON.parse(branchFile(id, file))
}

function onMain(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(fs.readFileSync("schema.sql", "utf8"))
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
  gh = fakeGitHub(publicKey, { repo: REPO, api: API, files: SEEDED })
  waiting = []
  env = { DB: d1(sqlite), ASSETS: { fetch: url => files(String(url)) }, SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "github-secret", GITHUB_APP_ID: "123", GITHUB_APP_KEY: privateKey, GITHUB_WEBHOOK_SECRET: "hook-secret", GITHUB_REPOSITORY: REPO, GITHUB_API: API, RESEND_API_KEY: "resend-key" }
  globalThis.fetch = async (url, options) => {
    const text = String(url)
    if (text.startsWith(API)) return gh.handle(text, options)
    return new Response(JSON.stringify(options?.method === "POST" ? { access_token: "token" } : String(url).endsWith("/user/emails") ? profile.emails ?? [{ email: `${profile.login}@example.com`, primary: true, verified: true }] : profile), { status: 200, headers: { "Content-Type": "application/json" } })
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("sending a strip", () => {
  test("to a strip type adds it to the strip type's list and folder", async () => {
    const cookie = await signIn()
    const { status, id } = await send(cookie, { details: { stretch: true } }, png(16, 46))
    assert.equal(status, 201)
    const set = onMain(SET)
    assert.equal(branchFile(id, SET), `${jsonText({ ...set, textures: { ...set.textures, pale_dawn: { type: "strip", stretch: true, author: "Someone", border: "#3d1f0a" } } })}\n`)
    assert.ok(gh.filesAt(`submission/${id}`).has("public/strips/minecraft-ten/textures/pale_dawn.png"))
    assert.equal(gh.pulls.get(1).title, "Pale Dawn strip for the Minecraft Ten strip type")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "add Pale Dawn strip to the Minecraft Ten strip type")
    assert.equal(branchFile(id, FONTS), fs.readFileSync(FONTS, "utf8"))
    assert.deepEqual((await details(id)).details, { border: "#3d1f0a", stretch: true, size: { width: 16, height: 46 } })
  })

  test("to a font adds it to the font's own textures", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie, { target: "font:minecraft-five", name: "Edition" }, png(1, 76))
    const list = branchJson(id, "public/font/minecraft-five/textures.json")
    assert.deepEqual(list.textures.edition_2, { type: "strip", name: "Edition", author: "Someone", border: "#3d1f0a" })
    assert.ok(gh.filesAt(`submission/${id}`).has("public/font/minecraft-five/textures/edition_2.png"))
    assert.equal(gh.pulls.get(1).title, "Edition strip for Minecraft Five")
  })

  test("as a new strip type makes the strip type and gives it to each font", async () => {
    const cookie = await signIn()
    const { status, id } = await send(cookie, { target: "new", details: { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-five", "geo-squares"] } }, png(2, 80))
    assert.equal(status, 201)
    assert.deepEqual(branchJson(id, "public/strips/soft-edge/textures.json"), { ...NEW_SHAPE, textures: { pale_dawn: { type: "strip", author: "Someone", border: "#3d1f0a" } } })
    assert.ok(gh.filesAt(`submission/${id}`).has("public/strips/soft-edge/textures/pale_dawn.png"))
    const fonts = branchJson(id, FONTS)
    const five = fonts.find(font => font.id === "minecraft-five")
    assert.deepEqual(Object.keys(five).slice(0, 3), ["id", "author", "strips"])
    assert.deepEqual(five.strips, [{ id: "soft-edge", offset: -1 }])
    assert.deepEqual(fonts.find(font => font.id === "geo-squares").strips, ["minecraft-ten", "soft-edge"])
    const flat = flattenFonts(fonts)
    assert.deepEqual(flat.filter(font => stripsOf(font, flat).some(item => stripUse(item).id === "soft-edge")).map(font => font.id), ["minecraft-five", "geo-squares"])
    assert.equal(gh.pulls.get(1).title, "Pale Dawn strip in a new Soft Edge strip type")
  })

  test("a new strip type can go on a variant that has its own sheet", async () => {
    const cookie = await signIn()
    const { status, error, id } = await send(cookie, { target: "new", details: { set: "Wide", depth: 22, baseline: 30, height: 51, fonts: ["minecraft-ten-cyrillic"] } }, png(1, 103))
    assert.equal(status, 201, error)
    const ten = branchJson(id, FONTS).find(font => font.id === "minecraft-ten")
    assert.deepEqual(ten.strips, ["minecraft-ten"])
    assert.deepEqual(ten.variants.find(variant => variant.id === "minecraft-ten-cyrillic").strips, [{ id: "wide", offset: -5 }])
  })

  test("keeps ids clear of every font that will list the strip and of other open strips", async () => {
    const cookie = await signIn()
    const gradient = await send(cookie, { name: "Gradient" })
    assert.ok(branchJson(gradient.id, SET).textures.gradient_2)
    const again = await send(cookie, { name: "Gradient" })
    assert.ok(branchJson(again.id, SET).textures.gradient_3)
    const own = await send(cookie, { target: "font:minecraft-ten", name: "Gradient" })
    assert.ok(branchJson(own.id, "public/font/minecraft-ten/textures.json").textures.gradient_4)
    const fresh = await send(cookie, { target: "new", name: "Gradient", details: { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-five", "geo-squares"] } }, png(1, 80))
    assert.ok(branchJson(fresh.id, "public/strips/soft-edge/textures.json").textures.gradient_4)
    const shared = await send(cookie, { target: "font:minecraft-dungeons", name: "Gradient" }, png(1, 92))
    assert.ok(branchJson(shared.id, "public/font/minecraft-dungeons/textures.json").textures.gradient_4)
  })

  test("is refused when the strip doesn't fit what it's for", async () => {
    const cookie = await signIn()
    assert.match((await send(cookie, {}, png(1, 90))).error, /have to be 23, 46, 92/)
    assert.match((await send(cookie, { target: "new", details: { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-earth"] } }, png(1, 80))).error, /Minecraft Earth won't fit/)
    assert.equal(gh.calls.length, 0)
  })

  test("edits can't change a new strip type's shape without a new image", async () => {
    const cookie = await signIn()
    const shape = { set: "Soft Edge", ...NEW_SHAPE, fonts: ["minecraft-five"] }
    const { id } = await send(cookie, { target: "new", details: shape }, png(1, 80))
    const stored = (await details(id)).details
    assert.match((await edit(cookie, id, { target: "new", details: { ...stored, height: 41 } })).error, /have to be/)
    const renamed = await edit(cookie, id, { target: "new", details: { ...stored, set: "Softer Edge" } })
    assert.equal(renamed.status, 200)
    assert.ok(branchFile(id, "public/strips/softer-edge/textures.json"))
    assert.equal(branchFile(id, "public/strips/soft-edge/textures.json"), null)
  })

  test("rebuilds when the strip type changes on main", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const set = onMain(SET)
    const changed = new Map(gh.filesAt("main"))
    changed.set(SET, gh.blob(Buffer.from(`${JSON.stringify({ ...set, textures: { ...set.textures, pale_dawn: { type: "strip", author: "Earlier" } } })}\n`)))
    gh.refs.set("heads/main", gh.commit(changed, [gh.main()], "someone else's strip"))
    const body = JSON.stringify({ repository: { full_name: REPO }, ref: "refs/heads/main", commits: [{ added: [], modified: [SET], removed: [] }] })
    await receiveWebhook(context("/api/github", { method: "POST", body, headers: { "X-GitHub-Event": "push", "X-Hub-Signature-256": `sha256=${createHmac("sha256", "hook-secret").update(body).digest("hex")}` } }))
    await Promise.all(waiting)
    assert.equal(branchJson(id, SET).textures.pale_dawn.author, "Earlier")
    assert.ok(branchJson(id, SET).textures.pale_dawn_2)
  })
})

describe("the strip writer", () => {
  const fonts = published.map(font => ({ ...font, name: font.name ?? titleCase(font.id) }))

  test("watches every list the strip's id depends on", () => {
    const set = writer.watches({ row: { target: "set:minecraft-ten" }, details: {}, fonts })
    assert.ok(set.includes(SET) && set.includes(FONTS) && set.includes("public/font/geo-squares/textures.json"))
    assert.deepEqual(writer.watches({ row: { target: "font:minecraft-five" }, details: {}, fonts }), ["public/font/minecraft-five/textures.json"])
    assert.deepEqual(writer.watches({ row: { target: "new" }, details: { set: "soft", fonts: ["minecraft-five"] }, fonts }).sort(), [FONTS, "public/font/minecraft-five/textures.json", "public/strips/soft/textures.json"])
  })

  test("shares id scopes with the fonts the strip lands in", () => {
    assert.deepEqual(writer.scopes({ row: { target: "font:minecraft-five" }, details: {}, fonts }), ["font:minecraft-five"])
    assert.ok(writer.scopes({ row: { target: "set:minecraft-ten" }, details: {}, fonts }).includes("font:geo-squares"))
    assert.deepEqual(writer.scopes({ row: { target: "new" }, details: { set: "soft", fonts: ["minecraft-five"] }, fonts }), ["strips:soft", "font:minecraft-five"])
  })
})

describe("the workflow step", () => {
  function run(changed, show = () => []) {
    const calls = []
    prepare({ root: path.resolve("."), base: "base", changed, git: (...args) => args[0] === "ls-tree" ? ["file"] : show(args), node: (...args) => calls.push(args[1]) })
    return calls
  }

  test("makes thumbnails for every font using a changed strip type", () => {
    const users = published.filter(font => stripsOf(font, published).some(item => stripUse(item).id === "minecraft-ten")).map(font => font.id)
    assert.ok(users.includes("minecraft-ten-v2"))
    assert.deepEqual(run([SET, "public/strips/minecraft-ten/textures/pale_dawn.png"]), users)
  })

  test("makes thumbnails for a font that gained its own strip, and not for other texture changes", () => {
    const file = "public/font/minecraft-five/textures.json"
    const list = onMain(file)
    const without = Object.fromEntries(Object.entries(list.textures).filter(([, entry]) => entry.type !== "strip"))
    assert.deepEqual(run([file], () => JSON.stringify({ ...list, textures: without }).split("\n")), ["minecraft-five"])
    assert.deepEqual(run([file], () => JSON.stringify(list).split("\n")), [])
    assert.deepEqual(run(["README.md"]), [])
  })
})
