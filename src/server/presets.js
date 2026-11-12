import { LIMITS } from "../lib/limits.js"
import { decodeTitle, unknownSetting } from "../lib/linkformat.js"
import { capitalWords } from "../lib/names.js"
import { pictureUrl } from "../lib/pictures.js"
import { parseSearch } from "../lib/presetSearch.js"
import { FILE_VERSION } from "../lib/settings.js"
import { limitProblem, titleFacts, titleProblem } from "../lib/titleFacts.js"
import { blockedWordProblem } from "../lib/wording.js"
import { USER_ROW, activeUser, forgetUnusedUser, requireUser, saveUser, signedInUser } from "./accounts.js"
import { nextDay, returnSlot, takeSlot, today } from "./daily.js"
import { SITE_NAME, pageImage, pageWithDetails } from "./head.js"
import { INVALID, Refusal, cachedAtEdge, guarded, hashed, idParam, jsonBody, randomToken, reply, setting, textField } from "./http.js"

const SORTS = { week: "week DESC, downloads DESC, id DESC", popular: "downloads DESC, id DESC", top: "rating DESC, votes DESC, id DESC", new: "created_at DESC, id DESC", needs: "votes, id" }
const MATCHES = "lower(name) LIKE ?1 ESCAPE '\\' OR lower(text) LIKE ?1 ESCAPE '\\'"
const DAY = 86400000
const WEEK_DAYS = 7
const FIRST_PAGES = Object.keys(SORTS).map(sort => `?sort=${sort}&offset=0`)
const MISSING = "This preset doesn't exist."
const STAT_COLUMNS = "downloads, votes, rating, created_at AS createdAt, (SELECT users.name FROM users WHERE users.id = presets.user_id) AS author, (SELECT users.provider FROM users WHERE users.id = presets.user_id) AS authorProvider"
const COLUMNS = `id, code, fingerprint, name, text, ${STAT_COLUMNS}`

// sqlite reuses the rowid of a deleted newest row, which would repoint old links and browsers' vote records
export const NEXT_ID = "MAX(COALESCE((SELECT MAX(id) FROM presets), 0), COALESCE((SELECT MAX(id) FROM deleted_presets), 0)) + 1"
const SCORES_RESET = ", downloads = 0, ups = 0, votes = 0, rating = -1"
const UPS = "(SELECT COUNT(*) FROM preset_votes WHERE preset_id = presets.id AND value = 1)"
const VOTES = "(SELECT COUNT(*) FROM preset_votes WHERE preset_id = presets.id)"
const SCORES_COUNTED = `ups = ${UPS}, votes = ${VOTES}, rating = CASE WHEN ${VOTES} >= ${LIMITS.minVotes} THEN ${UPS} * 5.0 / ${VOTES} ELSE -1 END`

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

function titleFingerprint(code) {
  return hashed(JSON.stringify(canonical(decodeTitle(code).lines)))
}

function network(ip) {
  if (!ip.includes(":")) return ip
  const [head, tail] = ip.toLowerCase().split("::")
  const start = head ? head.split(":") : []
  const end = tail ? tail.split(":") : []
  const gap = Array.from({ length: Math.max(0, 8 - start.length - end.length - (ip.includes(".") ? 1 : 0)) }, () => "0")
  return `${start.concat(gap, end).slice(0, 4).map(group => parseInt(group, 16).toString(16)).join(":")}::/64`
}

async function hashedIp({ request, env }) {
  const salt = setting(env, "IP_SALT")
  const ip = request.headers.get("CF-Connecting-IP")
  if (!ip) throw new Error("the request has no CF-Connecting-IP header")
  return hashed(`${salt}:${network(ip)}`)
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
  const problem = titleProblem(title.lines)
  if (problem) throw new Refusal(400, `This title can't be shared: ${problem}.`)
  const facts = titleFacts(title.lines)
  const over = limitProblem(title.lines, facts)
  if (over) throw new Refusal(400, over)
  if (!facts.text && !facts.shapes) throw new Refusal(400, "This title has no text or shapes in it.")
  return facts
}

