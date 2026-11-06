import { LIMITS } from "../lib/limits.js"
import { decodeTitle } from "../lib/linkformat.js"
import { USER_ROW, forgetUnusedUser, saveUser, signedInUser } from "./accounts.js"
import { Refusal, guarded, hashed, jsonBody, reply, textField } from "./http.js"
import { accountHash, forgetCached } from "./presets.js"

const BATCH_BODY = LIMITS.savedBatch * (LIMITS.savedCode + 512)

async function requireUser(context) {
  const user = await signedInUser(context)
  if (!user) throw new Refusal(401, "You've been signed out. Sign in again to use the presets on your account.")
  return user
}

function shown({ name, code, shared }) {
  return shared === null ? { name, code } : { name, code, shared }
}

function savable(preset) {
  if (typeof preset?.code !== "string" || !preset.code || preset.code.length > LIMITS.savedCode) return false
  if (typeof preset.name !== "string" || !preset.name.trim() || Array.from(preset.name.trim()).length > LIMITS.name) return false
  try {
    decodeTitle(preset.code)
    return true
  } catch {
    return false
  }
}

function sharedId(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

async function codeHash(body) {
  if (typeof body.code !== "string" || !body.code) throw new Refusal(400, "This request isn't valid.")
  return hashed(body.code)
}

export const listSaved = guarded(async context => {
  const user = await requireUser(context)
  const { results } = await context.env.DB.prepare(`SELECT name, code, shared FROM saved_presets WHERE user_id = ${USER_ROW} ORDER BY id`).bind(user.provider, user.providerId).all()
  return reply(200, { presets: results.map(shown) })
})

export const addSaved = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context)
  const { presets } = await jsonBody(request, BATCH_BODY)
  if (!Array.isArray(presets) || presets.length > LIMITS.savedBatch) throw new Refusal(400, "This request isn't valid.")
  const { results } = await env.DB.prepare(`SELECT code_hash FROM saved_presets WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId).all()
  const existing = new Set(results.map(row => row.code_hash))
  const statements = []
  const kept = []
  for (const preset of presets) {
    const hash = savable(preset) ? await hashed(preset.code) : null
    if (hash && existing.has(hash)) continue
    if (!hash || existing.size >= LIMITS.savedPresets) {
      kept.push(preset?.code)
      continue
    }
    existing.add(hash)
    statements.push(env.DB.prepare(`INSERT INTO saved_presets (user_id, code_hash, code, name, shared) VALUES (${USER_ROW}, ?, ?, ?, ?) ON CONFLICT (user_id, code_hash) DO NOTHING`).bind(user.provider, user.providerId, hash, preset.code, preset.name.trim(), sharedId(preset.shared)))
  }
  if (statements.length) await env.DB.batch([saveUser(env, user)].concat(statements))
  return reply(200, { kept })
})

export const changeSaved = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context)
  const body = await jsonBody(request, LIMITS.savedCode + 512)
  const hash = await codeHash(body)
  const sets = []
  const values = []
  if (Object.hasOwn(body, "name")) {
    const name = textField(body, "name", "name", LIMITS.name)
    if (!name) throw new Refusal(400, "The name can't be empty.")
    sets.push("name = ?")
    values.push(name)
  }
  if (Object.hasOwn(body, "shared")) {
    sets.push("shared = ?")
    values.push(sharedId(body.shared))
  }
  if (!sets.length) throw new Refusal(400, "This request isn't valid.")
  await env.DB.prepare(`UPDATE saved_presets SET ${sets.join(", ")} WHERE user_id = ${USER_ROW} AND code_hash = ?`).bind(...values, user.provider, user.providerId, hash).run()
  return reply(200, { changed: true })
})

export const removeSaved = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context)
  const hash = await codeHash(await jsonBody(request, LIMITS.savedCode + 512))
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM saved_presets WHERE user_id = ${USER_ROW} AND code_hash = ?`).bind(user.provider, user.providerId, hash),
    forgetUnusedUser(env, user)
  ])
  return reply(200, { deleted: true })
})

export const deleteAccountData = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context)
  const row = [user.provider, user.providerId]
  const { results } = await env.DB.prepare(`SELECT id FROM presets WHERE user_id = ${USER_ROW}`).bind(...row).all()
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO deleted_presets (id) SELECT id FROM presets WHERE user_id = ${USER_ROW}`).bind(...row),
    env.DB.prepare(`DELETE FROM presets WHERE user_id = ${USER_ROW}`).bind(...row),
    env.DB.prepare(`DELETE FROM saved_presets WHERE user_id = ${USER_ROW}`).bind(...row),
    env.DB.prepare("DELETE FROM preset_votes WHERE ip_hash = ?").bind(await accountHash(env, user)),
    forgetUnusedUser(env, user)
  ])
  const ids = results.map(preset => preset.id)
  await forgetCached(request, ...ids)
  return reply(200, { deleted: ids })
})
