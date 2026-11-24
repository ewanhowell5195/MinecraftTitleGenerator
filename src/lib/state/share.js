import { openTitleData, openTitleText, titleData } from "./titleFile.js"
import { fileError } from "./notices.js"
import { encodeTitle, openableTitle } from "../link/linkformat.js"
import { communityPreset, countDownload } from "./community.js"
import { editorPresetPath, presetsPage } from "./presetsPage.js"
import { PRESET_PARAM, TITLE_PARAM, clearSharedLink, scene, sharedLink } from "./scene.js"
import { submitStats } from "./stats.js"

export function shareLink() {
  submitStats()
  if (sharedLink.preset !== null) return { link: new URL(editorPresetPath(sharedLink.preset), location.origin).href, skipped: 0 }
  const { code, skipped } = encodeTitle(titleData())
  const url = new URL(location.href)
  url.hash = ""
  url.searchParams.set(TITLE_PARAM, code)
  return { link: url.href, skipped }
}

async function openTitleUrl(address) {
  const response = await fetch(address).catch(() => null)
  if (!response?.ok) throw new Error(`its title file couldn't be downloaded${response ? ` (${response.status})` : ""}`)
  openTitleText(await response.text())
}

async function openPresetLink(id) {
  const preset = await communityPreset(id)
  openTitleData(openableTitle(preset.code))
  scene.preset = { id, name: preset.name }
  sharedLink.preset = id
  countDownload(preset).catch(console.error)
}

function linkedPreset(params) {
  const id = Number(params.get(PRESET_PARAM))
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function openSharedLink() {
  const params = new URLSearchParams(location.search)
  const code = params.get(TITLE_PARAM)
  if (!code && !params.has(PRESET_PARAM) || presetsPage.open) return
  try {
    const id = code ? null : linkedPreset(params)
    if (!code && id === null) throw new Error("it doesn't have a preset's number")
    if (id !== null) await openPresetLink(id)
    else if (/^https:\/\//.test(code)) await openTitleUrl(code)
    else openTitleData(openableTitle(code))
    sharedLink.open = true
  } catch (err) {
    fileError.value = `Couldn't open this link: ${err.message}`
    clearSharedLink()
  }
}
