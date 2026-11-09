import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { publishedFonts, readMask } from "../generator/fonts.js"
import { parseMask, splitCells } from "../src/lib/font.js"
import { buildSheet, exportJson, fontFromPublished } from "../src/lib/fontEditor.js"
import { jsonText } from "../src/lib/jsonText.js"
import { titleCase } from "../src/lib/names.js"
import { SUBMISSION_KINDS, checkSubmission, submissionContext } from "../src/lib/submissionKinds/index.js"

const ROOT = path.join(import.meta.dirname, "..")
const PULL = "https://github.com/ewanhowell5195/MinecraftTitleGenerator/pull/222"
const PREVIEW = "https://submission-1.minecrafttitlegenerator.pages.dev/app/"
const READY = new Set(["clean", "behind", "has_hooks"])
const HOUR = 3600000
const ME = { id: "discord:1", provider: "discord", name: "ewanhowell5195", avatar: "https://cdn.discordapp.com/embed/avatars/1.png" }

function asset(file) {
  return new Uint8Array(fs.readFileSync(path.join(ROOT, "public", file)))
}

function fontJson(id, fields) {
  const published = publishedFonts()
  const entry = published.find(item => item.id === id)
  const { png, cells } = readMask(entry, published)
  const zero = parseMask(png.data, png.width, png.height, cells.map(cell => cell.char).join(""), 0)
  const { glyphs } = splitCells(entry, published, zero.list)
  const font = { ...fontFromPublished({ ...entry, name: entry.name ?? titleCase(entry.id) }, Object.values(glyphs), zero.capHeight), ...fields }
  const sheet = buildSheet(font)
  const image = new PNG({ width: sheet.width, height: sheet.height })
  image.data.set(sheet.data)
  return new TextEncoder().encode(`${jsonText(exportJson(font, `data:image/png;base64,${PNG.sync.write(image).toString("base64")}`))}\n`)
}

const SEEDS = [
  { kind: "texture", target: "minecraft-ten", name: "Gold Bricks", credit: "Someone", notes: "First go at a texture, based on the bevelled gold one.", details: { border: "#3d1f0a" }, file: "font/minecraft-ten/textures/bevelled_gold.png", owner: ["someone", "github"], state: "clean", age: 30, comments: [["someone", "submitter", "Is the border colour too dark?", ""], ["ewanhowell5195", "reviewer", "Looks good to me, the border works.", PULL]] },
  { kind: "overlay", target: "minecraft-ten", name: "Bevel Again", credit: "Overlay Fan", notes: "", details: {}, file: "font/minecraft-ten/overlays/bevel.png", owner: ["overlayfan", "discord"], state: "unstable", age: 20 },
  { kind: "strip", target: "set:minecraft-ten", name: "Acacia Strip", credit: "Me", notes: "", details: { border: "#000000" }, file: "strips/minecraft-ten/textures/acacia_planks.png", mine: true, status: "published", age: 200 },
  { kind: "tileable", target: "", name: "Classic Cobble", credit: "Me", notes: "Cobblestone from beta.", details: {}, file: "tileables/minecraft/classic_cobblestone.png", mine: true, status: "rejected", age: 150, comments: [["ewanhowell5195", "reviewer", "This is already in the Minecraft textures list, so it isn't needed here.", ""]] },
  { kind: "font", target: "", name: "Shiny Serif", credit: "Me and a friend", notes: "A serif font with a texture, an overlay and a strip.", details: { extras: [{ key: "gold", kind: "texture", name: "Gold", border: "#3d1f0a" }, { key: "shine", kind: "overlay", name: "Sparkle" }, { key: "bands", kind: "strip", name: "Bands", border: "#000000", credit: "Strip Maker" }] }, json: ["f8thful", { id: "shiny-serif", name: "Shiny Serif" }], extras: { gold: "font/f8thful/textures/flat.png", shine: "font/f8thful/textures/flat.png", bands: "strips/minecraft-ten/textures/acacia_planks.png" }, mine: true, state: "unknown", age: 6, comments: [["ewanhowell5195", "reviewer", "Can you check the kerning on the lowercase t? It looks a bit close to the next letter in a few pairs, especially before an a or an o.\n\nEverything else looks great.", PULL]] },
  { kind: "font", target: "minecraft-ten", name: "Ten Greek", credit: "Alphabet Person", notes: "", details: {}, json: ["minecraft-ten-cyrillic", { id: "ten-greek", name: "Ten Greek" }], owner: ["alphabets", "github"], state: "dirty", age: 4, comments: [["", "submitter", "Sent before I deleted my account.", ""]] },
  { kind: "texture", target: "minecraft-five", name: "Five Flat", credit: "Gone", notes: "", details: { border: "#000000" }, file: "font/minecraft-five/textures/flat.png", owner: [null, null], state: "blocked", age: 3 },
  { kind: "texture", target: "minecraft-ten", name: "An Extremely Long Name For A Texture Xx", credit: "Somebody With A Very Long Credit Line That Goes On And On Xx", notes: "Notes can be long too. ".repeat(21).trim(), details: { border: "#ffffff" }, file: "font/minecraft-ten/textures/bevelled_gold.png", owner: ["averyveryverylongusernamehere", "discord"], state: "behind", age: 2 },
  { kind: "texture", target: "minecraft-ten", name: "Flat Copy", credit: "Me", notes: "", details: { border: "#000000" }, file: "font/minecraft-ten/textures/flat.png", mine: true, state: "clean", age: 1 }
]

