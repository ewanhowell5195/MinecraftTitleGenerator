import assert from "node:assert/strict"
import { createHash, generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, test } from "node:test"
import { PNG } from "pngjs"
import { publishedFonts, readMask } from "../generator/fonts.js"
import { prepare } from "../generator/submissionKinds/font.js"
import { flattenFonts, fullOrder, parseMask, sheetLayout, solidMask, splitCells } from "../src/lib/font.js"
import { buildSheet, exportJson, fontFromPublished } from "../src/lib/fontEditor.js"
import { jsonText } from "../src/lib/jsonText.js"
import { titleCase } from "../src/lib/names.js"
import { font as kind } from "../src/lib/submissionKinds/font.js"
import { fontJsonFields } from "../src/lib/submissionKinds/fontBuild.js"
import { decodePng } from "../src/lib/submissionKinds/png.js"
import { submissionContext } from "../src/lib/submissionKinds/index.js"
import { font as client } from "../src/submissions/kinds/font.js"
import { defaultBorder, defaultDepth } from "../src/lib/settings.js"
import { fakeGitHub } from "./fakeGitHub.js"

const { finishSignIn, receiveSignIn, startSignIn } = await import("../src/server/accounts.js")
const { createSubmission, editSubmission } = await import("../src/server/submissions.js")

const LIST = "public/font/fonts.json"
const published = publishedFonts()
const fonts = published.map(entry => ({ ...entry, name: entry.name ?? titleCase(entry.id) }))

function copyOf(id) {
  const entry = published.find(item => item.id === id)
  const { png, cells } = readMask(entry, published)
  const zero = parseMask(png.data, png.width, png.height, cells.map(cell => cell.char).join(""), 0)
  const { glyphs } = splitCells(entry, published, zero.list)
  return fontFromPublished({ ...entry, name: entry.name ?? entry.id }, Object.values(glyphs), zero.capHeight)
}

function pngBytes({ width, height, data }) {
  const png = new PNG({ width, height })
  png.data.set(data)
  return PNG.sync.write(png)
}

function plainPng(width, height) {
  const png = new PNG({ width, height })
  png.data.fill(200)
  return new Uint8Array(PNG.sync.write(png))
}

function jsonOf(font, id = "test-font") {
  return new TextEncoder().encode(`${jsonText(exportJson({ ...font, id }, `data:image/png;base64,${pngBytes(buildSheet(font)).toString("base64")}`))}\n`)
}

function withFields(bytes, fields) {
  return new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(bytes)), ...fields }))
}

const ctx = submissionContext(fonts, async file => fs.existsSync(`public${file}`) ? new Response(fs.readFileSync(`public${file}`)) : new Response("missing", { status: 404 }))

function check(input) {
  return kind.check({ target: "", details: {}, bytes: null, files: {}, ...input }, ctx)
}

const f8thful = jsonOf(copyOf("f8thful"))

