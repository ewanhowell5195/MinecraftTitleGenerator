import { SUBMISSION_KINDS, checkSubmission, submissionContext } from "../../lib/submissions/kinds/index.js"
import { EXTRA_FILE, SUBMISSION_LIMITS, sizedProblem } from "../../lib/submissions/submissions.js"
import { Refusal, bodyBytes } from "../http.js"
import { asset, publishedFonts } from "./store.js"

const FORM_ALLOWANCE = 20000
const EXTRA_PREFIX = "extra:"

function sentCredit(text) {
  try {
    return JSON.parse(text ?? "")
  } catch {
    return null
  }
}

function parsedDetails(text) {
  try {
    const details = JSON.parse(text ?? "{}")
    if (details && typeof details === "object" && !Array.isArray(details)) return details
  } catch {}
  throw new Refusal(400, "This submission isn't valid.")
}

async function uploaded(value) {
  return typeof value?.arrayBuffer === "function" && value.size ? new Uint8Array(await value.arrayBuffer()) : null
}

async function extraFiles(form) {
  const files = Object.create(null)
  for (const [field, value] of form.entries()) {
    if (!field.startsWith(EXTRA_PREFIX)) continue
    const key = field.slice(EXTRA_PREFIX.length)
    const bytes = await uploaded(value)
    if (!EXTRA_FILE.test(key) || !bytes) throw new Refusal(400, "This submission isn't valid.")
    files[key] = bytes
  }
  if (Object.keys(files).length > SUBMISSION_LIMITS.extraFiles) throw new Refusal(400, `A submission can include up to ${SUBMISSION_LIMITS.extraFiles} extra files.`)
  return files
}

function keptSizes(details, files, previous) {
  if (!Array.isArray(details.extras)) return details
  const before = previous ? JSON.parse(previous.details).extras ?? [] : []
  return { ...details, extras: details.extras.map(item => item && typeof item === "object" && !files[item.key] ? { ...item, size: before.find(old => old.key === item.key)?.size } : item) }
}

export async function readForm(context, previous = null) {
  const { request } = context
  const body = await bodyBytes(request, SUBMISSION_LIMITS.totalBytes + FORM_ALLOWANCE, "This submission is too big.")
  const form = await new Response(body, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData().catch(() => null)
  if (!form) throw new Refusal(400, "This submission isn't valid.")
  const bytes = await uploaded(form.get("file"))
  const files = await extraFiles(form)
  if (Object.values(files).concat(bytes ?? []).reduce((total, item) => total + item.length, 0) > SUBMISSION_LIMITS.totalBytes) throw new Refusal(413, `A submission can be up to ${SUBMISSION_LIMITS.totalBytes / 1000000} MB in total.`)
  const kind = form.get("kind")
  const type = SUBMISSION_KINDS[kind]
  if (!type?.available) throw new Refusal(400, "Pick what you're submitting.")
  if (!bytes && !previous) throw new Refusal(400, sizedProblem(bytes, type.noun))
  const fonts = await publishedFonts(context)
  const fields = { kind, target: form.get("target") ?? "", details: keptSizes(parsedDetails(form.get("details")), files, previous), bytes, files, name: form.get("name"), credit: sentCredit(form.get("credit")), notes: form.get("notes") ?? "", agree: form.get("agree") === "true" }
  const { problems, clean } = await checkSubmission(fields, submissionContext(fonts, path => asset(context, path)))
  const problem = Object.values(problems)[0]
  if (problem) throw new Refusal(400, problem)
  const before = previous ? JSON.parse(previous.details) : {}
  if (!bytes) {
    if (clean.kind !== previous.kind || clean.target !== previous.target) throw new Refusal(400, `Choose the ${type.noun}'s file again for the new choice.`)
    for (const key of type.derived) clean.details[key] ??= before[key]
  }
  const wanted = type.fileKeys?.(clean.details) ?? []
  const missing = wanted.find(key => !files[key] && !Object.hasOwn(before.files ?? {}, key))
  if (missing) throw new Refusal(400, "One of the extra files is missing. Choose it again.")
  const stored = bytes && type.cleanFile ? type.cleanFile(bytes) : bytes
  return { clean, fonts, bytes: stored, files: Object.fromEntries(wanted.map(key => [key, files[key] ?? before.files[key]])), revision: Number(form.get("revision")) }
}
