import { LIMITS } from "../lib/limits.js"
import { decodeTitle } from "../lib/linkformat.js"
import { USER_ROW, activeUser, forgetUnusedUser, requireUser, saveUser } from "./accounts.js"
import { INVALID, Refusal, guarded, jsonBody, reply, textField } from "./http.js"
import { NEXT_ID, deletingPresets } from "./presets.js"

const BATCH_BODY = LIMITS.savedBatch * (LIMITS.savedCode + 512)
const SIGNED_OUT = "You've been signed out. Sign in again to use the presets on your account."

function shown({ id, name, code, shared }) {
  return shared ? { name, code, shared: id } : { name, code }
}

function savableCode(code) {
  if (typeof code !== "string" || !code || code.length > LIMITS.savedCode) return false
  try {
    decodeTitle(code)
    return true
  } catch {
    return false
  }
}

function savable(preset) {
  if (typeof preset?.name !== "string" || !preset.name.trim() || Array.from(preset.name.trim()).length > LIMITS.name) return false
  return savableCode(preset.code)
}

function requireCode(body) {
  if (typeof body.code !== "string" || !body.code) throw new Refusal(400, INVALID)
  return body.code
}

export const listSaved = guarded(async context => {
  const user = await requireUser(context, SIGNED_OUT)
  const { results } = await context.env.DB.prepare(`SELECT id, name, code, shared FROM presets WHERE user_id = ${USER_ROW} ORDER BY id`).bind(user.provider, user.providerId).all()
  return reply(200, { presets: results.map(shown) })
})

export const addSaved = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, SIGNED_OUT, activeUser)
  const { presets } = await jsonBody(request, BATCH_BODY)
  if (!Array.isArray(presets) || presets.length > LIMITS.savedBatch) throw new Refusal(400, INVALID)
  const { results } = await env.DB.prepare(`SELECT code, shared FROM presets WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId).all()
  const existing = new Set(results.map(row => row.code))
  let hidden = results.filter(row => !row.shared).length
  const statements = []
  const kept = []
  for (const preset of presets) {
    const fits = savable(preset)
    if (fits && existing.has(preset.code)) continue
    if (!fits || hidden >= LIMITS.savedPresets) {
      kept.push(preset?.code)
      continue
    }
    existing.add(preset.code)
    hidden++
    statements.push(env.DB.prepare(`INSERT INTO presets (id, user_id, code, name) VALUES (${NEXT_ID}, ${USER_ROW}, ?, ?) ON CONFLICT (user_id, code) DO NOTHING`).bind(user.provider, user.providerId, preset.code, preset.name.trim()))
  }
  if (statements.length) await env.DB.batch([saveUser(env, user)].concat(statements))
  return reply(200, { kept })
})

export const changeSaved = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, SIGNED_OUT)
  const body = await jsonBody(request, LIMITS.savedCode * 2 + 512)
  const code = requireCode(body)
  const sets = []
  const values = []
  if (Object.hasOwn(body, "replacement")) {
    if (!savableCode(body.replacement)) throw new Refusal(400, INVALID)
    const taken = await env.DB.prepare(`SELECT id FROM presets WHERE user_id = ${USER_ROW} AND code = ?`).bind(user.provider, user.providerId, body.replacement).first()
    if (taken) throw new Refusal(409, "You already have a preset with this title.")
    sets.push("code = ?")
    values.push(body.replacement)
  }
  if (Object.hasOwn(body, "name")) {
    const name = textField(body, "name", "name", LIMITS.name)
    if (!name) throw new Refusal(400, "The name can't be empty.")
    sets.push("name = ?")
    values.push(name)
  }
  if (!sets.length) throw new Refusal(400, INVALID)
  const { meta } = await env.DB.prepare(`UPDATE presets SET ${sets.join(", ")} WHERE user_id = ${USER_ROW} AND code = ? AND shared = 0`).bind(...values, user.provider, user.providerId, code).run()
  if (!meta.changes) throw new Refusal(404, "This preset isn't on your account any more.")
  return reply(200, { changed: true })
})

export const removeSaved = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, SIGNED_OUT)
  const code = requireCode(await jsonBody(request, LIMITS.savedCode + 512))
  await env.DB.batch(deletingPresets(env, `user_id = ${USER_ROW} AND code = ? AND shared = 0`, user.provider, user.providerId, code).concat(forgetUnusedUser(env, user)))
  return reply(200, { deleted: true })
})