describe("checking a font", () => {
  test("decodes the PNGs the repo uses, palette, grey and colour key ones included", () => {
    for (const file of ["public/font/minecraft-ten/font.png", "public/font/minecraft-ten/textures/haunted.png", "public/font/f8thful/textures/flat.png"]) {
      const bytes = fs.readFileSync(file)
      assert.ok(Buffer.from(decodePng(new Uint8Array(bytes)).data).equals(PNG.sync.read(bytes).data), file)
    }
  })

  test("a whole font from the font editor passes and gets its template size", async () => {
    const { problems, details, target } = await check({ bytes: f8thful })
    assert.deepEqual(Object.values(problems).filter(Boolean), [])
    assert.equal(target, "")
    assert.deepEqual(details, { id: "test-font", template: { width: 566, height: 356, rows: 92 } })
  })

  test("the id comes from the JSON, and has to be a slug no published font has", async () => {
    assert.equal((await check({ bytes: withFields(f8thful, { id: "f8thful" }) })).problems.id, "F8thful already has the ID f8thful. Change it in the font editor's Font tab.")
    assert.match((await check({ bytes: withFields(f8thful, { id: "My Font" }) })).problems.id, /lowercase letters and numbers/)
    assert.match((await check({ bytes: withFields(f8thful, { id: "custom-thing" }) })).problems.id, /kept for the site/)
    assert.equal((await check({ bytes: withFields(f8thful, { id: "", name: "Shiny Font" }) })).details.id, "shiny-font")
    assert.match((await check({ bytes: withFields(f8thful, { id: "", name: "" }) })).problems.id, /The font has no ID/)
    assert.equal((await check({ bytes: f8thful, details: { id: "forged" } })).details.id, "test-font")
    assert.equal((await check({ details: { id: "kept-from-before" } })).problems.id, null)
  })

  test("letters left blank are named", async () => {
    const font = copyOf("f8thful")
    const { problems } = await check({ bytes: jsonOf({ ...font, glyphs: { ...font.glyphs, q: { ...font.glyphs.q, rows: font.glyphs.q.rows.map(row => "0".repeat(row.length)) } } }) })
    assert.match(problems.file, /These are blank: q\./)
  })

  test("a font with nothing drawn says so", async () => {
    const font = copyOf("f8thful")
    const blank = Object.fromEntries(Object.entries(font.glyphs).map(([char, glyph]) => [char, { ...glyph, rows: glyph.rows.map(row => "0".repeat(row.length)) }]))
    assert.equal((await check({ bytes: jsonOf({ ...font, glyphs: blank }) })).problems.file, "None of the characters are drawn yet.")
  })

  test("another alphabet doesn't need a to z", async () => {
    assert.equal((await check({ target: "minecraft-ten", bytes: jsonOf(copyOf("minecraft-ten-cyrillic")) })).problems.file, null)
  })

  test("kerning that pushes letters into each other is refused", async () => {
    const font = copyOf("f8thful")
    assert.match((await check({ bytes: jsonOf({ ...font, kerning: { ...font.kerning, lt: 60 } }) })).problems.file, /push their characters into each other: lt/)
  })

  test("a file that isn't from the font editor says so", async () => {
    assert.match((await check({ bytes: new TextEncoder().encode("{ \"id\": \"x\" }") })).problems.file, /no font sheet in it/)
    assert.match((await check({ bytes: new TextEncoder().encode("nope") })).problems.file, /isn't a font editor JSON file/)
  })

  test("variants have to be of a font that isn't a variant itself", async () => {
    assert.match((await check({ target: "minecraft-ten-v2", bytes: f8thful })).problems.target, /Pick the font/)
  })

  test("bundled textures, overlays and strips are checked against the font's template", async () => {
    const extras = [{ key: "a", kind: "texture", name: "Gold", border: "#AABBCC" }, { key: "b", kind: "overlay", name: "Sparkle", border: "#000000" }, { key: "c", kind: "strip", name: "Stripes", border: "#000000", credit: "Someone Else" }]
    const files = { a: plainPng(566 * 2, 356 * 2), b: plainPng(566, 356), c: plainPng(1, 92 * 4) }
    const { problems, details } = await check({ bytes: f8thful, details: { id: "x", extras, files: { forged: "abc" } }, files })
    assert.deepEqual(Object.values(problems).filter(Boolean), [])
    assert.deepEqual(details.extras, [{ key: "a", kind: "texture", name: "Gold", border: "#aabbcc", density: 2 }, { key: "b", kind: "overlay", name: "Sparkle" }, { key: "c", kind: "strip", name: "Stripes", credit: "Someone Else", border: "#000000" }])
    assert.equal(details.files, undefined)
    assert.deepEqual(kind.fileKeys(details), ["a", "b", "c"])
    const wrong = await check({ bytes: f8thful, details: { id: "x", extras }, files: { a: plainPng(500, 356), b: plainPng(566, 356), c: plainPng(1, 90) } })
    assert.match(wrong.problems["extra:a"], /template size, 566x356/)
    assert.match(wrong.problems["extra:c"], /23, 46, 92, 184, .* or 2944 pixels tall, and this one is 90/)
  })

  test("bundled files need names of their own and a PNG", async () => {
    const extras = [{ key: "a", kind: "texture", name: "Flat", border: "#000000" }, { key: "b", kind: "texture", name: "Gold", border: "#000000" }, { key: "c", kind: "overlay", name: "gold" }]
    const { problems } = await check({ bytes: f8thful, details: { id: "x", extras }, files: { a: plainPng(566, 356), c: plainPng(566, 356) } })
    assert.match(problems["extra:a"], /built in/)
    assert.match(problems["extra:b"], /Choose a PNG for Gold/)
    assert.match(problems["extra:c"], /would get the same id/)
    const kept = await check({ details: { id: "x", extras: extras.slice(1, 2), files: { b: "sha" }, template: { width: 566, height: 356, rows: 92 } } })
    assert.equal(kept.problems["extra:b"], undefined)
  })

  test("opens in the generator as a custom font", () => {
    const line = client.line({ target: "", details: { id: "x" } }, "data:application/json;base64,e30=", "Hello")
    assert.equal(line.text, "Hello")
    assert.equal(line.customFont.kind, "json")
    assert.match(line.font, /^custom-/)
    assert.equal(client.summary({ target: "minecraft-ten", details: {} }, fonts), "A font listed under Minecraft Ten")
  })
})

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "font-submission-"))
  const skip = file => !file.split(/[\\/]/).includes("thumbnails")
  fs.cpSync(LIST, path.join(root, LIST))
  fs.cpSync("public/font/minecraft-ten", path.join(root, "public/font/minecraft-ten"), { recursive: true, filter: skip })
  fs.cpSync("public/strips", path.join(root, "public/strips"), { recursive: true })
  return root
}

