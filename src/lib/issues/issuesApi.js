import { apiCall, jsonOptions } from "../submissions/api.js"
import { refreshAccount } from "../state/account.js"

const API = "/api/issues"

export const REPORT_PARAM = "report"

export function askedToReport() {
  const url = new URL(location.href)
  if (!url.searchParams.has(REPORT_PARAM)) return false
  url.searchParams.delete(REPORT_PARAM)
  history.replaceState(history.state, "", url)
  return true
}

function called(url, options) {
  return apiCall(url, options, "Reports aren't available right now", () => refreshAccount(true))
}

export function issuePage(id) {
  return `/issues/${id}/`
}

export function sendIssue({ title, body, code, images, titleFile }) {
  const data = new FormData()
  data.set("title", title)
  data.set("body", body)
  if (code) data.set("code", code)
  for (const image of images) data.append("image", image, image.name || "image")
  if (titleFile) data.set("titleFile", titleFile, "title.mctitle")
  return called(API, { method: "POST", body: data })
}

export async function myIssues() {
  return (await called(API)).issues
}

export async function openIssues() {
  return (await called(`${API}?review`)).issues
}

export function issueThread(id) {
  return called(`${API}/${id}`)
}

export async function postIssueComment(id, body) {
  return (await called(`${API}/${id}/comments`, jsonOptions("POST", { body }))).comments
}

export async function closeIssue(id) {
  return (await called(`${API}/${id}/close`, { method: "POST" })).issue
}

export async function markIssueSeen(id) {
  await called(`/api/notifications?issue=${id}`, { method: "POST" })
  refreshAccount(true)
}
