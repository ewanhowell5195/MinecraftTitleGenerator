import { CLIENT_KINDS } from "../submissions/kinds/index.js"
import { fileError, openTitleData } from "./file.js"
import { FILE_VERSION } from "./settings.js"
import { submission, submissionFileUrl } from "./submissionsApi.js"

export const SUBMISSION_PARAM = "submission"

const embeddedFiles = new Map()

export function dataUrl(blob) {
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
    embeddedFiles.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error(`the file could not be loaded (${response.status})`)
      return response.blob()
    }).then(dataUrl).catch(err => {
      embeddedFiles.delete(url)
      throw err
    }))
  }
  return embeddedFiles.get(url)
}

export async function openSubmissionLink() {
  const url = new URL(location.href)
  const id = url.searchParams.get(SUBMISSION_PARAM)
  if (!id) return
  url.searchParams.delete(SUBMISSION_PARAM)
  history.replaceState(history.state, "", url)
  try {
    const item = await submission(id)
    const line = await CLIENT_KINDS[item.kind].line(item, await embedded(submissionFileUrl(item)), item.name)
    openTitleData({ version: FILE_VERSION, lines: [line] })
  } catch (err) {
    fileError.value = `Couldn't open this submission: ${err.message}`
  }
}
