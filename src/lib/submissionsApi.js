import { refreshAccount } from "./community.js"

const API = "/api/submissions"
const NOTIFICATIONS_API = "/api/notifications"

async function called(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => null)
  if (response.ok && body) return body
  if (response.status === 401) refreshAccount(true)
  const error = new Error(body?.error ?? `Submissions aren't available right now (${response.status}).`)
  error.status = response.status
  throw error
}

function form(fields, file, agree, extras = {}) {
  const data = new FormData()
  for (const key of ["kind", "target", "name", "credit", "notes"]) data.set(key, fields[key])
  data.set("details", JSON.stringify(fields.details))
  data.set("agree", String(agree))
  if (file) data.set("file", file, file.name || "submission")
  for (const [key, extra] of Object.entries(extras)) data.set(`extra:${key}`, extra, extra.name || key)
  return data
}

export function submissionPage(id) {
  return `/submissions/${id}`
}

export function submissionExtraUrl(submission, key) {
  const sha = submission.details.files?.[key]
  return sha ? `${API}/${submission.id}/files/${key}?v=${sha}` : null
}

export function submissionFileUrl(submission) {
  return `${API}/${submission.id}/file?v=${submission.file}`
}

export async function mySubmissions() {
  return (await called(API)).submissions
}

export async function submission(id) {
  return (await called(`${API}/${id}`)).submission
}

export function sendSubmission(fields, file, agree, extras) {
  return called(API, { method: "POST", body: form(fields, file, agree, extras) })
}

export async function editSubmission(id, fields, file, extras) {
  return (await called(`${API}/${id}`, { method: "PATCH", body: form(fields, file, true, extras) })).submission
}

export function withdrawSubmission(id) {
  return called(`${API}/${id}`, { method: "DELETE" })
}

export async function notifications() {
  return (await called(NOTIFICATIONS_API)).notifications
}

export async function markNotificationsSeen() {
  await called(NOTIFICATIONS_API, { method: "POST" })
  refreshAccount(true)
}
