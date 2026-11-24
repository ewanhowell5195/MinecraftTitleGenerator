import { openTitleData, openTitleText, titleData } from "../state/titleFile.js"
import { fileError } from "../state/notices.js"
import { encodeTitle, openableTitle } from "./linkformat.js"
import { presetsPage } from "../state/presetsPage.js"
import { TITLE_PARAM, clearSharedLink, sharedLink } from "../state/scene.js"
import { submitStats } from "../state/stats.js"

export function shareLink() {
  const { code, skipped } = encodeTitle(titleData())
  submitStats()
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

export async function openSharedLink() {
  const code = new URLSearchParams(location.search).get(TITLE_PARAM)
  if (!code || presetsPage.open) return
  try {
    if (/^https:\/\//.test(code)) await openTitleUrl(code)
    else openTitleData(openableTitle(code))
    sharedLink.open = true
  } catch (err) {
    fileError.value = `Couldn't open this link: ${err.message}`
    clearSharedLink()
  }
}
