import { ref } from "vue"
import { LIMITS } from "./limits.js"

const API = "/api/presets"
const STORAGE = "minecraft-title-community"
const PAGE_LIFE = 30 * 60000
const FRESH_SHUFFLE = 60000
const PAGES_KEPT = 60

export const usage = ref(null)

const store = read()

function read() {
  const empty = { pages: {}, votes: {}, downloads: [], usage: null, pool: null }
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE)) }
  } catch {
    return empty
  }
}

function persist() {
  const keys = Object.keys(store.pages).sort((a, b) => store.pages[b].at - store.pages[a].at)
  for (const key of keys.slice(PAGES_KEPT)) delete store.pages[key]
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

function withMyVote(preset) {
  return { ...preset, vote: store.votes[preset.id] ?? 0 }
}

function shuffled(items) {
  const list = items.slice()
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    const swapped = list[index]
    list[index] = list[other]
    list[other] = swapped
  }
  return list
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
  if (sort === "random" && !term) return { presets: (poolIsCurrent() ? store.pool.presets : await freshPool()).map(withMyVote), more: false, next: 0 }
  const key = `${sort}|${term}|${offset}`
  let page = store.pages[key]
  if (!page || Date.now() - page.at >= PAGE_LIFE) {
    const query = new URLSearchParams({ sort, offset: String(offset) })
    if (term) query.set("q", term)
    page = { at: Date.now(), ...await request(`?${query}`) }
    if (sort !== "random") {
      store.pages[key] = page
      persist()
    }
  }
  const presets = sort === "needs" ? page.presets.filter(preset => !store.votes[preset.id]) : page.presets
  return { presets: presets.map(withMyVote), more: page.more, next: offset + page.presets.length }
}

export async function shuffleCommunity() {
  const usable = store.pool && Date.now() - store.pool.at < FRESH_SHUFFLE
  const presets = usable ? shuffled(store.pool.presets) : await freshPool()
  return { presets: presets.map(withMyVote), more: false, next: 0 }
}

export async function randomCommunityPreset() {
  const presets = poolIsCurrent() ? store.pool.presets : await freshPool()
  const preset = presets[Math.floor(Math.random() * presets.length)]
  return preset ? withMyVote(preset) : null
}

function patched(id, changes) {
  for (const page of Object.values(store.pages).concat(store.pool ?? [])) {
    for (const preset of page.presets) {
      if (preset.id === id) Object.assign(preset, changes)
    }
  }
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
  for (const key of Object.keys(store.pages)) {
    if (key.startsWith("new|") || key.startsWith("needs|")) delete store.pages[key]
  }
  store.usage = { day: currentDay(), used: (store.usage?.day === currentDay() ? store.usage.used : 0) + 1 }
  persist()
  showUsage()
  return result
}

export async function voteOn(id, value) {
  const { votes, rating, vote } = await posted(`/${id}/vote`, { value })
  store.votes[id] = vote
  patched(id, { votes, rating })
  persist()
  return { votes, rating, vote }
}

export async function refreshUsage(force = false) {
  if (!force && store.usage?.day === currentDay()) {
    showUsage()
    return
  }
  try {
    const { used } = await request("/usage")
    store.usage = { day: currentDay(), used }
    persist()
    showUsage()
  } catch (err) {
    usage.value = null
    console.error(err)
  }
}

export async function countDownload(id) {
  if (store.downloads.includes(id)) return
  store.downloads.push(id)
  persist()
  try {
    await posted(`/${id}/download`)
  } catch (err) {
    store.downloads = store.downloads.filter(item => item !== id)
    persist()
    throw err
  }
}
