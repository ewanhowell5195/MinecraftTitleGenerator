import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity"
import { LIMITS } from "../lib/limits.js"
import { decodeTitle, unknownSetting } from "../lib/linkformat.js"
import { capitalWords } from "../lib/names.js"
import { FILE_VERSION, typeDefaults } from "../lib/settings.js"
import { USER_ROW, forgetUnusedUser, saveUser, signedInUser } from "./accounts.js"
import { Refusal, escaped, guarded, hashed, jsonBody, reply, textField } from "./http.js"

export { LIMITS }

const SORTS = { week: "week DESC, downloads DESC, id DESC", popular: "downloads DESC, id DESC", top: "rating DESC, votes DESC, id DESC", new: "created_at DESC, id DESC", needs: "votes, id" }
const MATCHES = "lower(name) LIKE ?1 ESCAPE '\\' OR lower(text) LIKE ?1 ESCAPE '\\'"
const EDGE_SECONDS = 1800
const DAY = 86400000
const WEEK_DAYS = 7
const SITE_NAME = "Minecraft Title Generator"
const FIRST_PAGES = ["week", "popular", "top", "new", "needs"].map(sort => `?sort=${sort}&offset=0`)
const COLUMNS = "id, code, name, text, downloads, votes, rating, created_at AS createdAt, (SELECT users.name FROM users WHERE users.id = presets.user_id) AS author, (SELECT users.provider FROM users WHERE users.id = presets.user_id) AS authorProvider"

const rude = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

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

function presetId(params) {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id < 1) throw new Refusal(404, "This preset doesn't exist.")
  return id
}

async function requirePreset(env, id) {
  const found = await env.DB.prepare("SELECT ip_hash, (SELECT users.provider || ':' || users.provider_id FROM users WHERE users.id = presets.user_id) AS owner FROM presets WHERE id = ?").bind(id).first()
  if (!found) throw new Refusal(404, "This preset doesn't exist.")
  return found
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

function accountHash(env, user) {
  return hashed(`${env.IP_SALT}:${user.id}`)
}

async function submissionCounter(env, user, ip) {
  return user ? { table: "account_submissions", column: "account_hash", owner: await accountHash(env, user) } : { table: "preset_submissions", column: "ip_hash", owner: ip }
}

async function usedToday(env, user, ip) {
  const { table, column, owner } = await submissionCounter(env, user, ip)
  return (await env.DB.prepare(`SELECT count FROM ${table} WHERE ${column} = ? AND day = ?`).bind(owner, today()).first())?.count ?? 0
}

async function countSubmission(env, user, ip) {
  const { table, column, owner } = await submissionCounter(env, user, ip)
  return env.DB.prepare(`INSERT INTO ${table} (${column}, day, count) VALUES (?, ?, 1) ON CONFLICT (${column}, day) DO UPDATE SET count = count + 1`).bind(owner, today())
}

async function hasUnlimitedShares(env, user) {
  if (!user) return false
  return !!(await env.DB.prepare("SELECT unlimited_shares FROM users WHERE provider = ? AND provider_id = ?").bind(user.provider, user.providerId).first())?.unlimited_shares
}

function forgetOldAccountCounts(env) {
  return env.DB.prepare("DELETE FROM account_submissions WHERE day < ?").bind(today())
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
  const { results } = await env.DB.prepare(`${select} WHERE id IN (${ids.join(", ")})`).all()
  if (results.length) return shuffled(results)
  return (await env.DB.prepare(`${select} ORDER BY RANDOM() LIMIT ${LIMITS.page}`).all()).results
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
    const source = sort === "week" ? `SELECT ${COLUMNS}, COALESCE(week, 0) AS week FROM presets LEFT JOIN (SELECT preset_id, SUM(count) AS week FROM preset_daily_downloads WHERE day >= ${dayNumber() - WEEK_DAYS} GROUP BY preset_id) ON preset_id = id` : `SELECT ${COLUMNS} FROM presets`
    const statement = env.DB.prepare(`${source} ${where} ORDER BY ${SORTS[sort]} LIMIT ${LIMITS.page + 1} OFFSET ${offset}`)
    const { results } = await (term ? statement.bind(likePattern(term)) : statement).all()
    return reply(200, { presets: results.slice(0, LIMITS.page).map(rated), more: results.length > LIMITS.page })
  })
})

