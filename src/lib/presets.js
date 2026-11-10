import { ref, watch } from "vue"
import { account, changeSaved, deleteSaved, deleteShared, loadSaved, managedPresets, refreshUsage, renameShared, replaceShared, sharePublicly, unshareShared, uploadSaved } from "./community.js"
import { fileError, isDefaultTitle, openTitleData, titleData } from "./file.js"
import { LIMITS } from "./limits.js"
import { decodeTitle, encodeTitle, titleBody } from "./linkformat.js"
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
export const namingPreset = ref(null)
export const namingShared = ref(false)
export const namingSharedId = ref(null)
export const namingForShare = ref(false)
export const namingCode = ref("")

let opening = 0
let presetsOpened = null
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

function store(list) {
  localStorage.setItem(STORAGE, JSON.stringify(list))
}

function change(code, transform, send) {
  const previous = presets.value
  const list = transform(previous)
  if (!account.value) {
    store(list)
    presets.value = list
    return
  }
  presets.value = list
  if (previous.find(item => item.code === code)?.inBrowser) {
    store(transform(read()))
    return
  }
  queued(send).catch(err => {
    console.error(err)
    presets.value = previous
    showNotice(err.message)
  })
}

function setList(transform) {
  presets.value = transform(presets.value)
  store(transform(read()))
}

function keepInBrowser(code) {
  const preset = presets.value.find(item => item.code === code)
  if (!preset) return
  presets.value = presets.value.map(item => item.code === code ? { ...item, inBrowser: true } : item)
  store(read().filter(item => item.code !== code).concat(preset))
  showNotice(`${preset.name} didn't fit on your account, so it's saved in this browser instead.`)
}

async function moveLocalPresets() {
  const list = await loadSaved()
  const onAccount = new Set(list.map(preset => titleBody(preset.code)))
  const managed = new Set(managedPresets.value)
  const local = read().filter(preset => !onAccount.has(titleBody(preset.code)))
  const unclaimed = local.filter(preset => managed.has(preset.shared ?? preset.unshared))
  const taken = new Set(list.map(preset => preset.name))
  const moving = local.filter(preset => !unclaimed.includes(preset)).map(preset => {
    const { shared, unshared, ...rest } = preset
    const name = uniqueName(preset.name, taken)
    taken.add(name)
    return { ...rest, name }
  })
  const kept = new Set(moving.length ? await uploadSaved(moving) : [])
  const staying = moving.filter(preset => kept.has(preset.code)).concat(unclaimed)
  store(staying)
  const added = moving.filter(preset => !kept.has(preset.code))
  return { list: list.concat(added, staying.map(preset => ({ ...preset, inBrowser: true }))), added: added.length, kept: kept.size }
}