function checkWords(label, text) {
  const problem = blockedWordProblem(label, text)
  if (problem) throw new Refusal(400, problem)
}

async function requirePreset(env, id, condition = "") {
  const found = await env.DB.prepare(`SELECT token_hash, (SELECT users.provider || ':' || users.provider_id FROM users WHERE users.id = presets.user_id) AS owner FROM presets WHERE id = ?${condition}`).bind(id).first()
  if (!found) throw new Refusal(404, MISSING)
  return found
}

function rated(row) {
  return { ...row, rating: row.rating < 0 ? null : row.rating }
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

async function hasUnlimitedShares(env, user) {
  if (!user) return false
  return !!(await env.DB.prepare("SELECT unlimited_shares FROM users WHERE provider = ? AND provider_id = ?").bind(user.provider, user.providerId).first())?.unlimited_shares
}

function forgetOldCounts(env) {
  return ["account_submissions", "preset_submissions"].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE day < ?`).bind(today())).concat(env.DB.prepare("DELETE FROM preset_daily_downloads WHERE day < ?").bind(dayNumber() - WEEK_DAYS))
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

function searchFilter(search) {
  const { user, provider, text } = parseSearch(search)
  const term = text.toLowerCase().slice(0, LIMITS.name)
  if (term && Array.from(term).length < LIMITS.searchMinimum) throw new Refusal(400, `Search for at least ${LIMITS.searchMinimum} characters.`)
  const conditions = term ? [`(${MATCHES})`] : []
  const values = term ? [likePattern(term)] : []
  if (user) {
    values.push(user)
    const nameMatches = `lower(name) = ?${values.length}`
    if (provider) values.push(provider)
    conditions.push(`user_id IN (SELECT id FROM users WHERE ${provider ? `${nameMatches} AND provider = ?${values.length}` : nameMatches})`)
  }
  return { conditions, values }
}

async function randomPresets({ env }, { conditions, values }) {
  const select = `SELECT ${COLUMNS} FROM presets WHERE shared = 1`
  if (conditions.length) return (await env.DB.prepare(`${select} AND ${conditions.join(" AND ")} ORDER BY RANDOM() LIMIT ${LIMITS.page}`).bind(...values).all()).results
  const { highest } = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS highest FROM presets").first()
  if (!highest) return []
  const ids = randomIds(highest, LIMITS.page)
  const { results } = await env.DB.prepare(`${select} AND id IN (${ids.join(", ")})`).all()
  if (results.length) return shuffled(results)
  return (await env.DB.prepare(`${select} ORDER BY RANDOM() LIMIT ${LIMITS.page}`).all()).results
}

function dayNumber() {
  return Math.floor(Date.now() / DAY)
}

export const listPresets = guarded(async context => {
  const { request, env } = context
  const url = new URL(request.url)
  const fingerprint = url.searchParams.get("fingerprint")
  if (fingerprint !== null) return reply(200, { presets: (await env.DB.prepare(`SELECT ${COLUMNS} FROM presets WHERE fingerprint = ? AND shared = 1`).bind(fingerprint).all()).results.map(rated), more: false })
  const sort = url.searchParams.get("sort") ?? "popular"
  if (sort !== "random" && !Object.hasOwn(SORTS, sort)) throw new Refusal(400, "That isn't a way to sort presets.")
  const offset = Number(url.searchParams.get("offset") ?? 0)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Refusal(400, "That isn't a valid page.")
  const filter = searchFilter(url.searchParams.get("q") ?? "")
  if (sort === "random") return reply(200, { presets: (await randomPresets(context, filter)).map(rated), more: false })
  return cachedAtEdge(context, async () => {
    const conditions = filter.conditions.concat("shared = 1")
    if (sort === "needs") conditions.push(`votes < ${LIMITS.minVotes}`)
    const where = `WHERE ${conditions.join(" AND ")}`
    const source = sort === "week" ? `SELECT ${COLUMNS}, COALESCE(week, 0) AS week FROM presets LEFT JOIN (SELECT preset_id, SUM(count) AS week FROM preset_daily_downloads WHERE day >= ${dayNumber() - WEEK_DAYS} GROUP BY preset_id) ON preset_id = id` : `SELECT ${COLUMNS} FROM presets`
    const statement = env.DB.prepare(`${source} ${where} ORDER BY ${SORTS[sort]} LIMIT ${LIMITS.page + 1} OFFSET ${offset}`)
    const { results } = await statement.bind(...filter.values).all()
    return reply(200, { presets: results.slice(0, LIMITS.page).map(rated), more: results.length > LIMITS.page })
  })
})

export const getPreset = guarded(async context => {
  const id = idParam(context.params, MISSING)
  return cachedAtEdge(context, async () => {
    const preset = await context.env.DB.prepare(`SELECT ${COLUMNS} FROM presets WHERE id = ? AND shared = 1`).bind(id).first()
    if (!preset) throw new Refusal(404, MISSING)
    return reply(200, { preset: rated(preset) })
  })
})

export function presetPageDetails(name, id) {
  if (name === null) return { title: `Presets | ${SITE_NAME}`, description: "Browse Minecraft style titles other people have shared, and open any of them in the generator to make your own!", path: "/app/presets" }
  return { title: `${name} | ${SITE_NAME}`, description: `Open this title in the ${SITE_NAME} to change it and make your own!`, path: `/app/presets/${id}` }
}

export function linkedCode(url) {
  const code = url.searchParams.get("title")
  return code && /^[0-9A-Za-z_-]+$/.test(code) && code.length <= LIMITS.code ? code : null
}

export function linkedTitleDetails(url, code, canonical) {
  return { title: SITE_NAME, description: `Open this title in the ${SITE_NAME} to change it and make your own!`, url: url.href, canonical: `${url.origin}${canonical}`, image: pictureUrl({ code }, "png"), spaced: true }
}

export function presetDetails(origin, preset, id) {
  const { title, description, path } = presetPageDetails(preset?.name ?? null, id)
  if (preset?.fingerprint) return { title, description, url: `${origin}${path}`, image: pictureUrl(preset, "png"), spaced: true }
  const { path: image, ...size } = pageImage("presets", "Presets")
  return { title, description, url: `${origin}${path}`, ...size, image: `${origin}${image}` }
}

function linkedTitlePage(page, url, code, canonical) {
  return pageWithDetails(page, linkedTitleDetails(url, code, canonical))
}

function appShell({ env, request }) {
  return env.ASSETS.fetch(new URL("/app/", request.url))
}

export async function presetPage(context) {
  const { env, params, request } = context
  const page = await appShell(context)
  const address = new URL(request.url)
  const code = params.id?.length ? null : linkedCode(address)
  if (code) return linkedTitlePage(page, address, code, "/app/presets")
  const id = Number(params.id?.[0])
  const known = params.id?.length === 1 && Number.isSafeInteger(id) && id > 0
  const preset = known ? await env.DB.prepare("SELECT name, fingerprint FROM presets WHERE id = ? AND shared = 1").bind(id).first() : null
  return pageWithDetails(page, presetDetails(address.origin, preset, id))
}

export async function appPage(context) {
  const { next, request } = context
  const url = new URL(request.url)
  const code = linkedCode(url)
  if (!code) return next()
  return linkedTitlePage(await appShell(context), url, code, "/app/")
}

async function hiddenPreset({ request, env }, body, user) {
  if (user) return env.DB.prepare(`SELECT id, fingerprint FROM presets WHERE user_id = ${USER_ROW} AND code = ? AND shared = 0`).bind(user.provider, user.providerId, body.code).first()
  const token = request.headers.get("X-Preset-Token")
  if (!token || !Number.isSafeInteger(body.id)) return null
  return env.DB.prepare("SELECT id, fingerprint FROM presets WHERE id = ? AND token_hash = ? AND shared = 0").bind(body.id, await hashed(token)).first()
}

function scoreResets(env, id) {
  return ["preset_votes", "preset_downloads", "preset_daily_downloads"].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE preset_id = ?`).bind(id))
}

