export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function nextDay() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

export async function takeSlot(env, { table, column, owner }, limit = null) {
  const slot = { table, column, owner, day: today() }
  const { meta } = await env.DB.prepare(`INSERT INTO ${table} (${column}, day, count) VALUES (?1, ?2, 1) ON CONFLICT (${column}, day) DO UPDATE SET count = count + 1 WHERE ?3 IS NULL OR count < ?3`).bind(owner, slot.day, limit).run()
  return meta.changes ? slot : null
}

export function returnSlot(env, { table, column, owner, day }) {
  return env.DB.prepare(`UPDATE ${table} SET count = count - 1 WHERE ${column} = ? AND day = ? AND count > 0`).bind(owner, day).run()
}
