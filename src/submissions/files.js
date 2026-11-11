import { forgetEmbedded } from "../lib/submissionLink.js"

export async function pickedFile(file) {
  return { blob: file, bytes: new Uint8Array(await file.arrayBuffer()), url: URL.createObjectURL(file), name: file.name }
}

export function releaseFile(record) {
  URL.revokeObjectURL(record.url)
  forgetEmbedded(record.url)
}