export function deletingPresets(env, where, ...values) {
  return [env.DB.prepare(`INSERT INTO deleted_presets (id) SELECT id FROM presets WHERE ${where}`).bind(...values), env.DB.prepare(`DELETE FROM presets WHERE ${where}`).bind(...values)]
}

function forgetHiddenCopy(env, user, code, id) {
  return deletingPresets(env, `user_id = ${USER_ROW} AND code = ? AND shared = 0 AND id != ?`, user.provider, user.providerId, code, id)
}

async function checkedSubmission(env, body) {
  const facts = checkTitle(body.code)
  const name = textField(body, "name", "name", LIMITS.name) || capitalWords(facts.text)
  checkWords("title", facts.all)
  checkWords("name", name)
  const fingerprint = await titleFingerprint(body.code)
  const existing = await env.DB.prepare("SELECT id FROM presets WHERE fingerprint = ? AND shared = 1").bind(fingerprint).first()
  return { facts, name, fingerprint, existing }
}

function alreadyShared(existing) {
  return reply(409, { error: "This title has already been shared.", id: existing.id })
}

async function savedShare(context, body, user, { facts, name, fingerprint }) {
  const { env } = context
  const hidden = await hiddenPreset(context, body, user)
  const changedTitle = hidden && hidden.fingerprint !== fingerprint
  const token = user || hidden ? null : randomToken()
  const saving = hidden ? env.DB.prepare(`UPDATE presets SET shared = 1, code = ?, fingerprint = ?, name = ?, text = ?, created_at = COALESCE(created_at, ?)${changedTitle ? SCORES_RESET : ""} WHERE id = ? RETURNING ${COLUMNS}`).bind(body.code, fingerprint, name, facts.text, Date.now(), hidden.id) : env.DB.prepare(`INSERT INTO presets (id, code, fingerprint, name, text, token_hash, user_id, created_at, shared) VALUES (${NEXT_ID}, ?, ?, ?, ?, ?, ${USER_ROW}, ?, 1) RETURNING ${COLUMNS}`).bind(body.code, fingerprint, name, facts.text, token && await hashed(token), user?.provider ?? null, user?.providerId ?? null, Date.now())
  const before = (user ? [saveUser(env, user)] : []).concat(changedTitle ? scoreResets(env, hidden.id) : [])
  const results = await env.DB.batch(before.concat(saving, forgetOldCounts(env)))
  return { hidden, token, preset: results[before.length].results[0] }
}

