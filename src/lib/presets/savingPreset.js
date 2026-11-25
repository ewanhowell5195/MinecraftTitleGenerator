import { ref } from "vue"
import { capitalWords } from "../core/names.js"
import { encodeTitle } from "../link/linkformat.js"
import { askConfirm } from "../state/confirm.js"
import { fileError, showNotice } from "../state/notices.js"
import { NAME_LIMIT, addPreset, cleanName, renamePreset, replaceWith, savedWithCode } from "./savedPresets.js"

const UPLOADS = "uploaded fonts, shapes, textures or overlays"

export const namingPreset = ref(null)
export const namingShared = ref(false)
export const namingSharedId = ref(null)
export const namingForShare = ref(false)
export const namingCode = ref("")

let title = null

export function usePresetTitle(source) {
  title = { check: (share, proceed) => proceed(), ...source }
}

function automaticName() {
  const text = title.text()
  return (title.cased() ? text : capitalWords(text)).slice(0, NAME_LIMIT)
}

function presetCode() {
  const { code, skipped } = encodeTitle(title.data())
  if (skipped) throw new Error(`presets can't include ${UPLOADS}. Save the title as a ${title.fileType()} file instead to keep them`)
  return code
}

async function offerFile(share) {
  const type = title.fileType()
  const message = `${share ? "Shared titles" : "Presets"} can't include ${UPLOADS}.\n\nSave this title as a ${type} file instead to keep them.`
  if (await askConfirm({ title: share ? "Share publicly" : "Save preset", message, action: `Save ${type}` })) title.saveFile()
}

function startNaming(code, share) {
  const existing = savedWithCode(code)
  namingForShare.value = share
  namingShared.value = !!existing?.shared
  namingSharedId.value = existing?.shared ?? null
  namingCode.value = code
  namingPreset.value = existing?.name ?? automaticName()
}

export function startSavingPreset({ share = false } = {}) {
  try {
    const { code, skipped } = encodeTitle(title.data())
    if (skipped) offerFile(share)
    else title.check(share, () => startNaming(code, share))
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
