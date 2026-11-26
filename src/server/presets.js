import { cameraChanges, fullCamera } from "../lib/settings/camera.js"
import { LIMITS } from "../lib/core/limits.js"
import { decodeTitle } from "../lib/link/linkformat.js"
import { capitalWords } from "../lib/core/names.js"
import { parseSearch } from "../lib/link/presetSearch.js"
import { upgradeLine } from "../lib/settings/upgrades.js"
import { shareableTitle } from "../lib/link/titleFacts.js"
import { blockedWordProblem } from "../lib/core/blockedWords.js"
import { shortNameProblem } from "../lib/core/wording.js"
import { USER_ROW, activeUser, currentUser, forgetUnusedUser, requireUser, saveUser } from "./accounts.js"
import { nextDay, returnSlot, takeSlot, today } from "./daily.js"
import { ANY_SITE, INVALID, Refusal, cachedAtEdge, canonical, fromBlockbench, guarded, hashed, idParam, jsonBody, randomToken, reply, setting, textField, unpublishedName } from "./http.js"

const SORTS = { week: "week_downloads DESC, downloads DESC, id DESC", popular: "downloads DESC, id DESC", top: "rating DESC, votes DESC, id DESC", new: "created_at DESC, id DESC", needs: "votes, id" }
const MATCHES = "lower(name) LIKE ?1 ESCAPE '\\' OR lower(text) LIKE ?1 ESCAPE '\\'"
const DAY = 86400000
const WEEK_DAYS = 7
const FIRST_PAGES = Object.keys(SORTS).map(sort => `?sort=${sort}&offset=0`)
export const MISSING = "This preset doesn't exist."
const NOT_YOURS = "You can't change this preset."
export const STAT_COLUMNS = "downloads, votes, rating, created_at AS createdAt, (SELECT users.name FROM users WHERE users.id = presets.user_id) AS author, (SELECT users.provider FROM users WHERE users.id = presets.user_id) AS authorProvider"
const COLUMNS = `id, code, fingerprint, name, text, ${STAT_COLUMNS}`

// sqlite reuses the rowid of a deleted newest row, which would repoint old links and browsers' vote records
export const NEXT_ID = "MAX(COALESCE((SELECT MAX(id) FROM presets), 0), COALESCE((SELECT MAX(id) FROM deleted_presets), 0)) + 1"
const SCORES_RESET = ", downloads = 0, week_downloads = 0, ups = 0, votes = 0, rating = -1"
function scoresCounted(voters = "") {
  const ups = `(SELECT COUNT(*) FROM preset_votes WHERE preset_id = presets.id AND value = 1${voters})`
  const votes = `(SELECT COUNT(*) FROM preset_votes WHERE preset_id = presets.id${voters})`
  return `ups = ${ups}, votes = ${votes}, rating = CASE WHEN ${votes} >= ${LIMITS.minVotes} THEN ${ups} * 5.0 / ${votes} ELSE -1 END`
}

export const SCORES_COUNTED = scoresCounted()

function titleFingerprint(code) {
  const { version, lines, camera } = decodeTitle(code)
  const upgraded = lines.map(line => upgradeLine(line, version))
  const changes = cameraChanges(camera)
  return hashed(JSON.stringify(canonical(Object.keys(changes).length ? { lines: upgraded, camera: fullCamera(changes) } : upgraded)))
}

function network(ip) {
  if (!ip.includes(":")) return ip
  const [head, tail] = ip.toLowerCase().split("::")
  const start = head ? head.split(":") : []
  const end = tail ? tail.split(":") : []
  const gap = Array.from({ length: Math.max(0, 8 - start.length - end.length - (ip.includes(".") ? 1 : 0)) }, () => "0")
  return `${start.concat(gap, end).slice(0, 4).map(group => parseInt(group, 16).toString(16)).join(":")}::/64`
}

export async function hashedIp({ request, env }) {
  const salt = setting(env, "IP_SALT")
  const ip = request.headers.get("CF-Connecting-IP")
  if (!ip) throw new Error("the request has no CF-Connecting-IP header")
  return hashed(`${salt}:${network(ip)}`)
}

export function checkTitle(code) {
  const { facts, problem } = shareableTitle(code)
  if (problem) throw new Refusal(400, problem)
  return facts
}

function checkWords(label, text) {
  const problem = blockedWordProblem(label, text)
  if (problem) throw new Refusal(400, problem)
}