export const submitPreset = guarded(async context => {
  const { request, env } = context
  const body = await jsonBody(request)
  const user = await activeUser(context)
  if (body.account && !user) throw new Refusal(401, "You've been signed out. Sign in again to share this on your account.")
  if (user) checkWords("username", user.name)
  const checked = await checkedSubmission(env, body)
  if (checked.existing) return alreadyShared(checked.existing)
  const ip = await hashedIp(context)
  const slot = await takeSlot(env, await submissionCounter(env, user, ip), await hasUnlimitedShares(env, user) ? null : LIMITS.perDay)
  if (!slot) throw new Refusal(429, `You can share up to ${LIMITS.perDay} titles a day. Try again tomorrow.`)
  const { hidden, token, preset } = await savedShare(context, body, user, checked).catch(async err => {
    await returnSlot(env, slot)
    throw err
  })
  await forgetCached(request, ...(hidden ? [hidden.id] : []))
  return reply(hidden ? 200 : 201, { preset: rated(preset), onAccount: !!user, ...(token && { token }) })
})

export async function presetsForDeletion(env, user, keep) {
  const voter = await accountHash(env, user)
  const owner = [user.provider, user.providerId]
  const voted = (await env.DB.prepare("SELECT preset_id AS id FROM preset_votes WHERE ip_hash = ?").bind(voter).all()).results.map(row => row.id)
  const removed = (await env.DB.prepare(`SELECT id FROM presets WHERE user_id = ${USER_ROW}${keep ? " AND shared = 0" : ""}`).bind(...owner).all()).results.map(row => row.id)
  const statements = [
    env.DB.prepare("DELETE FROM preset_votes WHERE ip_hash = ?").bind(voter),
    env.DB.prepare(`UPDATE presets SET ${SCORES_COUNTED} WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(voted)),
    env.DB.prepare("DELETE FROM account_submissions WHERE account_hash = ?").bind(voter)
  ].concat(deletingPresets(env, "id IN (SELECT value FROM json_each(?))", JSON.stringify(removed)))
  if (keep) statements.push(env.DB.prepare(`UPDATE presets SET user_id = NULL WHERE user_id = ${USER_ROW}`).bind(...owner))
  return { statements, changed: removed.concat(voted.filter(id => !removed.includes(id))) }
}

export async function forgetCached(request, ...ids) {
  const paths = FIRST_PAGES.map(page => `/api/presets${page}`).concat(ids.map(id => `/api/presets/${id}`))
  await Promise.all(paths.map(path => globalThis.caches?.default.delete(new Request(new URL(path, request.url)))))
}

async function ownedPreset(context) {
  const id = idParam(context.params, MISSING)
  const user = await signedInUser(context)
  const token = context.request.headers.get("X-Preset-Token")
  if (!user && !token) throw new Refusal(401, "Sign in to change this preset.")
  const { owner, token_hash: tokenHash } = await requirePreset(context.env, id)
  if (user && owner === user.id) return { id, user }
  if (token && tokenHash && await hashed(token) === tokenHash) return { id, user: null }
  throw new Refusal(403, "You can't change this preset.")
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

export const replacePreset = guarded(async context => {
  const { request, env } = context
  const { id, user } = await ownedPreset(context)
  const body = await jsonBody(request)
  const { facts, name, fingerprint, existing } = await checkedSubmission(env, body)
  if (existing && existing.id !== id) return alreadyShared(existing)
  const before = (user ? forgetHiddenCopy(env, user, body.code, id) : []).concat(existing ? [] : scoreResets(env, id))
  const results = await env.DB.batch(before.concat(env.DB.prepare(`UPDATE presets SET code = ?, fingerprint = ?, name = ?, text = ?${existing ? "" : SCORES_RESET} WHERE id = ? RETURNING ${COLUMNS}`).bind(body.code, fingerprint, name, facts.text, id)))
  await forgetCached(request, id)
  return reply(200, { preset: rated(results.at(-1).results[0]) })
})

export const unsharePreset = guarded(async context => {
  const { request, env } = context
  const { id } = await ownedPreset(context)
  const preset = await env.DB.prepare("UPDATE presets SET shared = 0 WHERE id = ? RETURNING name, code").bind(id).first()
  await forgetCached(request, id)
  return reply(200, { preset })
})

export const deletePreset = guarded(async context => {
  const { request, env } = context
  const { id, user } = await ownedPreset(context)
  await env.DB.batch(deletingPresets(env, "id = ?", id).concat(forgetOldCounts(env), user ? forgetUnusedUser(env, user) : []))
  await forgetCached(request, id)
  return reply(200, { deleted: true })
})

export const presetStats = guarded(async ({ request, env }) => {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).map(Number)
  if (ids.length > LIMITS.savedPresets || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Refusal(400, INVALID)
  if (!ids.length) return reply(200, { stats: {} })
  const { results } = await env.DB.prepare(`SELECT id, ${STAT_COLUMNS} FROM presets WHERE shared = 1 AND id IN (${ids.join(", ")})`).all()
  return reply(200, { stats: Object.fromEntries(results.map(row => [row.id, rated(row)])) })
})

export const claimPresets = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, "Sign in to move these presets to your account.", activeUser)
  checkWords("username", user.name)
  const { tokens } = await jsonBody(request)
  if (!Array.isArray(tokens) || tokens.length > LIMITS.claimBatch || tokens.some(item => !Number.isSafeInteger(item?.id) || typeof item.token !== "string")) throw new Refusal(400, INVALID)
  if (!tokens.length) return reply(200, { moved: [] })
  const claims = (await Promise.all(tokens.map(async ({ id, token }) => {
    const hash = await hashed(token)
    const moving = env.DB.prepare(`UPDATE presets SET user_id = ${USER_ROW}, token_hash = NULL WHERE id = ? AND token_hash = ? AND NOT EXISTS (SELECT 1 FROM presets AS mine WHERE mine.user_id = ${USER_ROW} AND mine.code = presets.code) RETURNING id`).bind(user.provider, user.providerId, id, hash, user.provider, user.providerId)
    return deletingPresets(env, `user_id = ${USER_ROW} AND shared = 0 AND code = (SELECT code FROM presets WHERE id = ? AND token_hash = ?)`, user.provider, user.providerId, id, hash).concat(moving)
  }))).flat()
  const results = await env.DB.batch([saveUser(env, user)].concat(claims, forgetUnusedUser(env, user)))
  const moved = results.slice(1, -1).flatMap(result => result.results.map(row => row.id))
  await forgetCached(request, ...moved)
  return reply(200, { moved })
})

export const submissionUsage = guarded(async context => {
  const user = await signedInUser(context)
  const ip = await hashedIp(context)
  const { env } = context
  const ids = user ? (await env.DB.prepare(`SELECT id FROM presets WHERE user_id = ${USER_ROW} AND shared = 1`).bind(user.provider, user.providerId).all()).results.map(preset => preset.id) : []
  const votes = (await env.DB.prepare("SELECT preset_id, value FROM preset_votes WHERE ip_hash = ?").bind(user ? await accountHash(env, user) : ip).all()).results
  return reply(200, { used: await usedToday(env, user, ip), limit: LIMITS.perDay, unlimited: await hasUnlimitedShares(env, user), resetsAt: nextDay(), shared: ids, owned: user ? ids : [], votes: Object.fromEntries(votes.map(vote => [vote.preset_id, vote.value])) })
})

export const votePreset = guarded(async context => {
  const { request, env, params } = context
  const id = idParam(params, MISSING)
  const { value } = await jsonBody(request)
  if (value !== 1 && value !== -1) throw new Refusal(400, "That isn't a valid vote.")
  const { owner } = await requirePreset(env, id, " AND shared = 1")
  const ip = await hashedIp(context)
  const user = await signedInUser(context)
  if (user && owner === user.id) throw new Refusal(403, "You can't vote on a preset you shared.")
  const voter = user ? await accountHash(env, user) : ip
  const [, updated] = await env.DB.batch([
    env.DB.prepare("INSERT INTO preset_votes (preset_id, ip_hash, value) VALUES (?, ?, ?) ON CONFLICT (preset_id, ip_hash) DO UPDATE SET value = excluded.value").bind(id, voter, value),
    env.DB.prepare(`UPDATE presets SET ${SCORES_COUNTED} WHERE id = ? RETURNING votes, rating`).bind(id)
  ])
  return reply(200, { ...rated(updated.results[0]), vote: value })
})

export const countDownload = guarded(async context => {
  const { env, params } = context
  const id = idParam(params, MISSING)
  await requirePreset(env, id, " AND shared = 1")
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