function addEntry(root, entry, parent = null) {
  const list = JSON.parse(fs.readFileSync(path.join(root, LIST), "utf8"))
  if (parent) list.find(item => item.id === parent).variants.push(entry)
  else list.push(entry)
  fs.writeFileSync(path.join(root, LIST), `${jsonText(list)}\n`)
}

function hold(root, id, bytes) {
  fs.mkdirSync(path.join(root, "submissions/fonts"), { recursive: true })
  fs.writeFileSync(path.join(root, `submissions/fonts/${id}.json`), bytes)
  return `submissions/fonts/${id}.json`
}

function readPngFile(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function assertPublishable(root, id) {
  const list = flattenFonts(JSON.parse(fs.readFileSync(path.join(root, LIST), "utf8")))
  const entry = list.find(item => item.id === id)
  const folder = path.join(root, "public/font", ...(entry.variant ? [entry.variant, entry.id] : [entry.id]))
  const png = readPngFile(path.join(folder, "font.png"))
  const { list: cells, capHeight } = parseMask(png.data, png.width, png.height, fullOrder(entry, list), defaultBorder("top", entry))
  assert.equal(cells.length, Array.from(fullOrder(entry, list)).length)
  const flat = readPngFile(path.join(folder, "textures/flat.png"))
  for (const [glyph, at] of sheetLayout(cells, capHeight, defaultDepth(entry))) assert.deepEqual(solidMask(flat.data, flat.width, 1, at.x, at.top, glyph.width, glyph.height), glyph.mask, `${id} ${glyph.char}`)
  return { entry, list, folder, png, flat }
}

describe("the workflow step", () => {
  test("turns a held font and its bundle into the font's files and fonts.json entry", async () => {
    const root = tempRoot()
    addEntry(root, { id: "test-font", name: "Testing", author: "Someone" })
    const held = hold(root, "test-font", f8thful)
    const folder = path.join(root, "public/font/test-font")
    fs.mkdirSync(path.join(folder, "textures"), { recursive: true })
    fs.writeFileSync(path.join(folder, "textures.json"), `${jsonText({ textures: { flat: { border: "#000000" }, gold: { author: "Someone", density: 2, border: "#000000" } }, overlays: {} })}\n`)
    fs.writeFileSync(path.join(folder, "textures/gold.png"), plainPng(566 * 2, 356 * 2))
    const ran = []
    await prepare({ root, changed: [LIST, held, "public/font/test-font/textures.json"], node: (...args) => ran.push(args) })
    assert.deepEqual(ran, [["generator/thumbnails.js", "test-font"]])
    assert.ok(!fs.existsSync(path.join(root, held)))
    const { entry, flat } = assertPublishable(root, "test-font")
    const source = published.find(item => item.id === "f8thful")
    assert.deepEqual(Object.keys(entry).slice(0, 4), ["id", "name", "author", "basedOn"])
    assert.equal(entry.basedOn, "f8thful")
    assert.equal(entry.order, source.order)
    assert.deepEqual(entry.kerning, source.kerning)
    assert.deepEqual([flat.width, flat.height], [566, 356])
    assert.ok(JSON.parse(fs.readFileSync(path.join(folder, "textures.json"), "utf8")).textures.gold)
  })

  test("refuses a bundled texture that doesn't fit the converted font", async () => {
    const root = tempRoot()
    addEntry(root, { id: "test-font", author: "Someone" })
    const held = hold(root, "test-font", f8thful)
    const folder = path.join(root, "public/font/test-font")
    fs.mkdirSync(path.join(folder, "textures"), { recursive: true })
    fs.writeFileSync(path.join(folder, "textures.json"), `${jsonText({ textures: { flat: { border: "#000000" }, gold: { author: "Someone", border: "#000000" } }, overlays: {} })}\n`)
    fs.writeFileSync(path.join(folder, "textures/gold.png"), plainPng(500, 300))
    await assert.rejects(prepare({ root, changed: [held], node: () => {} }), /gold.png is 500x300/)
  })

  test("drops blank characters and starts a separate variant with a flat texture", async () => {
    const root = tempRoot()
    addEntry(root, { id: "ten-greek", name: "Greek", author: "Someone" }, "minecraft-ten")
    const held = hold(root, "ten-greek", jsonOf(copyOf("minecraft-ten-cyrillic")))
    await prepare({ root, changed: [held], node: () => {} })
    const { entry, folder } = assertPublishable(root, "ten-greek")
    assert.ok(!Array.from(entry.order).includes("a"))
    assert.equal(entry.preview, "ёєі")
    assert.equal(entry.basedOn, "minecraft-ten-cyrillic")
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, "textures.json"), "utf8")), { textures: { flat: { border: "#000000" } }, overlays: {} })
  })
})

