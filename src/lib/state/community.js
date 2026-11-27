import { computed, ref, watch } from "vue"
import { jsonOptions } from "../core/api.js"
import { LIMITS } from "../core/limits.js"
import { thisPlace } from "../core/place.js"
import { showNotice } from "./notices.js"
import { account, communityCall, onSignedIn, onSignedInOrOut } from "./account.js"
import { saveStore, store } from "./communityStore.js"

const API = "/api/presets"
const PAGE_LIFE = 30 * 60000
const POOL_RETRY = 60000
const PAGES_KEPT = 60
// must cover EDGE_SECONDS in src/server/http.js plus PAGE_LIFE
const CHANGE_LIFE = 60 * 60000

export const usage = ref(null)
const seeded = new Map()

export const ownPresets = ref(store.own)
export const accountPresets = ref(store.owned)
const presetTokens = ref(store.tokens)
export const managedPresets = computed(() => accountPresets.value.concat(Object.keys(presetTokens.value).map(Number)))

let usageRequest = null

onSignedIn(moveTokensToAccount)
onSignedInOrOut(() => refreshUsage(true))

watch(() => account.value?.id, () => {
  setOwn(Object.keys(store.tokens).map(Number))
  store.votes = {}
  setAccountPresets([])
  persist()
}, { flush: "sync" })

function persist() {
  const keys = Object.keys(store.pages).sort((a, b) => store.pages[b].at - store.pages[a].at)
  for (const key of keys.slice(PAGES_KEPT)) delete store.pages[key]
  for (const id of Object.keys(store.changes)) {
    if (!currentChange(id)) delete store.changes[id]
  }
  saveStore()
}

function request(path, options) {
  return communityCall(`${API}${path}`, options)
}

function posted(path, body) {
  return request(path, jsonOptions("POST", body))
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
  if (change.name) shown.name = change.name
  if (change.votes !== undefined && preset.votes <= change.votes) Object.assign(shown, { votes: change.votes, rating: change.rating })
  if (change.code && preset.code !== change.code) Object.assign(shown, { code: change.code, votes: change.votes, rating: change.rating, downloads: 0, ...(preset.week !== undefined && { week: 0 }) })
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

function pageKey({ sort, search, offset }) {
  return `${sort}|${search.trim().toLowerCase()}|${offset}`
}

function fresh(page) {
  return !!page && Date.now() - page.at < PAGE_LIFE
}

function shownPage({ sort, offset }, page) {
  const existing = page.presets.filter(preset => !currentChange(preset.id)?.deleted)
  const presets = sort === "needs" ? existing.filter(preset => !store.votes[preset.id] && !store.own.includes(preset.id)) : existing
  return { presets: presets.map(withMine), more: page.more, next: offset + page.presets.length }
}

export function cachedCommunity(query) {
  const page = store.pages[pageKey(query)]
  return fresh(page) ? shownPage(query, page) : null
}

export async function listCommunity(query) {
  const key = pageKey(query)
  let page = store.pages[key]
  if (!fresh(page)) {
    const params = new URLSearchParams({ sort: query.sort, offset: String(query.offset) })
    const term = query.search.trim().toLowerCase()
    if (term) params.set("q", term)
    page = { at: Date.now(), ...await request(`?${params}`) }
    store.pages[key] = page
    persist()
  }
  return shownPage(query, page)
}

export function seedCommunity({ page = null, preset = null }) {
  if (page) store.pages[pageKey({ ...page, offset: 0 })] = { at: Date.now(), presets: page.presets, more: page.more }
  if (preset) seeded.set(preset.id, preset)
}

export async function presetStats(ids) {
  const chunks = Array.from({ length: Math.ceil(ids.length / LIMITS.savedPresets) }, (chunk, index) => ids.slice(index * LIMITS.savedPresets, (index + 1) * LIMITS.savedPresets))
  const replies = await Promise.all(chunks.map(chunk => request(`/stats?ids=${chunk.join(",")}`)))
  return Object.assign({}, ...replies.map(reply => reply.stats))
}

export function cachedCommunityPreset(id) {
  if (currentChange(id)?.deleted) return null
  if (seeded.has(id)) return withMine(seeded.get(id))
  for (const page of Object.values(store.pages).concat(store.pool ?? [])) {
    const found = fresh(page) && page.presets.find(preset => preset.id === id)
    if (found) return withMine(found)
  }
  return null
}

export async function communityPreset(id) {
  if (currentChange(id)?.deleted) throw Object.assign(new Error("This preset doesn't exist."), { status: 404 })
  const cached = cachedCommunityPreset(id)
  if (cached) return cached
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
  usage.value = { used: store.usage.used, limit: store.usage.unlimited ? Infinity : LIMITS.perDay, unlimited: !!store.usage.unlimited, resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) }
}

