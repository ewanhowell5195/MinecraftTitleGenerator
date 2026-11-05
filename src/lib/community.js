import { ref } from "vue"
import { LIMITS } from "./limits.js"

const API = "/api/presets"
const STORAGE = "minecraft-title-community"
const PAGE_LIFE = 30 * 60000
const POOL_RETRY = 60000
const PAGES_KEPT = 60
// must cover EDGE_SECONDS in src/server/presets.js plus PAGE_LIFE
const CHANGE_LIFE = 60 * 60000

export const usage = ref(null)

const store = read()

export const ownPresets = ref(store.own)

let usageRequest = null

function read() {
  const empty = { pages: {}, votes: {}, downloads: [], own: [], changes: {}, usage: null, pool: null }
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE)) }
  } catch {
    return empty
  }
}

function persist() {
  const keys = Object.keys(store.pages).sort((a, b) => store.pages[b].at - store.pages[a].at)
  for (const key of keys.slice(PAGES_KEPT)) delete store.pages[key]
  for (const id of Object.keys(store.changes)) {
    if (!currentChange(id)) delete store.changes[id]
  }
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store))
  } catch (err) {
    console.error(err)
  }
}

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options)
  const body = await response.json().catch(() => null)
  if (response.ok) return body
  const error = new Error(body?.error ?? `The community presets aren't available right now (${response.status}).`)
  error.status = response.status
  error.id = body?.id
  throw error
}

function posted(path, body) {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })
}

function currentChange(id) {
  const change = store.changes[id]
  return change && Date.now() - change.at < CHANGE_LIFE ? change : null
}

function remember(id, values) {
  store.changes[id] = { ...currentChange(id), ...values, at: Date.now() }
}

function withMine(preset) {
  const shown = { ...preset, vote: store.votes[preset.id] ?? 0, own: store.own.includes(preset.id) }
  const change = currentChange(preset.id)
  if (!change) return shown
  if (change.votes !== undefined && preset.votes <= change.votes) Object.assign(shown, { votes: change.votes, rating: change.rating })
  const missing = Math.max(0, (change.downloads ?? 0) - preset.downloads)
  shown.downloads += missing
  if (preset.week !== undefined) shown.week += missing
  return shown
}

async function freshPool() {
  const { presets } = await request("?sort=random")
  store.pool = { at: Date.now(), presets }
  persist()
  return presets
}

function poolIsCurrent() {
  return store.pool && Date.now() - store.pool.at < PAGE_LIFE
}

export async function listCommunity({ sort, search, offset }) {
  const term = search.trim().toLowerCase()
  const key = `${sort}|${term}|${offset}`
  let page = store.pages[key]
  if (!page || Date.now() - page.at >= PAGE_LIFE) {
    const query = new URLSearchParams({ sort, offset: String(offset) })
    if (term) query.set("q", term)
    page = { at: Date.now(), ...await request(`?${query}`) }
    store.pages[key] = page
    persist()
  }
  const presets = sort === "needs" ? page.presets.filter(preset => !store.votes[preset.id] && !store.own.includes(preset.id)) : page.presets
  return { presets: presets.map(withMine), more: page.more, next: offset + page.presets.length }
}

export async function communityPreset(id) {
  for (const page of Object.values(store.pages).concat(store.pool ?? [])) {
    const found = Date.now() - page.at < PAGE_LIFE && page.presets.find(preset => preset.id === id)
    if (found) return withMine(found)
  }
  const { preset } = await request(`/${id}`)
  return withMine(preset)
}

export async function randomCommunityPreset(exclude = null) {
  const others = list => list.filter(preset => preset.id !== exclude)
  let choices = poolIsCurrent() ? others(store.pool.presets) : []
  const justFetched = store.pool && Date.now() - store.pool.at < POOL_RETRY
  if (!choices.length && !(poolIsCurrent() && justFetched)) choices = others(await freshPool())
  const preset = choices[Math.floor(Math.random() * choices.length)]
  return preset ? withMine(preset) : null
}

function currentDay() {
  return new Date().toISOString().slice(0, 10)
}

function showUsage() {
  const now = new Date()
  usage.value = { used: store.usage.used, limit: LIMITS.perDay, resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) }
}

export async function sharePublicly(code, name) {
  const result = await posted("", { code, name })
  addOwn([result.preset.id])
  store.pages = {}
  store.pool = null
  store.usage = { ...(store.usage?.day === currentDay() ? store.usage : { used: 0 }), day: currentDay(), used: (store.usage?.day === currentDay() ? store.usage.used : 0) + 1 }
  persist()
  showUsage()
  return result
}

export async function voteOn(id, value) {
  try {
    const { votes, rating, vote } = await posted(`/${id}/vote`, { value })
    store.votes[id] = vote
    remember(id, { votes, rating })
    persist()
    return { votes, rating, vote }
  } catch (err) {
    if (err.status === 403) {
      addOwn([id])
      persist()
    }
    throw err
  }
}

function addOwn(ids) {
  store.own = Array.from(new Set(store.own.concat(ids)))
  ownPresets.value = store.own
}

export function refreshUsage(force = false) {
  if (!force && store.usage?.day === currentDay() && store.usage.checkedOwn) {
    showUsage()
    return Promise.resolve()
  }
  usageRequest ??= fetchUsage().finally(() => usageRequest = null)
  return usageRequest
}

async function fetchUsage() {
  try {
    const { used, shared } = await request("/usage")
    store.usage = { day: currentDay(), used, checkedOwn: true }
    addOwn(shared)
    persist()
    showUsage()
  } catch (err) {
    usage.value = null
    console.error(err)
  }
}

export async function countDownload({ id, downloads, week }) {
  if (store.downloads.includes(id)) return null
  store.downloads.push(id)
  persist()
  try {
    const { counted } = await posted(`/${id}/download`)
    if (!counted) return null
    remember(id, { downloads: downloads + 1 })
    persist()
    return week === undefined ? { downloads: downloads + 1 } : { downloads: downloads + 1, week: week + 1 }
  } catch (err) {
    store.downloads = store.downloads.filter(item => item !== id)
    persist()
    throw err
  }
}
