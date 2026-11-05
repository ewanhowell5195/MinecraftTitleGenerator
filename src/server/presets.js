import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity"
import { LIMITS } from "../lib/limits.js"
import { decodeTitle, unknownSetting } from "../lib/linkformat.js"
import { FILE_VERSION, typeDefaults } from "../lib/settings.js"

export { LIMITS }

const SORTS = { week: "week DESC, id DESC", popular: "downloads DESC, id DESC", top: "rating DESC, votes DESC, id DESC", new: "created_at DESC, id DESC", needs: "votes, id" }
const MATCHES = "lower(name) LIKE ?1 ESCAPE '\\' OR lower(text) LIKE ?1 ESCAPE '\\'"
const EDGE_SECONDS = 300
const DAY = 86400000
const WEEK_DAYS = 7
const NEWEST_PAGE = "?sort=new&offset=0"
const COLUMNS = "id, code, name, text, credit, downloads, votes, rating, created_at AS createdAt"

const rude = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

class Refusal extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function guarded(handler) {
  return async context => {
    try {
      return await handler(context)
    } catch (err) {
      if (err instanceof Refusal) return reply(err.status, { error: err.message })
      throw err
    }
  }
}

async function hashed(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

export function titleFingerprint(code) {
  return hashed(JSON.stringify(canonical(decodeTitle(code).lines)))
}

async function hashedIp({ request, env }) {
  if (!env.IP_SALT) throw new Error("IP_SALT is not set")
  const ip = request.headers.get("CF-Connecting-IP")
  if (!ip) throw new Error("the request has no CF-Connecting-IP header")
  return hashed(`${env.IP_SALT}:${ip}`)
}

function wordsOf(line) {
  return line.words ? line.words.map(word => ({ ...line, ...word })) : [line]
}

function textOf(word, fallback) {
  return (typeof word.text === "string" ? word.text : fallback).trim()
}

export function titleFacts(lines) {
  const fallback = typeDefaults("top").text
  const texts = lines.map(line => wordsOf(line).filter(word => !word.hidden).map((word, index) => (index && word.spaceBefore ? " " : "") + textOf(word, fallback)).join("").trim())
  const everything = lines.flatMap(wordsOf).map(word => textOf(word, fallback))
  return {
    text: texts.filter(Boolean).join(" "),
    all: everything.join(" "),
    words: everything.length,
    characters: everything.reduce((total, text) => total + Array.from(text).length, 0)
  }
}

export function checkTitle(code) {
  if (typeof code !== "string" || !code) throw new Refusal(400, "There is no title in this preset.")
  if (code.length > LIMITS.code) throw new Refusal(400, "This title has too many settings to share.")
  let title
  try {
    title = decodeTitle(code)
  } catch {
    throw new Refusal(400, "This title is damaged, so it can't be shared.")
  }
  if (title.version > FILE_VERSION) throw new Refusal(400, "This title was made by a newer version of the generator. Reload the page and try again.")
  const unknown = unknownSetting(title.lines)
  if (unknown) throw new Refusal(400, `This title has a setting that can't be shared: ${unknown}.`)
  if (title.lines.length > LIMITS.lines) throw new Refusal(400, `A shared title can have up to ${LIMITS.lines} lines.`)
  const facts = titleFacts(title.lines)
  if (facts.words > LIMITS.words) throw new Refusal(400, `A shared title can have up to ${LIMITS.words} words.`)
  if (facts.characters > LIMITS.characters) throw new Refusal(400, `A shared title can have up to ${LIMITS.characters} characters of text.`)
  if (!facts.text) throw new Refusal(400, "This title has no text in it.")
  return facts
}

function checkWords(label, text) {
  if (rude.hasMatch(text)) throw new Refusal(400, `The ${label} has a word in it that isn't allowed.`)
}

function textField(body, key, label, limit) {
  const value = body[key] ?? ""
  if (typeof value !== "string") throw new Refusal(400, `The ${label} has to be text.`)
  const trimmed = value.trim()
  if (Array.from(trimmed).length > limit) throw new Refusal(400, `The ${label} can be up to ${limit} characters.`)
  return trimmed
}

async function jsonBody(request) {
  const text = await request.text()
  if (text.length > LIMITS.body) throw new Refusal(413, "This request is too big.")
  try {
    const body = JSON.parse(text)
    if (body && typeof body === "object" && !Array.isArray(body)) return body
  } catch {}
  throw new Refusal(400, "This request isn't valid.")
}

function presetId(params) {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id < 1) throw new Refusal(404, "This preset doesn't exist.")
  return id
}