const REPO = "owner/repo"
const API = "https://github.test"
const realFetch = globalThis.fetch

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

function assets(url) {
  const file = path.join("public", decodeURIComponent(new URL(url).pathname))
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response("missing", { status: 404 })
}

let env
let gh
let profile

function context(url, { method = "GET", body, cookie, params = {}, headers = {} } = {}) {
  const request = new Request(`https://mctitlegenerator.com${url}`, { method, body, headers: { ...(cookie && { Cookie: cookie }), ...headers } })
  return { request, env, params, waitUntil: () => {} }
}

async function signIn(provider = "discord", person = { id: "1234", username: "someone", email: "someone@example.com", verified: true }) {
  profile = person
  const started = await startSignIn(context(`/api/account/login/${provider}?return=${encodeURIComponent("https://mctitlegenerator.com")}`, { params: { provider } }))
  const state = new URL(started.headers.get("Location")).searchParams.get("state")
  const stateCookie = started.headers.getSetCookie().find(line => line.startsWith("signin_state=")).split(";")[0]
  const back = await receiveSignIn(context(`/api/account/login/${provider}/callback?${new URLSearchParams({ code: "abc", state })}`, { params: { provider } }))
  const { pathname, search } = new URL(back.headers.get("Location"))
  const done = await finishSignIn(context(`${pathname}${search}`, { cookie: stateCookie, params: { provider } }))
  return done.headers.getSetCookie().find(line => line.startsWith("session=")).split(";")[0]
}

function form({ target = "", details = { id: "test-font" }, name = "Test Font", file = f8thful, extras = {} } = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ kind: "font", target, name, credit: "Someone", notes: "", agree: "true", details: JSON.stringify(details) })) data.set(key, value)
  if (file) data.set("file", new Blob([file], { type: "application/json" }), "font.json")
  for (const [key, bytes] of Object.entries(extras)) data.set(`extra:${key}`, new Blob([bytes], { type: "image/png" }), `${key}.png`)
  return data
}

async function send(cookie, fields) {
  const response = await createSubmission(context("/api/submissions", { method: "POST", body: form(fields), cookie }))
  return { status: response.status, ...await response.json() }
}

function branchFile(id, file) {
  const sha = gh.filesAt(`submission/${id}`).get(file)
  return sha ? Buffer.from(gh.blobs.get(sha)) : null
}

function sha1(bytes) {
  return createHash("sha1").update(bytes).digest("hex")
}