const NEWS = [[1, "comment", "someone", "Is the border colour too dark?", false, 0.5], [9, "submitted", "ewanhowell5195", "", false, 1], [2, "submitted", "overlayfan", "", false, 20], [8, "edited", "averyveryverylongusernamehere", "", true, 2], [5, "changes", "ewanhowell5195", "Can you check the kerning on the lowercase t?", false, 5], [3, "published", "ewanhowell5195", "", true, 190], [4, "rejected", "ewanhowell5195", "This is already in the Minecraft textures list, so it isn't needed here.", true, 140]]

async function build() {
  const fonts = publishedFonts().map(entry => ({ ...entry, name: entry.name ?? titleCase(entry.id) }))
  const ctx = submissionContext(fonts, async file => new Response(fs.readFileSync(path.join(ROOT, "public", file))))
  const now = Date.now()
  const list = []
  for (const [index, seed] of SEEDS.entries()) {
    const bytes = seed.json ? fontJson(...seed.json) : asset(seed.file)
    const files = Object.fromEntries(Object.entries(seed.extras ?? {}).map(([key, file]) => [key, asset(file)]))
    const { problems, clean } = await checkSubmission({ kind: seed.kind, target: seed.target, details: seed.details, bytes, files, name: seed.name, credit: seed.credit, notes: seed.notes, agree: true }, ctx)
    if (Object.keys(problems).length) console.warn(`mock submission ${seed.name} wouldn't pass:`, problems)
    const [ownerName, ownerProvider] = seed.mine ? [ME.name, ME.provider] : seed.owner
    const id = index + 1
    list.push({ id, kind: seed.kind, target: clean.target ?? seed.target, asset: "", name: seed.name, credit: seed.credit, notes: seed.notes, details: { ...seed.details, ...clean.details, ...(Object.keys(files).length && { files: Object.fromEntries(Object.keys(files).map(key => [key, `${key}-1`])) }) }, version: 1, status: seed.status ?? "open", pull: 222, createdAt: now - seed.age * HOUR, updatedAt: now - seed.age * HOUR, ownerName, ownerProvider, mine: !!seed.mine, state: seed.state ?? null, bytes, files, comments: (seed.comments ?? []).map(([author, role, body, url], at) => ({ id: id * 100 + at, author, role, body, url, createdAt: now - (seed.age - at - 0.2) * HOUR })) })
  }
  const notifications = NEWS.map(([submission, kind, author, body, seen, age], index) => ({ id: index + 1, submission, kind, author, body, url: "", seen, createdAt: now - age * HOUR }))
  return { list, notifications, signedIn: true, nextId: list.length + 1, ctx }
}

function shown(item) {
  const { bytes, files, state, version, comments, ...rest } = item
  return { ...rest, file: `mock-${item.id}-${version}`, pullUrl: item.pull ? PULL : null, previewUrl: item.status === "open" ? PREVIEW : null }
}

function send(res, status, body, type = "application/json") {
  res.statusCode = status
  res.setHeader("Content-Type", type)
  res.setHeader("Cache-Control", "no-store")
  res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

async function requestOf(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return new Request(`http://localhost${req.url}`, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === "string")), body: chunks.length ? Buffer.concat(chunks) : undefined })
}

async function formFields(request) {
  const form = await request.formData()
  const file = form.get("file")
  const files = {}
  for (const [field, value] of form.entries()) if (field.startsWith("extra:")) files[field.slice(6)] = new Uint8Array(await value.arrayBuffer())
  return { kind: form.get("kind"), target: form.get("target") ?? "", details: JSON.parse(form.get("details") ?? "{}"), name: form.get("name"), credit: form.get("credit"), notes: form.get("notes") ?? "", agree: form.get("agree") === "true", bytes: file?.size ? new Uint8Array(await file.arrayBuffer()) : null, files }
}

