import { ref } from "vue"
import { LIMITS } from "./limits.js"
import { showNotice } from "./notices.js"
import { ACCOUNT_CHANNEL, SIGN_IN_RETURN } from "./providers.js"

const API = "/api/presets"
const ACCOUNT_API = "/api/account"
const SAVED_API = "/api/saved"
const STORAGE = "minecraft-title-community"
const PAGE_LIFE = 30 * 60000
const POOL_RETRY = 60000
const PAGES_KEPT = 60
// must cover EDGE_SECONDS in src/server/presets.js plus PAGE_LIFE
const CHANGE_LIFE = 60 * 60000

export const usage = ref(null)

const store = read()

export const ownPresets = ref(store.own)
export const accountPresets = ref(store.owned)
export const account = ref(store.account)
export const signInProviders = ref(store.providers)
export const accountChanges = ref(0)

let usageRequest = null
let accountRequest = null
let accountChecked = false
let channel = null

function read() {
  const empty = { pages: {}, votes: {}, downloads: [], own: [], owned: [], account: null, providers: [], changes: {}, usage: null, pool: null }
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

async function called(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => null)
  if (response.ok) return body
  if (response.status === 401) refreshAccount(true)
  const error = new Error(body?.error ?? `The community presets aren't available right now (${response.status}).`)
  error.status = response.status
  error.id = body?.id
  throw error
}

function request(path, options) {
  return called(`${API}${path}`, options)
}

function jsonOptions(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }
}

function sent(method, path, body) {
  return request(path, jsonOptions(method, body))
}

function posted(path, body) {
  return sent("POST", path, body)
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
  const existing = page.presets.filter(preset => !currentChange(preset.id)?.deleted)
  const presets = sort === "needs" ? existing.filter(preset => !store.votes[preset.id] && !store.own.includes(preset.id)) : existing
  return { presets: presets.map(withMine), more: page.more, next: offset + page.presets.length }
}

export async function communityPreset(id) {
  if (currentChange(id)?.deleted) throw Object.assign(new Error("This preset doesn't exist."), { status: 404 })
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
  usage.value = { used: store.usage.used, limit: store.usage.unlimited ? Infinity : LIMITS.perDay, unlimited: !!store.usage.unlimited, resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) }
}

export async function sharePublicly(code, name) {
  const result = await posted("", { code, name, account: !!account.value })
  addOwn([result.preset.id])
  if (result.onAccount) setAccountPresets(store.owned.concat(result.preset.id))
  forgetLists()
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

function forgetLists() {
  store.pages = {}
  store.pool = null
}

function addOwn(ids) {
  store.own = Array.from(new Set(store.own.concat(ids)))
  ownPresets.value = store.own
}

function setAccountPresets(ids) {
  store.owned = ids
  accountPresets.value = ids
}

export async function renameShared(id, name) {
  const { preset } = await sent("PATCH", `/${id}`, { name })
  remember(id, { name: preset.name })
  forgetLists()
  persist()
  return preset.name
}

export async function deleteShared(id) {
  await request(`/${id}`, { method: "DELETE" })
  remember(id, { deleted: true })
  forgetLists()
  setAccountPresets(store.owned.filter(item => item !== id))
  store.own = store.own.filter(item => item !== id)
  ownPresets.value = store.own
  persist()
}

function setAccount(user) {
  if (store.account?.id !== user?.id) {
    store.own = []
    ownPresets.value = store.own
    store.votes = {}
    setAccountPresets([])
  }
  store.account = user
  account.value = user
  persist()
}

function announceAccountChange() {
  channel?.postMessage("changed")
}

function listenForAccountChanges() {
  if (channel) return
  channel = new BroadcastChannel(ACCOUNT_CHANNEL)
  channel.onmessage = () => refreshAccount(true)
}

export function refreshAccount(force = false) {
  listenForAccountChanges()
  if (accountChecked && !force) return Promise.resolve()
  accountRequest ??= fetchAccount().finally(() => accountRequest = null)
  return accountRequest
}

async function fetchAccount() {
  try {
    const { user, providers = [] } = await called(ACCOUNT_API)
    const wasSignedIn = !!store.account
    const changed = store.account?.id !== user?.id
    accountChecked = true
    store.providers = providers
    signInProviders.value = providers
    setAccount(user)
    if (user || wasSignedIn) await refreshUsage(true)
    if (changed) accountChanges.value++
  } catch (err) {
    console.error(err)
  }
}

export function signIn(provider) {
  const url = `${ACCOUNT_API}/login/${provider}?return=${encodeURIComponent(location.origin)}`
  listenForAccountChanges()
  if (window.open(url, "signin", "popup,width=520,height=760")) return
  sessionStorage.setItem(SIGN_IN_RETURN, location.href)
  location.assign(url)
}

export function isDeleted(id) {
  return !!currentChange(id)?.deleted
}

export async function loadSaved() {
  return (await called(SAVED_API)).presets
}

export async function uploadSaved(presets) {
  const kept = []
  for (let start = 0; start < presets.length; start += LIMITS.savedBatch) {
    const reply = await called(SAVED_API, jsonOptions("POST", { presets: presets.slice(start, start + LIMITS.savedBatch) }))
    kept.push(...reply.kept)
  }
  return kept
}

export function changeSaved(code, changes) {
  return called(SAVED_API, jsonOptions("PATCH", { code, ...changes }))
}

export function deleteSaved(code) {
  return called(SAVED_API, jsonOptions("DELETE", { code }))
}

export async function deleteAccountData() {
  try {
    const { deleted } = await called(`${ACCOUNT_API}/data`, { method: "DELETE" })
    for (const id of deleted) remember(id, { deleted: true })
    forgetLists()
    persist()
    await signOut()
  } catch (err) {
    console.error(err)
    showNotice(`Couldn't delete your data: ${err.message}`)
  }
}

export async function signOut() {
  try {
    await called(`${ACCOUNT_API}/logout`, { method: "POST" })
    await fetchAccount()
    announceAccountChange()
  } catch (err) {
    console.error(err)
    showNotice(`Couldn't sign out: ${err.message}`)
  }
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
