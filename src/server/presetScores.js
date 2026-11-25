import { LIMITS } from "../lib/core/limits.js"
import { activeUser } from "./accounts.js"
import { INVALID, Refusal, fromBlockbench, guarded, idParam, jsonBody, reply } from "./http.js"
import { MISSING, SCORES_COUNTED, STAT_COLUMNS, accountHash, dayNumber, hashedIp, rated, requirePreset } from "./presets.js"

const OWN = "You can't vote on a preset you shared."

export const presetStats = guarded(async ({ request, env }) => {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).map(Number)
  if (ids.length > LIMITS.savedPresets || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Refusal(400, INVALID)
  if (!ids.length) return reply(200, { stats: {} })
  const { results } = await env.DB.prepare(`SELECT id, ${STAT_COLUMNS} FROM presets WHERE shared = 1 AND id IN (${ids.join(", ")})`).all()
  return reply(200, { stats: Object.fromEntries(results.map(row => [row.id, rated(row)])) })
})

export const votePreset = fromBlockbench(async context => {
  const { request, env, params } = context
  const id = idParam(params, MISSING)
  const { value } = await jsonBody(request)
  if (value !== 1 && value !== -1) throw new Refusal(400, "That isn't a valid vote.")
  const { owner } = await requirePreset(env, id, " AND shared = 1")
  const ip = await hashedIp(context)
  const user = await activeUser(context)
  if (user && owner === user.id) throw new Refusal(403, OWN)
  const voter = user ? await accountHash(env, user) : ip
  const [cast, updated] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO preset_votes (preset_id, ip_hash, value) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM presets WHERE id = ?1 AND shared = 1 AND (user_id IS NULL OR user_id IS NOT (SELECT id FROM users WHERE provider = ?4 AND provider_id = ?5))) ON CONFLICT (preset_id, ip_hash) DO UPDATE SET value = excluded.value RETURNING value`).bind(id, voter, value, user?.provider ?? "", user?.providerId ?? ""),
    env.DB.prepare(`UPDATE presets SET ${SCORES_COUNTED} WHERE id = ? AND shared = 1 RETURNING votes, rating`).bind(id)
  ])
  if (!updated.results.length) throw new Refusal(404, MISSING)
  if (!cast.results.length) throw new Refusal(403, OWN)
  return reply(200, { ...rated(updated.results[0]), vote: value })
})

export const countDownload = fromBlockbench(async context => {
  const { env, params } = context
  const id = idParam(params, MISSING)
  await requirePreset(env, id, " AND shared = 1")
  const ip = await hashedIp(context)
  // changes() in each statement counts the rows of the statement before it in this batch
  const [counted] = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO preset_downloads (preset_id, ip_hash) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM presets WHERE id = ?1 AND shared = 1) RETURNING preset_id").bind(id, ip),
    env.DB.prepare("UPDATE presets SET downloads = downloads + 1, week_downloads = week_downloads + 1 WHERE id = ? AND changes() = 1").bind(id),
    env.DB.prepare("INSERT INTO preset_daily_downloads (day, preset_id, count) SELECT ?, ?, 1 WHERE changes() = 1 ON CONFLICT (day, preset_id) DO UPDATE SET count = count + 1").bind(dayNumber(), id)
  ])
  if (!counted.results.length) await requirePreset(env, id, " AND shared = 1")
  return reply(200, { counted: counted.results.length > 0 })
})
