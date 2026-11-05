import { fileError, openTitleData, titleData } from "./file.js"
import { decodeTitle, encodeTitle } from "./linkformat.js"
import { sharedLink } from "./scene.js"
import { submitStats } from "./stats.js"

const PREFIX = "#title="

export function shareLink() {
  const { code, skipped } = encodeTitle(titleData())
  submitStats()
  return { link: `${location.origin}${location.pathname}${location.search}${PREFIX}${code}`, skipped }
}

export function openSharedLink() {
  sharedLink.open = false
  if (!location.hash.startsWith(PREFIX)) return
  try {
    openTitleData(decodeTitle(location.hash.slice(PREFIX.length)))
    sharedLink.open = true
  } catch (err) {
    fileError.value = `Couldn't open this link: ${err.message}`
    history.replaceState(null, "", location.pathname + location.search)
  }
}
