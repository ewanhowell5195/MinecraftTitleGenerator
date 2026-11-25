import { ref } from "vue"
import { capitalWords } from "../core/names.js"
import { encodeTitle } from "../link/linkformat.js"
import { fileError, showNotice } from "../state/notices.js"
import { NAME_LIMIT, addPreset, cleanName, renamePreset, replaceWith, savedWithCode } from "./savedPresets.js"

export const namingPreset = ref(null)
export const namingShared = ref(false)
export const namingSharedId = ref(null)
export const namingForShare = ref(false)
export const namingCode = ref("")

let title = null

export function usePresetTitle(source) {
  title = source
}

function automaticName() {
  const text = title.text()
  return (title.cased() ? text : capitalWords(text)).slice(0, NAME_LIMIT)
}

function presetCode() {
  const { code, skipped } = encodeTitle(title.data())
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

export async function saveOver(target, name) {
  const code = presetCode()
  title.submitStats()
  const replaced = await replaceWith(target, code, name)
  showNotice(`Saved as ${replaced.preset.name}`)
  return replaced
}

export function savePreset(name = "", { keepOpen = false } = {}) {
  if (!keepOpen) namingPreset.value = null
  try {
    const code = presetCode()
    title.submitStats()
    const existing = savedWithCode(code)
    const preset = existing ? renamePreset(existing, name) : addPreset(cleanName(name) || automaticName(), code)
    showNotice(`Saved as ${preset.name}`)
    return preset
  } catch (err) {
    fileError.value = `Couldn't save this preset: ${err.message}`
    return null
  }
}