export async function requirePreset(env, id, condition = "") {
  const found = await env.DB.prepare(`SELECT token_hash, (SELECT users.provider || ':' || users.provider_id FROM users WHERE users.id = presets.user_id) AS owner FROM presets WHERE id = ?${condition}`).bind(id).first()
  if (!found) throw new Refusal(404, MISSING)
  return found
}

export function rated(row) {
  return { ...row, rating: row.rating < 0 ? null : row.rating }
}

export function accountHash(env, user) {
  return hashed(`${setting(env, "IP_SALT")}:${user.id}`)
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

function forgetOldDownloads(env) {
  const cutoff = dayNumber() - WEEK_DAYS
  return [
    env.DB.prepare("UPDATE presets SET week_downloads = week_downloads - (SELECT SUM(count) FROM preset_daily_downloads WHERE preset_id = presets.id AND day < ?1) WHERE id IN (SELECT preset_id FROM preset_daily_downloads WHERE day < ?1)").bind(cutoff),
    env.DB.prepare("DELETE FROM preset_daily_downloads WHERE day < ?").bind(cutoff)
  ]
}

function forgetOldCounts(env) {
  return ["account_submissions", "preset_submissions"].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE day < ?`).bind(today())).concat(forgetOldDownloads(env))
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

export function dayNumber() {
  return Math.floor(Date.now() / DAY)
}

export async function presetList(env, { sort, search, offset }) {
  const filter = searchFilter(search)
  const conditions = filter.conditions.concat("shared = 1")
  if (sort === "needs") conditions.push(`votes < ${LIMITS.minVotes}`)
  const where = `WHERE ${conditions.join(" AND ")}`
  const columns = sort === "week" ? `${COLUMNS}, week_downloads AS week` : COLUMNS
  const listing = env.DB.prepare(`SELECT ${columns} FROM presets ${where} ORDER BY ${SORTS[sort]} LIMIT ${LIMITS.page + 1} OFFSET ${offset}`).bind(...filter.values)
  const { results } = sort === "week" ? (await env.DB.batch(forgetOldDownloads(env).concat(listing))).at(-1) : await listing.all()
  return { presets: results.slice(0, LIMITS.page).map(rated), more: results.length > LIMITS.page }
}

export async function sharedPreset(env, id) {
  const preset = await env.DB.prepare(`SELECT ${COLUMNS} FROM presets WHERE id = ? AND shared = 1`).bind(id).first()
  return preset ? rated(preset) : null
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
  const search = url.searchParams.get("q") ?? ""
  if (sort === "random") return reply(200, { presets: (await randomPresets(context, searchFilter(search))).map(rated), more: false }, ANY_SITE)
  return cachedAtEdge(context, async () => reply(200, await presetList(env, { sort, search, offset }), ANY_SITE))
})

export const getPreset = guarded(async context => {
  const id = idParam(context.params, MISSING)
  return cachedAtEdge(context, async () => {
    const preset = await sharedPreset(context.env, id)
    if (!preset) throw new Refusal(404, MISSING)
    return reply(200, { preset }, ANY_SITE)
  })
})

async function hiddenPreset({ request, env }, body, user) {
  if (user) return env.DB.prepare(`SELECT id, fingerprint FROM presets WHERE user_id = ${USER_ROW} AND code = ? AND shared = 0`).bind(user.provider, user.providerId, body.code).first()
  const token = request.headers.get("X-Preset-Token")
  if (!token || !Number.isSafeInteger(body.id)) return null
  return env.DB.prepare("SELECT id, fingerprint FROM presets WHERE id = ? AND token_hash = ? AND shared = 0").bind(body.id, await hashed(token)).first()
}

function scoreResets(env, id, guard = { sql: "1", values: [] }) {
  return ["preset_votes", "preset_downloads", "preset_daily_downloads"].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE preset_id = ? AND ${guard.sql}`).bind(id, ...guard.values))
}

export function deletingPresets(env, where, ...values) {
  return [env.DB.prepare(`INSERT INTO deleted_presets (id) SELECT id FROM presets WHERE ${where}`).bind(...values), env.DB.prepare(`DELETE FROM presets WHERE ${where}`).bind(...values)]
}

