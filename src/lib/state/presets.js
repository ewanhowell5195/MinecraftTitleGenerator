import { encodeTitle, openableTitle, titleBody } from "../link/linkformat.js"
import { usePresetTitle } from "../presets/savingPreset.js"
import { EXTENSION } from "../title/titleData.js"
import { askConfirm } from "./confirm.js"
import { fileError } from "./notices.js"
import { casedTitle, sharedLink, titleText } from "./scene.js"
import { submitStats } from "./stats.js"
import { isDefaultTitle, openTitleData, saveTitle, titleData } from "./titleFile.js"

usePresetTitle({ data: titleData, text: titleText, cased: casedTitle, submitStats, fileType: () => `.${EXTENSION}`, saveFile: saveTitle })

function showingCode(code) {
  const current = encodeTitle(titleData())
  return !current.skipped && titleBody(current.code) === titleBody(code)
}

export async function loadPreset(preset, shared = preset.shared ?? null) {
  if (!isDefaultTitle() && !showingCode(preset.code) && !await askConfirm({ title: "Open preset", message: `Replace your current title with ${preset.name}?`, action: "Replace" })) return false
  try {
    openTitleData(openableTitle(preset.code))
    sharedLink.preset = shared
  } catch (err) {
    fileError.value = `Couldn't open ${preset.name}: ${err.message}`
  }
  return true
}