export const getPreset = guarded(async context => {
  const id = presetId(context.params)
  return cachedAtEdge(context, async () => {
    const preset = await context.env.DB.prepare(`SELECT ${COLUMNS} FROM presets WHERE id = ?`).bind(id).first()
    if (!preset) throw new Refusal(404, "This preset doesn't exist.")
    return reply(200, { preset: rated(preset) })
  })
})

export function presetPageDetails(name, id) {
  if (name === null) return { title: `Presets | ${SITE_NAME}`, description: "Browse Minecraft style titles shared by other people, then open one in the generator and change it however you like.", path: "/app/presets" }
  return { title: `${name} | ${SITE_NAME}`, description: `Open ${name} in the ${SITE_NAME}, then change it and render it as an image.`, path: `/app/presets/${id}` }
}

export async function presetPage({ env, params, request }) {
  const page = await env.ASSETS.fetch(new URL("/app/", request.url))
  const id = Number(params.id?.[0])
  const known = params.id?.length === 1 && Number.isSafeInteger(id) && id > 0
  const preset = known ? await env.DB.prepare("SELECT name FROM presets WHERE id = ?").bind(id).first() : null
  const { title, description, path } = presetPageDetails(preset?.name ?? null, id)
  const url = `${new URL(request.url).origin}${path}`
  const tags = [["og:type", "website"], ["og:site_name", SITE_NAME], ["og:url", url], ["og:title", title], ["og:description", description]]
  return new HTMLRewriter()
    .on("title", { element: element => element.setInnerContent(title) })
    .on('meta[name="description"]', { element: element => element.setAttribute("content", description) })
    .on('link[rel="canonical"]', { element: element => element.setAttribute("href", url) })
    .on("head", { element: element => element.append(tags.map(([property, content]) => `<meta property="${property}" content="${escaped(content)}">`).join(""), { html: true }) })
    .transform(page)
}

export const submitPreset = guarded(async context => {
  const { request, env } = context
  const body = await jsonBody(request)
  const user = await signedInUser(context)
  if (body.account && !user) throw new Refusal(401, "You've been signed out. Sign in again to share this on your account.")
  if (user) checkWords("username", user.name)
  const facts = checkTitle(body.code)
  const name = textField(body, "name", "name", LIMITS.name) || capitalWords(facts.text)
  checkWords("title", facts.all)
  checkWords("name", name)
  const fingerprint = await titleFingerprint(body.code)
  const existing = await env.DB.prepare("SELECT id FROM presets WHERE fingerprint = ?").bind(fingerprint).first()
  if (existing) return reply(409, { error: "This title has already been shared.", id: existing.id })
  const ip = await hashedIp(context)
  if (await usedToday(env, user, ip) >= LIMITS.perDay && !await hasUnlimitedShares(env, user)) throw new Refusal(429, `You can share up to ${LIMITS.perDay} titles a day. Try again tomorrow.`)
  // sqlite reuses the rowid of a deleted newest row, which would repoint old links and browsers' vote records
  const results = await env.DB.batch((user ? [saveUser(env, user)] : []).concat(
    env.DB.prepare(`INSERT INTO presets (id, code, fingerprint, name, text, ip_hash, user_id, created_at) VALUES (MAX(COALESCE((SELECT MAX(id) FROM presets), 0), COALESCE((SELECT MAX(id) FROM deleted_presets), 0)) + 1, ?, ?, ?, ?, ?, ${USER_ROW}, ?) RETURNING ${COLUMNS}`).bind(body.code, fingerprint, name, facts.text, ip, user?.provider ?? null, user?.providerId ?? null, Date.now()),
    await countSubmission(env, user, ip),
    forgetOldAccountCounts(env)
  ))
  await forgetCached(request)
  return reply(201, { preset: rated(results[user ? 1 : 0].results[0]), onAccount: !!user })
})