export function mockSubmissions() {
  let state = null
  return {
    name: "mock-submissions",
    apply: "serve",
    configureServer(server) {
      if (server.config.mode !== "mock") return
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost")
        if (!/^\/api\/(account|notifications|submissions)/.test(url.pathname)) return next()
        try {
          state ??= await build()
          const { list, notifications } = state
          const parts = url.pathname.split("/").filter(Boolean).slice(1)
          const unread = notifications.filter(item => !item.seen).length
          if (parts[0] === "account") {
            if (parts[1] === "logout") {
              state.signedIn = false
              return send(res, 200, { user: null })
            }
            if (parts[1] === "login") {
              state.signedIn = true
              res.statusCode = 302
              res.setHeader("Location", "/submissions/")
              return res.end()
            }
            return send(res, 200, { user: state.signedIn ? { ...ME, unread, notifications: notifications.length, submissions: list.filter(item => item.mine).length, admin: true } : null, providers: ["discord", "github"] })
          }
          if (!state.signedIn && !(parts[0] === "submissions" && parts[1] && req.method === "GET")) return send(res, 401, { error: "Sign in to see submissions." })
          if (parts[0] === "notifications") {
            if (req.method === "DELETE") {
              notifications.length = 0
              return send(res, 200, { notifications: [] })
            }
            if (req.method === "POST") notifications.forEach(item => item.seen = true)
            return send(res, 200, req.method === "POST" ? { unread: 0 } : { notifications: notifications.filter(item => list.some(entry => entry.id === item.submission)).map(item => ({ ...item, submissionName: list.find(entry => entry.id === item.submission).name })).sort((a, b) => b.createdAt - a.createdAt) })
          }
          if (!parts[1]) {
            if (req.method === "POST") {
              const fields = await formFields(await requestOf(req))
              const { problems, clean } = await checkSubmission(fields, state.ctx)
              const problem = Object.values(problems)[0]
              if (problem) return send(res, 400, { error: problem })
              const id = state.nextId++
              list.push({ id, ...clean, asset: "", details: { ...clean.details, ...(Object.keys(fields.files).length && { files: Object.fromEntries(Object.keys(fields.files).map(key => [key, `${key}-1`])) }) }, version: 1, status: "open", pull: 222, createdAt: Date.now(), updatedAt: Date.now(), ownerName: ME.name, ownerProvider: ME.provider, mine: true, state: "unknown", bytes: fields.bytes, files: fields.files, comments: [] })
              return send(res, 201, { id, pull: 222 })
            }
            const wanted = url.searchParams.has("review") ? list.filter(item => item.status === "open") : list.filter(item => item.mine).reverse()
            return send(res, 200, { submissions: wanted.map(shown) })
          }
          const item = list.find(entry => entry.id === Number(parts[1]))
          if (!item) return send(res, 404, { error: "This submission doesn't exist." })
          if (parts[2] === "file") return send(res, 200, Buffer.from(item.bytes), SUBMISSION_KINDS[item.kind].accept)
          if (parts[2] === "files") return send(res, 200, Buffer.from(item.files[parts[3]] ?? []), "image/png")
          if (parts[2] === "comments") {
            const { body } = await (await requestOf(req)).json()
            item.comments.push({ id: Date.now(), author: ME.name, role: item.mine ? "submitter" : "reviewer", body: String(body).trim(), url: "", createdAt: Date.now() })
            return send(res, 201, { comments: item.comments })
          }
          if (parts[2] === "review") {
            if (req.method === "GET") return send(res, 200, { state: item.status === "open" ? item.state : null })
            const { action, comment } = await (await requestOf(req)).json()
            if (action === "merge" && !READY.has(item.state)) return send(res, 409, { error: "GitHub can't merge this yet. Wait for its checks to finish, or open the pull request to see why." })
            item.status = action === "merge" ? "published" : "rejected"
            if (action === "merge") state.notifications = state.notifications.filter(entry => entry.submission !== item.id)
            if (comment?.trim()) item.comments.push({ id: Date.now(), author: ME.name, role: "reviewer", body: comment.trim(), url: "", createdAt: Date.now() })
            return send(res, 200, { submission: shown(item), comments: item.comments })
          }
          if (req.method === "DELETE") {
            list.splice(list.indexOf(item), 1)
            return send(res, 200, { id: item.id })
          }
          if (req.method === "PATCH") {
            const fields = await formFields(await requestOf(req))
            Object.assign(item, { name: fields.name, credit: fields.credit, notes: fields.notes, details: { ...item.details, ...fields.details }, updatedAt: Date.now() })
            if (fields.bytes) Object.assign(item, { bytes: fields.bytes, version: item.version + 1 })
            return send(res, 200, { submission: shown(item) })
          }
          return send(res, 200, { submission: shown(item), comments: item.comments, reviewer: state.signedIn })
        } catch (err) {
          console.error(err)
          send(res, 500, { error: err.message })
        }
      })
    }
  }
}