function movedMessage(added, kept) {
  const parts = []
  if (added) parts.push(`Added ${added} ${added === 1 ? "preset" : "presets"} from this browser to your account.`)
  if (kept) parts.push(`${kept} ${kept === 1 ? "preset" : "presets"} didn't fit on your account, so ${kept === 1 ? "it stays" : "they stay"} in this browser.`)
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
    const onAccount = new Set(list.map(preset => titleBody(preset.code)))
    presets.value = list.concat(presets.value.filter(preset => !onAccount.has(titleBody(preset.code))))
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

watch(() => account.value?.id ?? null, (id, previous) => {
  presetsOpened = openAccount(id, previous)
}, { immediate: true, flush: "sync" })

export function presetsLoaded() {
  return presetsOpened
}

function uniqueName(name, taken = new Set(presets.value.map(preset => preset.name))) {
  if (!taken.has(name)) return name
  let number = 2
  while (taken.has(`${name} ${number}`)) number++
  return `${name} ${number}`
}

function cleanName(name) {
  return name.trim().slice(0, NAME_LIMIT)
}

export function addPreset(name, code) {
  const existing = savedWithCode(code)
  if (existing) return existing
  const preset = { name: uniqueName(name || FALLBACK_NAME), code }
  change(code, list => list.concat(preset), async () => {
    const kept = await uploadSaved([preset])
    if (kept.length) keepInBrowser(code)
  })
  return preset
}

export function renamePreset(preset, name) {
  const trimmed = cleanName(name)
  if (!trimmed) return preset
  const named = name => list => list.map(item => item.code === preset.code ? { ...item, name } : item)
  if (managedPresets.value.includes(preset.shared)) {
    setList(named(trimmed))
    queued(() => renameShared(preset.shared, trimmed)).catch(err => {
      console.error(err)
      setList(named(preset.name))
      showNotice(err.message)
    })
  } else change(preset.code, named(trimmed), () => changeSaved(preset.code, { name: trimmed }))
  return { ...preset, name: trimmed }
}

export async function renameSharedPreset(id, name) {
  const newName = await renameShared(id, name)
  setList(list => list.map(item => item.shared === id ? { ...item, name: newName } : item))
  return newName
}

export function markShared(preset, id) {
  setList(list => list.map(item => item.code === preset.code ? { ...item, shared: id } : item))
}

export function unmarkShared(id) {
  setList(list => list.map(item => {
    if (item.shared !== id) return item
    const { shared, ...rest } = item
    return rest
  }))
}

export async function unsharePreset(id) {
  const { name, code } = await unshareShared(id)
  const moved = { name, code, ...(!account.value && { unshared: id }) }
  setList(list => list.some(item => item.shared === id) ? list.map(item => item.shared === id ? moved : item) : list.concat(moved))
  return moved
}

export async function deleteSharedPreset(id) {
  await deleteShared(id)
  setList(list => list.filter(item => item.shared !== id))
}

function changeCode(preset, code, name) {
  change(preset.code, list => list.map(item => {
    if (item.code !== preset.code) return item
    const { shared, ...rest } = item
    return { ...rest, code, name }
  }), () => changeSaved(preset.code, { replacement: code, name }))
  return { ...preset, code, name }
}

export function replaceTargets(code) {
  const managed = new Set(managedPresets.value)
  const existing = savedWithCode(code)
  const targets = presets.value.filter(preset => titleBody(preset.code) !== titleBody(code) && (!existing || managed.has(preset.shared))).map(preset => ({ name: preset.name, code: preset.code, shared: preset.shared, online: managed.has(preset.shared) }))
  return targets.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
}

export async function replaceWith(target, code, name) {
  if (!target.online) return { preset: changeCode(savedWithCode(target.code), code, cleanName(name) || target.name), online: null }
  const online = await replaceShared(target.shared, code, name)
  setList(list => list.filter(item => titleBody(item.code) !== titleBody(code)).map(item => item.shared === online.id ? { ...item, code, name: online.name } : item))
  return { preset: savedWithCode(code), online }
}

export async function saveOver(target, name) {
  const code = presetCode()
  submitStats()
  const replaced = await replaceWith(target, code, name)
  showNotice(`Saved as ${replaced.preset.name}`)
  return replaced
}

export function removePreset(preset) {
  change(preset.code, list => list.filter(item => item.code !== preset.code), async () => {
    await deleteSaved(preset.code)
    queued(moveUpFromBrowser).catch(console.error)
  })
  if (preset.unshared) deleteShared(preset.unshared).catch(console.error)
}

async function moveUpFromBrowser() {
  const waiting = presets.value.find(item => item.inBrowser && !item.shared && !item.unshared)
  if (!waiting) return
  const { inBrowser, ...preset } = waiting
  const kept = await uploadSaved([preset])
  if (kept.length) return
  presets.value = presets.value.map(item => item.code === preset.code ? preset : item)
  store(read().filter(item => item.code !== preset.code))
  showNotice(`${preset.name} is now saved on your account.`)
}

function savedWithCode(code) {
  return presets.value.find(preset => titleBody(preset.code) === titleBody(code))
}

function showingCode(code) {
  const current = encodeTitle(titleData())
  return !current.skipped && titleBody(current.code) === titleBody(code)
}

function automaticName() {
  return capitalWords(titleText()).slice(0, NAME_LIMIT)
}

function presetCode() {
  const { code, skipped } = encodeTitle(titleData())
  if (skipped) throw new Error("presets can't include uploaded fonts, textures or overlays. Save the title as a file to keep them")
  return code
}

export function startSavingPreset({ share = false } = {}) {
  try {
    const code = presetCode()
    const existing = savedWithCode(code)
    namingForShare.value = share
    namingShared.value = !!existing?.shared
    namingSharedId.value = existing?.shared ?? null
    namingCode.value = code
    namingPreset.value = existing?.name ?? automaticName()
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
  }
}

export function confirmSharing(name) {
  if (account.value) return confirm(`Share ${name} publicly as ${account.value.name}?\n\nAnyone will be able to see and use this title, and your username will show on it. You can rename or delete it later.`)
  return confirm(`Share ${name} without an account?\n\nAnyone will be able to see and use this title. You can only rename or delete it from this browser. If this browser's saved data is cleared, including automatically, or you use another device or a private window, you lose that access for good.\n\nIf you sign in on this browser later, this title moves to your account and shows your username.`)
}

export function confirmReplacing(target) {
  if (target.online) return confirm(`Replace ${target.name} in Community with this title?\n\nIts votes, rating and uses are reset, and that cannot be undone. Its link stays the same.`)
  return confirm(`Replace ${target.name} with this title?`)
}

export async function sharePreset(preset, name) {
  await queue
  try {
    const { preset: shared } = await sharePublicly(preset.code, name, preset.unshared)
    setList(list => list.map(item => {
      if (item.code !== preset.code) return item
      const { unshared, inBrowser, ...rest } = item
      return { ...rest, name: shared.name, shared: shared.id }
    }))
    if (account.value) {
      store(read().filter(item => item.code !== preset.code))
      queued(moveUpFromBrowser).catch(console.error)
    }
    return shared
  } catch (err) {
    if (err.status === 409 && managedPresets.value.includes(err.id)) markShared(preset, err.id)
    if (err.status === 429) refreshUsage(true)
    throw err
  }
}

export function savePreset(name = "", { keepOpen = false } = {}) {
  if (!keepOpen) namingPreset.value = null
  try {
    const code = presetCode()
    submitStats()
    const existing = savedWithCode(code)
    const preset = existing ? renamePreset(existing, name) : addPreset(cleanName(name) || automaticName(), code)
    showNotice(`Saved as ${preset.name}`)
    return preset
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
    return null
  }
}

export function loadPreset(preset) {
  if (!isDefaultTitle() && !showingCode(preset.code) && !confirm(`Replace your current title with ${preset.name}?`)) return false
  try {
    openTitleData(decodeTitle(preset.code))
  } catch (err) {
    fileError.value = `Couldn't open ${preset.name}: ${err.message}`
  }
  return true
}
