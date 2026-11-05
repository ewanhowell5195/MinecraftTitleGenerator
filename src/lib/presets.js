import { ref } from "vue"
import { fileError, isDefaultTitle, openTitleData, titleData } from "./file.js"
import { decodeTitle, encodeTitle } from "./linkformat.js"
import { titleText } from "./scene.js"
import { submitStats } from "./stats.js"

const STORAGE = "minecraft-title-presets"
const FALLBACK_NAME = "Title"
const NOTICE_TIME = 3000
export const NAME_LIMIT = 60

export const presets = ref(read())
export const savedPreset = ref(null)

let noticing = null

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

export function removePreset(preset) {
  write(presets.value.filter(item => item.code !== preset.code))
}

export function savePreset() {
  try {
    const { code, skipped } = encodeTitle(titleData())
    submitStats()
    const preset = addPreset(titleText(), code)
    clearTimeout(noticing)
    savedPreset.value = { name: preset.name, skipped }
    if (!skipped) noticing = setTimeout(() => savedPreset.value = null, NOTICE_TIME)
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