async function forgetCached(request, ...ids) {
  const paths = FIRST_PAGES.map(page => `/api/presets${page}`).concat(ids.map(id => `/api/presets/${id}`))
  for (const path of paths) await globalThis.caches?.default.delete(new Request(new URL(path, request.url)))
}

async function ownedPreset(context) {
  const id = presetId(context.params)
  const user = await signedInUser(context)
  if (!user) throw new Refusal(401, "Sign in to change this preset.")
  const { owner } = await requirePreset(context.env, id)
  if (owner !== user.id) throw new Refusal(403, "This preset isn't on your account.")
  return { id, user }
}

export const renamePreset = guarded(async context => {
  const { request, env } = context
  const { id } = await ownedPreset(context)
  const name = textField(await jsonBody(request), "name", "name", LIMITS.name)
  if (!name) throw new Refusal(400, "The name can't be empty.")
  checkWords("name", name)
  const preset = await env.DB.prepare(`UPDATE presets SET name = ? WHERE id = ? RETURNING ${COLUMNS}`).bind(name, id).first()
  await forgetCached(request, id)
  return reply(200, { preset: rated(preset) })
})

export const deletePreset = guarded(async context => {
  const { request, env } = context
  const { id, user } = await ownedPreset(context)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO deleted_presets (id) VALUES (?)").bind(id),
    env.DB.prepare("DELETE FROM presets WHERE id = ?").bind(id),
    forgetOldAccountCounts(env),
    forgetUnusedUser(env, user)
  ])
  await forgetCached(request, id)
  return reply(200, { deleted: true })
})

export const submissionUsage = guarded(async context => {
  const user = await signedInUser(context)
  const ip = await hashedIp(context)
  const { env } = context
  const shared = user ? env.DB.prepare(`SELECT id FROM presets WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId) : env.DB.prepare("SELECT id FROM presets WHERE ip_hash = ? AND user_id IS NULL").bind(ip)
  const ids = (await shared.all()).results.map(preset => preset.id)
  const votes = (await env.DB.prepare("SELECT preset_id, value FROM preset_votes WHERE ip_hash = ?").bind(user ? await accountHash(env, user) : ip).all()).results
  return reply(200, { used: await usedToday(env, user, ip), limit: LIMITS.perDay, unlimited: await hasUnlimitedShares(env, user), resetsAt: nextDay(), shared: ids, owned: user ? ids : [], votes: Object.fromEntries(votes.map(vote => [vote.preset_id, vote.value])) })
})

export const votePreset = guarded(async context => {
  const { request, env, params } = context
  const id = presetId(params)
  const { value } = await jsonBody(request)
  if (value !== 1 && value !== -1) throw new Refusal(400, "That isn't a valid vote.")
  const { ip_hash: sharedBy, owner } = await requirePreset(env, id)
  const ip = await hashedIp(context)
  const user = await signedInUser(context)
  if (user ? owner === user.id : sharedBy === ip) throw new Refusal(403, "You can't vote on a preset you shared.")
  const voter = user ? await accountHash(env, user) : ip
  const previous = (await env.DB.prepare("SELECT value FROM preset_votes WHERE preset_id = ? AND ip_hash = ?").bind(id, voter).first())?.value ?? 0
  const ups = (value === 1) - (previous === 1)
  const votes = previous ? 0 : 1
  const [, updated] = await env.DB.batch([
    env.DB.prepare("INSERT INTO preset_votes (preset_id, ip_hash, value) VALUES (?, ?, ?) ON CONFLICT (preset_id, ip_hash) DO UPDATE SET value = excluded.value").bind(id, voter, value),
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