export async function sharePublicly(code, name, id) {
  const options = jsonOptions("POST", { code, name, account: !!account.value, ...(id && { id }) })
  const result = await request("", id ? withToken(id, options) : options)
  delete store.changes[result.preset.id]
  addOwn([result.preset.id])
  if (result.onAccount) setAccountPresets(store.owned.concat(result.preset.id))
  if (result.token) keepToken(result.preset.id, result.token)
  forgetLists()
  const today = store.usage?.day === currentDay() ? store.usage : { used: 0 }
  store.usage = { ...today, day: currentDay(), used: today.used + 1 }
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

function forgetLists() {
  store.pages = {}
  store.pool = null
}

function setOwn(ids) {
  store.own = ids
  ownPresets.value = ids
}

function addOwn(ids) {
  setOwn(Array.from(new Set(store.own.concat(ids))))
}

function setAccountPresets(ids) {
  store.owned = ids
  accountPresets.value = ids
}

function keepToken(id, token) {
  store.tokens[id] = token
  presetTokens.value = { ...store.tokens }
}

function forgetTokens(ids) {
  for (const id of ids) delete store.tokens[id]
  presetTokens.value = { ...store.tokens }
}

function withToken(id, options) {
  const token = store.tokens[id]
  return token ? { ...options, headers: { ...options.headers, "X-Preset-Token": token } } : options
}

async function moveTokensToAccount() {
  const ids = Object.keys(store.tokens).map(Number)
  if (!ids.length) return
  try {
    let moved = 0
    for (let start = 0; start < ids.length; start += LIMITS.claimBatch) {
      const batch = ids.slice(start, start + LIMITS.claimBatch)
      const reply = await communityCall(`${API}/claim`, jsonOptions("POST", { tokens: batch.map(id => ({ id, token: store.tokens[id] })) }))
      moved += reply.moved.length
      forgetTokens(batch)
    }
    forgetLists()
    persist()
    if (moved) showNotice(`Moved ${moved} shared ${moved === 1 ? "preset" : "presets"} from ${thisPlace()} to your account.`)
  } catch (err) {
    console.error(err)
  }
}

export async function renameShared(id, name) {
  const { preset } = await request(`/${id}`, withToken(id, jsonOptions("PATCH", { name })))
  remember(id, { name: preset.name })
  forgetLists()
  persist()
  return preset.name
}

export async function replaceShared(id, code, name) {
  const { preset } = await request(`/${id}`, withToken(id, jsonOptions("PUT", { code, name })))
  remember(id, { name: preset.name, code: preset.code, votes: preset.votes, rating: preset.rating, downloads: preset.downloads })
  delete store.votes[id]
  store.downloads = store.downloads.filter(item => item !== id)
  forgetLists()
  persist()
  return preset
}

function forgetShared(id) {
  remember(id, { deleted: true })
  forgetLists()
  setAccountPresets(store.owned.filter(item => item !== id))
  setOwn(store.own.filter(item => item !== id))
}

export async function unshareShared(id) {
  const { preset } = await request(`/${id}/unshare`, withToken(id, jsonOptions("POST")))
  forgetShared(id)
  persist()
  return preset
}

export async function deleteShared(id) {
  await request(`/${id}`, withToken(id, { method: "DELETE" }))
  forgetShared(id)
  forgetTokens([id])
  persist()
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
    const { used, shared, owned = [], votes, unlimited = false } = await request("/usage")
    store.usage = { day: currentDay(), used, checkedOwn: true, unlimited }
    if (votes) store.votes = votes
    addOwn(shared)
    setAccountPresets(owned)
    persist()
    showUsage()
  } catch (err) {
    usage.value = null
    console.error(err)
  }
}

export function presetToAsk(source) {
  return source && !store.votes[source.id] && !store.own.includes(source.id) ? source : null
}

export async function countDownload({ id, downloads, week }) {
  if (store.downloads.includes(id)) return null
  store.downloads.push(id)
  persist()
  try {
    const { counted } = await request(`/${id}/download`, { method: "POST" })
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