describe("sending a font", () => {
  beforeEach(() => {
    const sqlite = new DatabaseSync(":memory:")
    sqlite.exec(fs.readFileSync("schema.sql", "utf8"))
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
    gh = fakeGitHub(publicKey, { repo: REPO, api: API, files: [LIST] })
    env = { DB: d1(sqlite), ASSETS: { fetch: url => assets(String(url)) }, SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "github-secret", GITHUB_APP_ID: "123", GITHUB_APP_KEY: privateKey, GITHUB_WEBHOOK_SECRET: "hook-secret", GITHUB_REPOSITORY: REPO, GITHUB_API: API, RESEND_API_KEY: "resend-key" }
    globalThis.fetch = async (url, options) => {
      const text = String(url)
      if (text.startsWith(API)) return gh.handle(text, options)
      return new Response(JSON.stringify(options?.method === "POST" ? { access_token: "token" } : String(url).endsWith("/user/emails") ? profile.emails ?? [{ email: `${profile.login}@example.com`, primary: true, verified: true }] : profile), { status: 200, headers: { "Content-Type": "application/json" } })
    }
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("holds only the font editor's fields from the JSON, at every level", async () => {
    const cookie = await signIn()
    const original = JSON.parse(Buffer.from(f8thful).toString())
    const padded = { ...original, secret: "dropped", kerning: { ...original.kerning, note: "dropped" }, editor: { ...original.editor, hidden: { deep: "dropped" } } }
    const { status, id } = await send(cookie, { file: new TextEncoder().encode(JSON.stringify(padded)) })
    assert.equal(status, 201)
    const held = branchFile(id, "submissions/fonts/test-font.json").toString()
    assert.doesNotMatch(held, /secret|extra|note|hidden|dropped/)
    assert.deepEqual(Object.keys(JSON.parse(held).editor), Object.keys(original.editor))
    assert.deepEqual(fontJsonFields({ strips: ["minecraft-ten", { id: "other", offset: 1, extra: true }, 5], name: 3 }), { strips: ["minecraft-ten", { id: "other", offset: 1 }] })
  })

  test("holds the JSON and adds the font to the end of fonts.json, with its bundle in its folder", async () => {
    const cookie = await signIn()
    const extras = { gold: plainPng(566, 356), sparkle: plainPng(566 * 2, 356 * 2) }
    const details = { id: "test-font", extras: [{ key: "gold", kind: "texture", name: "Gold Bricks", border: "#3d1f0a" }, { key: "sparkle", kind: "overlay", name: "Sparkle", credit: "Helper" }] }
    const { status, id } = await send(cookie, { details, extras })
    assert.equal(status, 201)
    const list = JSON.parse(branchFile(id, LIST).toString())
    assert.deepEqual(list.at(-1), { id: "test-font", author: "Someone" })
    assert.deepEqual(branchFile(id, "submissions/fonts/test-font.json"), Buffer.from(f8thful))
    assert.deepEqual(JSON.parse(branchFile(id, "public/font/test-font/textures.json").toString()), { textures: { flat: { border: "#000000" }, gold_bricks: { author: "Someone", border: "#3d1f0a" } }, overlays: { sparkle: { author: "Helper", density: 2 } } })
    assert.equal(sha1(branchFile(id, "public/font/test-font/overlays/sparkle.png")), sha1(extras.sparkle))
    assert.ok(branchFile(id, "public/font/test-font/textures/gold_bricks.png"))
    assert.equal(gh.pulls.get(1).title, "Test Font font")
    assert.equal(gh.commits.get(gh.refs.get(`heads/submission/${id}`)).message, "add Test Font font")
  })

  test("refuses a bundled file that wasn't sent", async () => {
    const cookie = await signIn()
    const { status, error } = await send(cookie, { details: { id: "test-font", extras: [{ key: "gold", kind: "texture", name: "Gold", border: "#000000" }] } })
    assert.equal(status, 400)
    assert.match(error, /Choose a PNG for Gold/)
  })

  test("puts variants under their parent and keeps ids apart from other open font submissions", async () => {
    const cookie = await signIn()
    const first = await send(cookie, { target: "minecraft-ten", name: "Alt", file: jsonOf(copyOf("minecraft-ten-cyrillic"), "ten-alt") })
    assert.equal(first.status, 201)
    const parent = JSON.parse(branchFile(first.id, LIST).toString()).find(item => item.id === "minecraft-ten")
    assert.deepEqual(parent.variants.at(-1), { id: "ten-alt", name: "Alt", author: "Someone" })
    assert.equal(gh.pulls.get(1).title, "Alt font for Minecraft Ten")
    const second = await send(cookie, { name: "Ten Alt", file: jsonOf(copyOf("f8thful"), "ten-alt") })
    assert.equal(second.status, 201)
    assert.deepEqual(JSON.parse(branchFile(second.id, LIST).toString()).at(-1), { id: "ten-alt-2", name: "Ten Alt", author: "Someone" })
    assert.ok(branchFile(second.id, "submissions/fonts/ten-alt-2.json"))
  })

  test("keeps bundled files on edits that don't send them again", async () => {
    const cookie = await signIn()
    const details = { id: "test-font", extras: [{ key: "gold", kind: "texture", name: "Gold", border: "#000000" }] }
    const { id } = await send(cookie, { details, extras: { gold: plainPng(566, 356) } })
    const kept = JSON.parse((await env.DB.prepare("SELECT details FROM submissions WHERE id = ?").bind(id).first()).details)
    const response = await editSubmission(context(`/api/submissions/${id}`, { method: "PATCH", body: form({ name: "Renamed Font", file: null, details: { ...kept, extras: [{ ...kept.extras[0], name: "Golden" }] } }), cookie, params: { id: String(id) } }))
    assert.equal(response.status, 200)
    assert.ok(branchFile(id, "public/font/test-font/textures/golden.png"))
    assert.equal(gh.pulls.get(1).title, "Renamed Font font")
  })
})
