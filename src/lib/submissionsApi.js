import { apiCall, jsonOptions } from "./api.js"
import { refreshAccount } from "./community.js"

const API = "/api/submissions"
const NOTIFICATIONS_API = "/api/notifications"

function called(url, options) {
  return apiCall(url, options, "Submissions aren't available right now", () => refreshAccount(true))
}

function form(fields, file, agree, extras = {}) {
  const data = new FormData()
  for (const key of ["kind", "target", "name", "notes"]) data.set(key, fields[key])
  data.set("credit", JSON.stringify(fields.credit))
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

export function submissionProcessing(id) {
  return called(`${API}/${id}/processing`)
}

export function submissionThread(id) {
  return called(`${API}/${id}`)
}

export async function submission(id) {
  return (await submissionThread(id)).submission
}

export async function postComment(id, body) {
  return (await called(`${API}/${id}/comments`, jsonOptions("POST", { body }))).comments
}

export async function reviewState(id) {
  return (await called(`${API}/${id}/review`)).state
}

export function reviewSubmission(id, action, comment = "") {
  return called(`${API}/${id}/review`, jsonOptions("POST", { action, comment }))
}

export async function reviewQueue() {
  return (await called(`${API}?review`)).submissions
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

export async function markNotificationsSeen(submission = null) {
  await called(submission === null ? NOTIFICATIONS_API : `${NOTIFICATIONS_API}?submission=${submission}`, { method: "POST" })
  refreshAccount(true)
}

export async function clearNotifications() {
  await called(NOTIFICATIONS_API, { method: "DELETE" })
  await refreshAccount(true)
}
