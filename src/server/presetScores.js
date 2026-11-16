import { LIMITS } from "../lib/core/limits.js"
import { signedInUser } from "./accounts.js"
import { INVALID, Refusal, guarded, idParam, jsonBody, reply } from "./http.js"
import { MISSING, SCORES_COUNTED, STAT_COLUMNS, accountHash, dayNumber, hashedIp, rated, requirePreset } from "./presets.js"

export const presetStats = guarded(async ({ request, env }) => {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).map(Number)
  if (ids.length > LIMITS.savedPresets || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Refusal(400, INVALID)
  if (!ids.length) return reply(200, { stats: {} })
  const { results } = await env.DB.prepare(`SELECT id, ${STAT_COLUMNS} FROM presets WHERE shared = 1 AND id IN (${ids.join(", ")})`).all()
  return reply(200, { stats: Object.fromEntries(results.map(row => [row.id, rated(row)])) })
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