async function requirePreset(env, id) {
  const found = await env.DB.prepare("SELECT id FROM presets WHERE id = ?").bind(id).first()
  if (!found) throw new Refusal(404, "This preset doesn't exist.")
}

function rated(row) {
  return { ...row, rating: row.rating < 0 ? null : row.rating }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nextDay() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

async function usedToday(env, ip) {
  return (await env.DB.prepare("SELECT count FROM preset_submissions WHERE ip_hash = ? AND day = ?").bind(ip, today()).first())?.count ?? 0
}

function likePattern(term) {
  return `%${term.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`
}

function shuffled(items) {
  const list = items.slice()
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[list[index], list[other]] = [list[other], list[index]]
  }
  return list
}

function randomIds(highest, count) {
  if (highest <= count) return Array.from({ length: highest }, (_, index) => index + 1)
  const ids = new Set()
  while (ids.size < count) ids.add(Math.floor(Math.random() * highest) + 1)
  return Array.from(ids)
}

async function randomPresets({ env }, term) {
  const select = `SELECT ${COLUMNS} FROM presets`
  if (term) return (await env.DB.prepare(`${select} WHERE ${MATCHES} ORDER BY RANDOM() LIMIT ${LIMITS.page}`).bind(likePattern(term)).all()).results
  const { highest } = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS highest FROM presets").first()
  if (!highest) return []
  const ids = randomIds(highest, LIMITS.page)
  return shuffled((await env.DB.prepare(`${select} WHERE id IN (${ids.join(", ")})`).all()).results)
}

async function cachedAtEdge(context, build) {
  const cache = globalThis.caches?.default
  const key = new Request(context.request.url)
  const hit = await cache?.match(key)
  if (hit) return unstored(hit)
  const response = await build()
  if (!response.ok || !cache) return response
  const shared = response.clone()
  shared.headers.set("Cache-Control", `public, max-age=${EDGE_SECONDS}`)
  const saving = cache.put(key, shared)
  if (context.waitUntil) context.waitUntil(saving)
  else await saving
  return unstored(response)
}

function unstored(response) {
  const copy = new Response(response.body, response)
  copy.headers.set("Cache-Control", "no-store")
  return copy
}

function dayNumber() {
  return Math.floor(Date.now() / DAY)
}

export const listPresets = guarded(async context => {
  const { request, env } = context
  const url = new URL(request.url)
  const sort = url.searchParams.get("sort") ?? "popular"
  if (sort !== "random" && !Object.hasOwn(SORTS, sort)) throw new Refusal(400, "That isn't a way to sort presets.")
  const offset = Number(url.searchParams.get("offset") ?? 0)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Refusal(400, "That isn't a valid page.")
  const term = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, LIMITS.name)
  if (term && Array.from(term).length < LIMITS.searchMinimum) throw new Refusal(400, `Search for at least ${LIMITS.searchMinimum} characters.`)
  if (sort === "random") return reply(200, { presets: (await randomPresets(context, term)).map(rated), more: false })
  return cachedAtEdge(context, async () => {
    const conditions = term ? [`(${MATCHES})`] : []
    if (sort === "needs") conditions.push(`votes < ${LIMITS.minVotes}`)
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
    const source = sort === "week" ? `SELECT ${COLUMNS}, week FROM presets JOIN (SELECT preset_id, SUM(count) AS week FROM preset_daily_downloads WHERE day >= ${dayNumber() - WEEK_DAYS} GROUP BY preset_id) ON preset_id = id` : `SELECT ${COLUMNS} FROM presets`
    const statement = env.DB.prepare(`${source} ${where} ORDER BY ${SORTS[sort]} LIMIT ${LIMITS.page + 1} OFFSET ${offset}`)
    const { results } = await (term ? statement.bind(likePattern(term)) : statement).all()
    return reply(200, { presets: results.slice(0, LIMITS.page).map(rated), more: results.length > LIMITS.page })
  })
})

