import { CLIENT_KINDS } from "../submissions/kinds/index.js"
import { fontDefaults } from "../submissions/kinds/preview.js"
import { fetched } from "./api.js"
import { customFontEntry } from "./customFonts.js"
import { isPreviewHost } from "./previewSite.js"
import { fileError, openTitleData, untouchedTitle } from "./file.js"
import { FILE_VERSION } from "./settings.js"
import { submission, submissionExtraUrl, submissionFileUrl } from "./submissionsApi.js"

export const SUBMISSION_PARAM = "submission"

const embeddedFiles = new Map()

function dataUrl(blob) {
  return new Promise((fulfil, reject) => {
    const reader = new FileReader()
    reader.onload = () => fulfil(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function embedded(url) {
  if (url.startsWith("data:")) return Promise.resolve(url)
  if (!embeddedFiles.has(url)) {
    embeddedFiles.set(url, fetched(url, "the file").then(response => response.blob()).then(dataUrl).catch(err => {
      embeddedFiles.delete(url)
      throw err
    }))
  }
  return embeddedFiles.get(url)
}

export function forgetEmbedded(url) {
  embeddedFiles.delete(url)
}

export async function openSubmissionLink() {
  const url = new URL(location.href)
  const id = url.searchParams.get(SUBMISSION_PARAM)
  if (!id) return
  url.searchParams.delete(SUBMISSION_PARAM)
  history.replaceState(history.state, "", url)
  try {
    const item = await submission(id)
    const type = CLIENT_KINDS[item.kind]
    const own = await type.line(item, await embedded(submissionFileUrl(item)), item.name)
    const line = own.customFont ? { ...own, ...fontDefaults(await customFontEntry(own.customFont)) } : own
    const extra = type.extra?.(item)
    if (!isPreviewHost(location.hostname) && !await untouchedTitle() && !confirm(`Replace your current title with ${item.name}?`)) return
    openTitleData({ version: FILE_VERSION, lines: [extra ? type.dressed(line, extra, await embedded(submissionExtraUrl(item, extra.key))) : line] })
  } catch (err) {
    fileError.value = `Couldn't open this submission: ${err.message}`
  }
}
