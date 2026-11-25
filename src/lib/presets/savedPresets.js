import { ref, watch } from "vue"
import { LIMITS } from "../core/limits.js"
import { byName } from "../core/names.js"
import { inThisPlace, thisPlace } from "../core/place.js"
import { shortNameProblem } from "../core/wording.js"
import { titleBody } from "../link/linkformat.js"
import { account } from "../state/account.js"
import { deleteShared, managedPresets, refreshUsage, renameShared, replaceShared, sharePublicly, unshareShared } from "../state/community.js"
import { askConfirm } from "../state/confirm.js"
import { showNotice } from "../state/notices.js"
import { changeSaved, deleteSaved, loadSaved, uploadSaved } from "../state/savedApi.js"
import { readStored } from "../state/stored.js"

const STORAGE = "minecraft-title-presets"
export const NAME_LIMIT = LIMITS.name

export const presets = ref([])
export const presetsLoading = ref(false)
export const presetsError = ref("")

let opening = 0
let presetsOpened = null
let queue = Promise.resolve()

function read() {
  const saved = readStored(STORAGE)
  return Array.isArray(saved) ? saved : []
}

function queued(send) {
  const run = queue.then(send, send)
  queue = run.catch(() => {})
  return run
}

function store(list) {
  localStorage.setItem(STORAGE, JSON.stringify(list))
}

function change(code, transform, send, undo) {
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
    presets.value = undo(presets.value)
    showNotice(err.message)
  })
}

function setList(transform, stored = transform) {
  presets.value = transform(presets.value)
  store(stored(read()))
}

function keepInBrowser(code) {
  const preset = presets.value.find(item => item.code === code)
  if (!preset) return
  presets.value = presets.value.map(item => item.code === code ? { ...item, inBrowser: true } : item)
  store(read().filter(item => item.code !== code).concat(preset))
  showNotice(`${preset.name} didn't fit on your account, so it's saved in ${thisPlace()} instead.`)
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
  if (added) parts.push(`Added ${added} ${added === 1 ? "preset" : "presets"} from ${thisPlace()} to your account.`)
  if (kept) parts.push(`${kept} ${kept === 1 ? "preset" : "presets"} didn't fit on your account, so ${kept === 1 ? "it stays" : "they stay"} in ${thisPlace()}.`)
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

export function cleanName(name) {
  return name.trim().slice(0, NAME_LIMIT)
}

export function addPreset(name, code) {
  const existing = savedWithCode(code)
  if (existing) return existing
  const preset = { name: uniqueName(name || "Title"), code }
  change(code, list => list.concat(preset), async () => {
    const kept = await uploadSaved([preset])
    if (kept.length) keepInBrowser(code)
  }, list => list.filter(item => item.code !== code))
  return preset
}

export function renamePreset(preset, name) {
  const trimmed = cleanName(name)
  if (!trimmed) return preset
  const named = name => list => list.map(item => item.code === preset.code ? { ...item, name } : item)
  if (managedPresets.value.includes(preset.shared)) {
    const short = shortNameProblem(trimmed)
    if (short) {
      showNotice(short)
      return preset
    }
    setList(named(trimmed))
    queued(() => renameShared(preset.shared, trimmed)).catch(err => {
      console.error(err)
      setList(named(preset.name))
      showNotice(err.message)
    })
  } else change(preset.code, named(trimmed), () => changeSaved(preset.code, { name: trimmed }), list => list.map(item => item.code === preset.code && item.name === trimmed ? { ...item, name: preset.name } : item))
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
  const swapped = list => list.map(item => item.shared === id ? moved : item)
  const kept = list => list.some(item => item.shared === id) ? swapped(list) : list.concat(moved)
  setList(kept, account.value ? swapped : kept)
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
  }), () => changeSaved(preset.code, { replacement: code, name }), list => list.map(item => item.code === code ? preset : item))
  return { ...preset, code, name }
}

export function replaceTargets(code) {
  const managed = new Set(managedPresets.value)
  const existing = savedWithCode(code)
  const targets = presets.value.filter(preset => titleBody(preset.code) !== titleBody(code) && (!existing || managed.has(preset.shared))).map(preset => ({ name: preset.name, code: preset.code, shared: preset.shared, online: managed.has(preset.shared) }))
  return targets.sort(byName)
}

export async function replaceWith(target, code, name) {
  if (!target.online) return { preset: changeCode(savedWithCode(target.code), code, cleanName(name) || target.name), online: null }
  const online = await replaceShared(target.shared, code, name)
  setList(list => list.filter(item => titleBody(item.code) !== titleBody(code)).map(item => item.shared === online.id ? { ...item, code, name: online.name } : item))
  return { preset: savedWithCode(code), online }
}

export function removePreset(preset) {
  const index = presets.value.findIndex(item => item.code === preset.code)
  const removed = presets.value.filter(item => item.code === preset.code)
  change(preset.code, list => list.filter(item => item.code !== preset.code), async () => {
    await deleteSaved(preset.code)
    queued(moveUpFromBrowser).catch(console.error)
  }, list => list.slice(0, index).concat(removed, list.slice(index)))
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

export function savedWithCode(code) {
  return presets.value.find(preset => titleBody(preset.code) === titleBody(code))
}

export function confirmSharing(name) {
  if (account.value) return askConfirm({ title: "Share publicly", message: `Share ${name} publicly as ${account.value.name}?\n\nAnyone will be able to see and use this title, and your username will show on it. You can rename or delete it later.`, action: "Share" })
  return askConfirm({ title: "Share without an account", message: `Share ${name} without an account?\n\nAnyone will be able to see and use this title. You can only rename or delete it from ${thisPlace()}. If ${thisPlace()}'s saved data is cleared, including automatically, or you use another device or a private window, you lose that access for good.\n\nIf you sign in ${inThisPlace()} later, this title moves to your account and shows your username.`, action: "Share" })
}

export function confirmReplacing(target) {
  if (target.online) return askConfirm({ title: "Replace shared title", message: `Replace ${target.name} in Community with this title?\n\nIts votes, rating and uses are reset, and that cannot be undone. Its link stays the same.`, action: "Replace", danger: true })
  return askConfirm({ title: "Replace preset", message: `Replace ${target.name} with this title?`, action: "Replace" })
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
