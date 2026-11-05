import { ref } from "vue"
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

export const presets = ref(read())
export const savedPreset = ref(null)
export const namingPreset = ref(null)

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE))
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function write(list) {
  localStorage.setItem(STORAGE, JSON.stringify(list))
  presets.value = list
}

function uniqueName(name) {
  const taken = new Set(presets.value.map(preset => preset.name))
  if (!taken.has(name)) return name
  let number = 2
  while (taken.has(`${name} ${number}`)) number++
  return `${name} ${number}`
}

export function addPreset(name, code) {
  const existing = presets.value.find(preset => preset.code === code)
  if (existing) return existing
  const preset = { name: uniqueName(name || FALLBACK_NAME), code }
  write(presets.value.concat(preset))
  return preset
}

export function renamePreset(preset, name) {
  const trimmed = name.trim().slice(0, NAME_LIMIT)
  if (!trimmed) return preset
  const renamed = { ...preset, name: trimmed }
  write(presets.value.map(item => item.code === preset.code ? renamed : item))
  return renamed
}

export function markShared(preset, id) {
  write(presets.value.map(item => item.code === preset.code ? { ...item, shared: id } : item))
}

export function removePreset(preset) {
  write(presets.value.filter(item => item.code !== preset.code))
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
    namingPreset.value = savedWithCode(code)?.name ?? automaticName()
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
  }
}

export function savePreset(name = "") {
  namingPreset.value = null
  try {
    const { code, skipped } = encodeTitle(titleData())
    submitStats()
    const existing = savedWithCode(code)
    const preset = existing ? renamePreset(existing, name) : addPreset(name.trim().slice(0, NAME_LIMIT) || automaticName(), code)
    savedPreset.value = { name: preset.name, skipped }
    if (!skipped) showNotice(`Saved as ${preset.name}`)
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
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