export const submitPreset = guarded(async context => {
  const { request, env } = context
  const body = await jsonBody(request)
  const facts = checkTitle(body.code)
  const name = textField(body, "name", "name", LIMITS.name) || facts.text
  const credit = textField(body, "credit", "credit", LIMITS.credit)
  checkWords("title", facts.all)
  checkWords("name", name)
  checkWords("credit", credit)
  const fingerprint = await titleFingerprint(body.code)
  const existing = await env.DB.prepare("SELECT id FROM presets WHERE fingerprint = ?").bind(fingerprint).first()
  if (existing) return reply(409, { error: "This title has already been shared.", id: existing.id })
  const ip = await hashedIp(context)
  const day = today()
  if (await usedToday(env, ip) >= LIMITS.perDay) throw new Refusal(429, `You can share up to ${LIMITS.perDay} titles a day. Try again tomorrow.`)
  const [inserted] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO presets (code, fingerprint, name, text, credit, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`).bind(body.code, fingerprint, name, facts.text, credit, Date.now()),
    env.DB.prepare("INSERT INTO preset_submissions (ip_hash, day, count) VALUES (?, ?, 1) ON CONFLICT (ip_hash, day) DO UPDATE SET count = count + 1").bind(ip, day)
  ])
  await globalThis.caches?.default.delete(new Request(new URL(NEWEST_PAGE, request.url)))
  return reply(201, { preset: rated(inserted.results[0]) })
})

export const submissionUsage = guarded(async context => reply(200, { used: await usedToday(context.env, await hashedIp(context)), limit: LIMITS.perDay, resetsAt: nextDay() }))

export const votePreset = guarded(async context => {
  const { request, env, params } = context
  const id = presetId(params)
  const { value } = await jsonBody(request)
  if (value !== 1 && value !== -1) throw new Refusal(400, "That isn't a valid vote.")
  await requirePreset(env, id)
  const ip = await hashedIp(context)
  const previous = (await env.DB.prepare("SELECT value FROM preset_votes WHERE preset_id = ? AND ip_hash = ?").bind(id, ip).first())?.value ?? 0
  const ups = (value === 1) - (previous === 1)
  const votes = previous ? 0 : 1
  const [, updated] = await env.DB.batch([
    env.DB.prepare("INSERT INTO preset_votes (preset_id, ip_hash, value) VALUES (?, ?, ?) ON CONFLICT (preset_id, ip_hash) DO UPDATE SET value = excluded.value").bind(id, ip, value),
    env.DB.prepare("UPDATE presets SET ups = ups + ?1, votes = votes + ?2, rating = CASE WHEN votes + ?2 >= ?3 THEN (ups + ?1) * 5.0 / (votes + ?2) ELSE -1 END WHERE id = ?4 RETURNING votes, rating").bind(ups, votes, LIMITS.minVotes, id)
  ])
  return reply(200, { ...rated(updated.results[0]), vote: value })
})

export const countDownload = guarded(async context => {
  const { env, params } = context
  const id = presetId(params)
  await requirePreset(env, id)
  const ip = await hashedIp(context)
  const { meta } = await env.DB.prepare("INSERT OR IGNORE INTO preset_downloads (preset_id, ip_hash) VALUES (?, ?)").bind(id, ip).run()
  if (meta.changes) {
    await env.DB.batch([
      env.DB.prepare("UPDATE presets SET downloads = downloads + 1 WHERE id = ?").bind(id),
      env.DB.prepare("INSERT INTO preset_daily_downloads (day, preset_id, count) VALUES (?, ?, 1) ON CONFLICT (day, preset_id) DO UPDATE SET count = count + 1").bind(dayNumber(), id)
    ])
  }
  return reply(200, { counted: meta.changes > 0 })
})
