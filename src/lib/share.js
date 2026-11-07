import { fileError, openTitleData, titleData } from "./file.js"
import { decodeTitle, encodeTitle } from "./linkformat.js"
import { presetsPage } from "./presetsPage.js"
import { TITLE_PARAM, clearSharedLink, sharedLink } from "./scene.js"
import { submitStats } from "./stats.js"

export function shareLink() {
  const { code, skipped } = encodeTitle(titleData())
  submitStats()
  const url = new URL(location.href)
  url.hash = ""
  url.searchParams.set(TITLE_PARAM, code)
  return { link: url.href, skipped }
}

export function openSharedLink() {
  const code = new URLSearchParams(location.search).get(TITLE_PARAM)
  if (!code || presetsPage.open) return
  try {
    openTitleData(decodeTitle(code))
    sharedLink.open = true
  } catch (err) {
    fileError.value = `Couldn't open this link: ${err.message}`
    clearSharedLink()
  }
}
