import { LIMITS } from "../core/limits.js"
import { textProblem } from "../submissions/submissions.js"

export const ISSUE_LIMITS = { title: 100, body: 4000, perDay: 5, listed: 100, images: 4, imageBytes: 4000000, titleBytes: 10000000 }

export const IMAGE_TYPES = "image/png,image/jpeg"

const SIGNATURES = { png: [137, 80, 78, 71, 13, 10, 26, 10], jpg: [255, 216, 255] }

export function imageType(bytes) {
  return Object.keys(SIGNATURES).find(type => SIGNATURES[type].every((value, index) => bytes[index] === value)) ?? null
}

export const ISSUE_STATUSES = { open: "Open", fixed: "Fixed", closed: "Closed" }

const TITLE_CODE = /^[A-Za-z0-9_-]+$/

export function issueProblems(fields) {
  const problems = {
    title: textProblem(fields.title, "title", ISSUE_LIMITS.title, { required: true, noun: "report" }),
    body: textProblem(fields.body, "description", ISSUE_LIMITS.body, { required: true, noun: "report", lines: true }),
    code: fields.code == null || typeof fields.code === "string" && fields.code.length <= LIMITS.savedCode && TITLE_CODE.test(fields.code) ? null : "The title link isn't valid."
  }
  return Object.fromEntries(Object.entries(problems).filter(([, problem]) => problem))
}

export function cleanIssue(fields) {
  return { title: fields.title.trim(), body: fields.body.replace(/\r\n?/g, "\n").trim(), code: fields.code || null }
}
