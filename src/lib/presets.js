import { ref, watch } from "vue"
import { account, changeSaved, deleteSaved, loadSaved, refreshUsage, sharePublicly, uploadSaved } from "./community.js"
import { fileError, isDefaultTitle, openTitleData, titleData } from "./file.js"
import { LIMITS } from "./limits.js"
import { decodeTitle, encodeTitle } from "./linkformat.js"
import { capitalWords } from "./names.js"
import { showNotice } from "./notices.js"
import { titleText } from "./scene.js"
import { submitStats } from "./stats.js"

const STORAGE = "minecraft-title-presets"
const FALLBACK_NAME = "Title"
export const NAME_LIMIT = LIMITS.name

export const presets = ref([])
export const presetsLoading = ref(false)
export const presetsError = ref("")
export const savedPreset = ref(null)
export const namingPreset = ref(null)
export const namingShared = ref(false)

let opening = 0
let queue = Promise.resolve()

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE))
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function queued(send) {
  const run = queue.then(send, send)
  queue = run.catch(() => {})
  return run
}

function write(list, send) {
  if (!account.value) {
    localStorage.setItem(STORAGE, JSON.stringify(list))
    presets.value = list
    return
  }
  const previous = presets.value
  presets.value = list
  queued(send).catch(err => {
    console.error(err)
    presets.value = previous
    showNotice(err.message)
  })
}

async function moveLocalPresets() {
  const list = await loadSaved()
  const onAccount = new Set(list.map(preset => preset.code))
  const local = read()
  const taken = new Set(list.map(preset => preset.name))
  const moving = local.filter(preset => !onAccount.has(preset.code)).map(preset => {
    const name = uniqueName(preset.name, taken)
    taken.add(name)
    return { ...preset, name }
  })
  const kept = new Set(moving.length ? await uploadSaved(moving) : [])
  localStorage.setItem(STORAGE, JSON.stringify(local.filter(preset => kept.has(preset.code))))
  const added = moving.filter(preset => !kept.has(preset.code))
  return { list: list.concat(added), added: added.length, kept: kept.size }
}

function movedMessage(added, kept) {
  const parts = []
  if (added) parts.push(`Added ${added} ${added === 1 ? "preset" : "presets"} from this browser to your account.`)
  if (kept) parts.push(`${kept} ${kept === 1 ? "preset" : "presets"} couldn't be added, so ${kept === 1 ? "it stays" : "they stay"} in this browser. Accounts hold up to ${LIMITS.savedPresets}.`)
  return parts.join(" ")
}

async function openAccount(id, previous) {
  const current = ++opening
  presetsError.value = ""
  if (!id) {
    presetsLoading.value = false
    presets.value = read()
    return
  }
  presets.value = []
  presetsLoading.value = true
  try {
    const { list, added, kept } = await queued(moveLocalPresets)
    if (current !== opening) return
    const onAccount = new Set(list.map(preset => preset.code))
    presets.value = list.concat(presets.value.filter(preset => !onAccount.has(preset.code)))
    const message = movedMessage(added, previous === undefined ? 0 : kept)
    if (message) showNotice(message)
  } catch (err) {
    if (current !== opening) return
    console.error(err)
    presetsError.value = `Couldn't load your presets: ${err.message}`
  } finally {
    if (current === opening) presetsLoading.value = false
  }
}

watch(() => account.value?.id ?? null, openAccount, { immediate: true, flush: "sync" })

function uniqueName(name, taken = new Set(presets.value.map(preset => preset.name))) {
  if (!taken.has(name)) return name
  let number = 2
  while (taken.has(`${name} ${number}`)) number++
  return `${name} ${number}`
}

export function addPreset(name, code) {
  const existing = presets.value.find(preset => preset.code === code)
  if (existing) return existing
  const preset = { name: uniqueName(name || FALLBACK_NAME), code }
  write(presets.value.concat(preset), async () => {
    const kept = await uploadSaved([preset])
    if (kept.length) throw new Error(`${preset.name} couldn't be saved to your account. Accounts hold up to ${LIMITS.savedPresets} presets.`)
  })
  return preset
}

export function renamePreset(preset, name) {
  const trimmed = name.trim().slice(0, NAME_LIMIT)
  if (!trimmed) return preset
  const renamed = { ...preset, name: trimmed }
  write(presets.value.map(item => item.code === preset.code ? renamed : item), () => changeSaved(preset.code, { name: trimmed }))
  return renamed
}

export function markShared(preset, id) {
  write(presets.value.map(item => item.code === preset.code ? { ...item, shared: id } : item), () => changeSaved(preset.code, { shared: id }))
}

export function unmarkShared(id) {
  const marked = presets.value.filter(item => item.shared === id)
  if (!marked.length) return
  write(presets.value.map(item => {
    if (item.shared !== id) return item
    const { shared, ...rest } = item
    return rest
  }), () => Promise.all(marked.map(item => changeSaved(item.code, { shared: null }))))
}

export function removePreset(preset) {
  write(presets.value.filter(item => item.code !== preset.code), () => deleteSaved(preset.code))
}

function savedWithCode(code) {
  return presets.value.find(preset => preset.code === code)
}

function automaticName() {
  return capitalWords(titleText()).slice(0, NAME_LIMIT)
}

export function startSavingPreset() {
  try {
    const { code } = encodeTitle(titleData())
    const existing = savedWithCode(code)
    namingShared.value = !!existing?.shared
    namingPreset.value = existing?.name ?? automaticName()
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
  }
}

export function confirmSharing(name) {
  if (account.value) return confirm(`Share ${name} publicly as ${account.value.name}?\n\nAnyone will be able to see and use this title, and your username will show on it. You can rename or delete it later.`)
  return confirm(`Share ${name} anonymously?\n\nAnyone will be able to see and use this title. It won't be tied to an account, so you can't edit or remove it after sharing.`)
}

export async function sharePreset(preset, name) {
  try {
    const { preset: shared } = await sharePublicly(preset.code, name)
    markShared(preset, shared.id)
    return shared
  } catch (err) {
    if (err.status === 409) markShared(preset, err.id)
    if (err.status === 429) refreshUsage(true)
    throw err
  }
}

export function savePreset(name = "", { keepOpen = false } = {}) {
  if (!keepOpen) namingPreset.value = null
  try {
    const { code, skipped } = encodeTitle(titleData())
    submitStats()
    const existing = savedWithCode(code)
    const preset = existing ? renamePreset(existing, name) : addPreset(name.trim().slice(0, NAME_LIMIT) || automaticName(), code)
    savedPreset.value = { name: preset.name, skipped }
    if (!skipped) showNotice(`Saved as ${preset.name}`)
    return preset
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
    return null
  }
}

export function loadPreset(preset) {
  if (!isDefaultTitle() && !confirm(`Replace your current title with ${preset.name}?`)) return false
  try {
    openTitleData(decodeTitle(preset.code))
  } catch (err) {
    fileError.value = `Couldn't open ${preset.name}: ${err.message}`
  }
  return true
}