function forgetHiddenCopy(env, user, code, id, guard) {
  return deletingPresets(env, `user_id = ${USER_ROW} AND code = ? AND shared = 0 AND id != ? AND ${guard.sql}`, user.provider, user.providerId, code, id, ...guard.values)
}

async function checkedSubmission(context, body) {
  const { env } = context
  const facts = checkTitle(body.code)
  const unknown = await unpublishedName(context, decodeTitle(body.code).lines)
  if (unknown) throw new Refusal(400, `This title can't be shared: ${unknown}.`)
  const name = textField(body, "name", "name", LIMITS.name) || capitalWords(facts.text)
  const short = shortNameProblem(name)
  if (short) throw new Refusal(400, short)
  checkWords("title", facts.all)
  checkWords("name", name)
  const fingerprint = await titleFingerprint(body.code)
  return { facts, name, fingerprint, existing: await sharedWith(env, fingerprint) }
}

function sharedWith(env, fingerprint) {
  return env.DB.prepare("SELECT id FROM presets WHERE fingerprint = ? AND shared = 1").bind(fingerprint).first()
}

async function sharedMeanwhile(env, fingerprint, id, err) {
  const existing = await sharedWith(env, fingerprint)
  if (!existing || existing.id === id) throw err
  return existing
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

export const submitPreset = fromBlockbench(async context => {
  const { request, env } = context
  const body = await jsonBody(request)
  const user = await activeUser(context)
  if (body.account && !user) throw new Refusal(401, "You've been signed out. Sign in again to share this on your account.")
  if (user) checkWords("username", user.name)
  const checked = await checkedSubmission(context, body)
  if (checked.existing) return alreadyShared(checked.existing)
  const ip = await hashedIp(context)
  const slot = await takeSlot(env, await submissionCounter(env, user, ip), await hasUnlimitedShares(env, user) ? null : LIMITS.perDay)
  if (!slot) throw new Refusal(429, `You can share up to ${LIMITS.perDay} titles a day. Try again tomorrow.`)
  const { hidden, token, preset, existing } = await savedShare(context, body, user, checked).catch(async err => {
    await returnSlot(env, slot)
    return { existing: await sharedMeanwhile(env, checked.fingerprint, null, err) }
  })
  if (existing) return alreadyShared(existing)
  await forgetCached(request, ...(hidden ? [hidden.id] : []))
  return reply(hidden ? 200 : 201, { preset: rated(preset), onAccount: !!user, ...(token && { token }) })
})

export async function presetsForDeletion(env, user, keep) {
  const voter = await accountHash(env, user)
  const owner = [user.provider, user.providerId]
  const theirs = `user_id = ${USER_ROW}${keep ? " AND shared = 0" : ""}`
  const statements = [
    env.DB.prepare(`UPDATE presets SET ${scoresCounted(" AND ip_hash != ?1")} WHERE id IN (SELECT preset_id FROM preset_votes WHERE ip_hash = ?1) RETURNING id`).bind(voter),
    env.DB.prepare("DELETE FROM preset_votes WHERE ip_hash = ?").bind(voter),
    env.DB.prepare(`INSERT INTO deleted_presets (id) SELECT id FROM presets WHERE ${theirs} RETURNING id`).bind(...owner),
    env.DB.prepare(`DELETE FROM presets WHERE ${theirs}`).bind(...owner)
  ]
  if (keep) statements.push(env.DB.prepare(`UPDATE presets SET user_id = NULL WHERE user_id = ${USER_ROW}`).bind(...owner))
  else statements.push(env.DB.prepare("DELETE FROM account_submissions WHERE account_hash = ?").bind(voter))
  return { statements, changed: results => Array.from(new Set(results[0].results.concat(results[2].results).map(row => row.id))) }
}

export async function forgetCached(request, ...ids) {
  const paths = FIRST_PAGES.map(page => `/api/presets${page}`).concat(ids.map(id => `/api/presets/${id}`))
  await Promise.all(paths.map(path => globalThis.caches?.default.delete(new Request(new URL(path, request.url)))))
}

async function ownedPreset(context) {
  const id = idParam(context.params, MISSING)
  const user = await activeUser(context)
  const token = context.request.headers.get("X-Preset-Token")
  if (!user && !token) throw new Refusal(401, "Sign in to change this preset.")
  const { owner, token_hash: tokenHash } = await requirePreset(context.env, id)
  if (user && owner === user.id) return { id, user, where: `user_id = ${USER_ROW}`, values: [user.provider, user.providerId] }
  if (token && tokenHash && await hashed(token) === tokenHash) return { id, user: null, where: "token_hash = ?", values: [tokenHash] }
  throw new Refusal(403, NOT_YOURS)
}

function stillOwned({ id, where, values }) {
  return { sql: `EXISTS (SELECT 1 FROM presets WHERE id = ? AND ${where})`, values: [id].concat(values) }
}

async function refuseChange(env, id) {
  await requirePreset(env, id)
  throw new Refusal(403, NOT_YOURS)
}

export const renamePreset = fromBlockbench(async context => {
  const { request, env } = context
  const { id, where, values } = await ownedPreset(context)
  const name = textField(await jsonBody(request), "name", "name", LIMITS.name)
  if (!name) throw new Refusal(400, "The name can't be empty.")
  const short = shortNameProblem(name)
  if (short) throw new Refusal(400, short)
  checkWords("name", name)
  const preset = await env.DB.prepare(`UPDATE presets SET name = ? WHERE id = ? AND ${where} RETURNING ${COLUMNS}`).bind(name, id, ...values).first()
  if (!preset) await refuseChange(env, id)
  await forgetCached(request, id)
  return reply(200, { preset: rated(preset) })
})

export const replacePreset = fromBlockbench(async context => {
  const { request, env } = context
  const owned = await ownedPreset(context)
  const { id, user, where, values } = owned
  const body = await jsonBody(request)
  const { facts, name, fingerprint, existing } = await checkedSubmission(context, body)
  if (existing && existing.id !== id) return alreadyShared(existing)
  const guard = stillOwned(owned)
  const before = (user ? forgetHiddenCopy(env, user, body.code, id, guard) : []).concat(existing ? [] : scoreResets(env, id, guard))
  let results
  try {
    results = await env.DB.batch(before.concat(env.DB.prepare(`UPDATE presets SET code = ?, fingerprint = ?, name = ?, text = ?${existing ? "" : SCORES_RESET} WHERE id = ? AND ${where} RETURNING ${COLUMNS}`).bind(body.code, fingerprint, name, facts.text, id, ...values)))
  } catch (err) {
    return alreadyShared(await sharedMeanwhile(env, fingerprint, id, err))
  }
  const preset = results.at(-1).results[0]
  if (!preset) await refuseChange(env, id)
  await forgetCached(request, id)
  return reply(200, { preset: rated(preset) })
})

export const unsharePreset = fromBlockbench(async context => {
  const { request, env } = context
  const { id, where, values } = await ownedPreset(context)
  const preset = await env.DB.prepare(`UPDATE presets SET shared = 0 WHERE id = ? AND ${where} RETURNING name, code`).bind(id, ...values).first()
  if (!preset) await refuseChange(env, id)
  await forgetCached(request, id)
  return reply(200, { preset })
})

export const deletePreset = fromBlockbench(async context => {
  const { request, env } = context
  const { id, user, where, values } = await ownedPreset(context)
  const [, deleted] = await env.DB.batch(deletingPresets(env, `id = ? AND ${where}`, id, ...values).concat(forgetOldCounts(env), user ? forgetUnusedUser(env, user) : []))
  if (!deleted.meta.changes) await refuseChange(env, id)
  await forgetCached(request, id)
  return reply(200, { deleted: true })
})

export const claimPresets = fromBlockbench(async context => {
  const { request, env } = context
  const user = await requireUser(context, "Sign in to move these presets to your account.")
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

export const submissionUsage = fromBlockbench(async context => {
  const user = await currentUser(context)
  const ip = await hashedIp(context)
  const { env } = context
  const ids = user ? (await env.DB.prepare(`SELECT id FROM presets WHERE user_id = ${USER_ROW} AND shared = 1`).bind(user.provider, user.providerId).all()).results.map(preset => preset.id) : []
  const votes = (await env.DB.prepare("SELECT preset_id, value FROM preset_votes WHERE ip_hash = ?").bind(user ? await accountHash(env, user) : ip).all()).results
  return reply(200, { used: await usedToday(env, user, ip), limit: LIMITS.perDay, unlimited: await hasUnlimitedShares(env, user), resetsAt: nextDay(), shared: ids, owned: user ? ids : [], votes: Object.fromEntries(votes.map(vote => [vote.preset_id, vote.value])) })
})
