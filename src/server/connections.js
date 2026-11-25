import { KEY_HASH } from "../lib/core/connecting.js"
import { acceptsKey, hashed } from "./http.js"

const KEPT = 90 * 86400000
const NOTED = 86400000
export const MOST_CONNECTIONS = 10

function keyOf(request) {
  const [, key] = request.headers.get("Authorization")?.match(/^Bearer ([0-9a-f]{64})$/) ?? []
  return key && acceptsKey(request) ? key : null
}

export function usesKey(request) {
  return keyOf(request) !== null
}

export async function connectedUser({ request, env }) {
  const keyHash = await hashed(keyOf(request))
  const now = Date.now()
  const row = await env.DB.prepare("SELECT provider, provider_id AS providerId, name, avatar, created_at AS issued, used_at AS usedAt FROM connections WHERE key_hash = ? AND used_at > ?").bind(keyHash, now - KEPT).first()
  if (!row) return null
  const { usedAt, ...user } = row
  if (usedAt < now - NOTED) await env.DB.prepare("UPDATE connections SET used_at = ? WHERE key_hash = ?").bind(now, keyHash).run()
  return { ...user, id: `${user.provider}:${user.providerId}`, email: "" }
}

export async function forgetKey({ request, env }) {
  await env.DB.prepare("DELETE FROM connections WHERE key_hash = ?").bind(await hashed(keyOf(request))).run()
}

export function validKeyHash(value) {
  return typeof value === "string" && KEY_HASH.test(value)
}

export function addConnection(env, user, keyHash) {
  const now = Date.now()
  return [
    env.DB.prepare("DELETE FROM connections WHERE used_at < ?").bind(now - KEPT),
    env.DB.prepare("DELETE FROM connections WHERE provider = ?1 AND provider_id = ?2 AND key_hash NOT IN (SELECT key_hash FROM connections WHERE provider = ?1 AND provider_id = ?2 ORDER BY used_at DESC LIMIT ?3)").bind(user.provider, user.providerId, MOST_CONNECTIONS - 1),
    env.DB.prepare("INSERT INTO connections (key_hash, provider, provider_id, name, avatar, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash").bind(keyHash, user.provider, user.providerId, user.name, user.avatar, now, now)
  ]
}

export async function connectionsOf(env, user) {
  return (await env.DB.prepare("SELECT key_hash AS id, created_at AS createdAt, used_at AS usedAt FROM connections WHERE provider = ? AND provider_id = ? AND used_at > ? ORDER BY used_at DESC").bind(user.provider, user.providerId, Date.now() - KEPT).all()).results
}

export function removeConnection(env, user, keyHash) {
  return env.DB.prepare("DELETE FROM connections WHERE key_hash = ? AND provider = ? AND provider_id = ?").bind(keyHash, user.provider, user.providerId)
}

export function updateConnections(env, user) {
  return env.DB.prepare("UPDATE connections SET name = ?, avatar = ? WHERE provider = ? AND provider_id = ?").bind(user.name, user.avatar, user.provider, user.providerId)
}

export function removeConnections(env, user) {
  return env.DB.prepare("DELETE FROM connections WHERE provider = ? AND provider_id = ?").bind(user.provider, user.providerId)
}
