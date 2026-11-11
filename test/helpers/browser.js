import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { mock } from "node:test"

export function quietStorage() {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

export function stubStorage() {
  const stored = new Map()
  globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
  return stored
}

export function forbidFetch() {
  globalThis.fetch = () => assert.fail("fetch must not be called")
}

export function fakeTimeouts() {
  mock.timers.enable({ apis: ["setTimeout"] })
}

export function fakeReplies({ record = (method, url, body) => ({ method, url, body }), missing } = {}) {
  const requests = []
  const replies = {}
  globalThis.fetch = async (url, options) => {
    const method = options?.method ?? "GET"
    const body = options?.body ? JSON.parse(options.body) : undefined
    requests.push(record(method, url, body))
    const reply = replies[`${method} ${url}`] ?? replies[method] ?? missing
    if (!reply) throw new Error(`no reply set for ${method} ${url}`)
    const value = typeof reply === "function" ? reply(body) : reply
    return { ok: (value.status ?? 200) < 400, status: value.status ?? 200, json: async () => value.body }
  }
  function reset() {
    requests.length = 0
    for (const key of Object.keys(replies)) delete replies[key]
  }
  return { requests, replies, reset }
}

export function viteEnv({ DEV }) {
  function load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (!url.endsWith("/src/lib/stats.js")) return result
    return { ...result, source: `import.meta.env = { DEV: ${DEV} }\n${result.source}` }
  }
  registerHooks({ load })
}
