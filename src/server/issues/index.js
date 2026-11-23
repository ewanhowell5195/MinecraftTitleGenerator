import { providerLabel } from "../../lib/core/providers.js"
import { ISSUE_LIMITS, cleanIssue, imageType, issueProblems } from "../../lib/issues/issues.js"
import { SUBMISSION_LIMITS } from "../../lib/submissions/submissions.js"
import { USER_ROW, accountKey, currentUser, forgetEmail, isAdmin, rememberUser, requireUser, saveUser } from "../accounts.js"
import { returnSlot, takeSlot } from "../daily.js"
import { github, repository } from "../github.js"
import { Refusal, bodyBytes, cachedAtEdge, guarded, idParam, jsonBody, randomToken, reply } from "../http.js"
import { FRESH_SECONDS, REVIEWERS, commentText, postComment, threadOf, threadReply } from "../submissions/comments.js"
import { emailing, notify } from "../submissions/notifications.js"
import { block, inline, onGitHub } from "../submissions/pulls.js"
import { storeFiles } from "./files.js"

const MISSING = "This report doesn't exist."
const SIGN_IN = "Sign in to report an issue."
const UNAVAILABLE = "GitHub isn't taking reports right now. Try again in a few minutes."
const SHOWN = "id, title, body, code, files, status, number, created_at AS createdAt, updated_at AS updatedAt"
const INVALID = "This report isn't valid."
const FORM_ALLOWANCE = 40000
const MEGABYTE = 1000000
const OWNER = "(SELECT users.provider || ':' || users.provider_id FROM users WHERE users.id = issues.user_id) AS owner, (SELECT users.name FROM users WHERE users.id = issues.user_id) AS ownerName, (SELECT users.provider FROM users WHERE users.id = issues.user_id) AS ownerProvider"

function titleLink(code, files) {
  const titleFile = files.find(file => file.kind === "title")
  return `/app/?title=${titleFile ? encodeURIComponent(titleFile.url) : code}`
}

function issueText(origin, user, clean, files) {
  const titleFile = files.find(file => file.kind === "title")
  const images = files.filter(file => file.kind === "image")
  return [
    `Reported from the website by ${inline(user.name)} (${user.provider}).`,
    clean.code ? `**[Open the title in the generator](${origin}${titleLink(clean.code, files)})**` : null,
    titleFile ? `It has uploaded fonts or textures, so the link opens its attached **[title file](${titleFile.page})**.` : null,
    block(clean.body),
    images.length ? images.map((image, index) => `![Image ${index + 1}](${image.url})`).join("\n") : null
  ].filter(Boolean).join("\n\n")
}

async function uploaded(value) {
  return typeof value?.arrayBuffer === "function" && value.size ? new Uint8Array(await value.arrayBuffer()) : null
}

function titleFileProblem(bytes) {
  try {
    if (JSON.parse(new TextDecoder().decode(bytes))?.format === "minecraft-title") return null
  } catch {}
  return INVALID
}

async function readReport(request) {
  const limit = ISSUE_LIMITS.images * ISSUE_LIMITS.imageBytes + ISSUE_LIMITS.titleBytes + FORM_ALLOWANCE
  const form = await new Response(await bodyBytes(request, limit, "This report is too big."), { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData().catch(() => null)
  if (!form) throw new Refusal(400, INVALID)
  const fields = { title: form.get("title"), body: form.get("body"), code: form.get("code") || null }
  const problem = Object.values(issueProblems(fields))[0]
  if (problem) throw new Refusal(400, problem)
  const images = form.getAll("image")
  if (images.length > ISSUE_LIMITS.images) throw new Refusal(400, `A report can have up to ${ISSUE_LIMITS.images} images.`)
  const files = []
  for (const [index, image] of images.entries()) {
    const bytes = await uploaded(image)
    const type = bytes && imageType(bytes)
    if (!type) throw new Refusal(400, "Images have to be PNG or JPEG files.")
    if (bytes.length > ISSUE_LIMITS.imageBytes) throw new Refusal(413, `Images can be up to ${ISSUE_LIMITS.imageBytes / MEGABYTE} MB each.`)
    files.push({ kind: "image", name: `image-${index + 1}.${type}`, bytes })
  }
  const titleFile = await uploaded(form.get("titleFile"))
  if (titleFile) {
    if (!fields.code) throw new Refusal(400, INVALID)
    if (titleFile.length > ISSUE_LIMITS.titleBytes) throw new Refusal(413, `The title file can be up to ${ISSUE_LIMITS.titleBytes / MEGABYTE} MB.`)
    const fileProblem = titleFileProblem(titleFile)
    if (fileProblem) throw new Refusal(400, fileProblem)
    files.push({ kind: "title", name: "title.mctitle", bytes: titleFile })
  }
  return { clean: cleanIssue(fields), files }
}

function issueLink(env, row) {
  return `https://github.com/${repository(env)}/issues/${row.number}`
}

function shown(env, row, user) {
  const { owner, code, number, files, ...rest } = row
  const attached = JSON.parse(files)
  return { ...rest, files: attached, issueUrl: number ? issueLink(env, row) : null, titleLink: code ? titleLink(code, attached) : null, mine: !!user && user.id === owner }
}

async function findIssue(env, id) {
  const row = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM issues WHERE id = ?`).bind(id).first()
  if (!row) throw new Refusal(404, MISSING)
  return row
}

function requestedIssue({ env, params }) {
  return findIssue(env, idParam(params, MISSING))
}

function threadKey(request, row) {
  return `${new URL(`/api/issues/${row.id}/thread`, request.url).href}?number=${row.number}`
}

async function cachedThread(context, row) {
  const response = await cachedAtEdge(context, () => threadReply(context.env, row.number, false), { seconds: FRESH_SECONDS, key: threadKey(context.request, row) })
  return response.json()
}

function forgetThread(request, row) {
  return globalThis.caches?.default.delete(new Request(threadKey(request, row)))
}

function gitHubActor(person) {
  return person?.id ? { provider: "github", providerId: String(person.id) } : null
}

export const createIssue = guarded(async context => {
  const { env, request } = context
  const user = await requireUser(context, SIGN_IN)
  if (user.email === undefined) throw new Refusal(403, "Sign in again so you can be emailed about your report.")
  if (!user.email) throw new Refusal(403, `Add an email address to your ${providerLabel(user.provider)} account, then sign in again. You'll be emailed about your report there.`)
  const { clean, files } = await readReport(request)
  const slot = await takeSlot(env, { table: "account_submissions", column: "account_hash", owner: await accountKey(env, "issues", user) }, ISSUE_LIMITS.perDay)
  if (!slot) throw new Refusal(429, `You can send up to ${ISSUE_LIMITS.perDay} reports a day.`)
  const { created, stored } = await onGitHub(async () => {
    const stored = await storeFiles(env, `reports/${randomToken().slice(0, 16)}`, files)
    return { stored, created: await github(env, "issues", { method: "POST", body: { title: clean.title, body: issueText(new URL(request.url).origin, user, clean, stored) } }) }
  }, UNAVAILABLE).catch(async err => {
    await returnSlot(env, slot)
    throw err
  })
  const now = Date.now()
  const [, inserted] = await env.DB.batch([
    saveUser(env, user),
    env.DB.prepare(`INSERT INTO issues (user_id, title, body, code, files, number, created_at, updated_at) VALUES (${USER_ROW}, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(user.provider, user.providerId, clean.title, clean.body, clean.code, JSON.stringify(stored), created.number, now, now),
    rememberUser(env, user)
  ]).catch(async err => {
    await github(env, `issues/${created.number}`, { method: "PATCH", body: { state: "closed", state_reason: "not_planned" } }).catch(problem => console.error(problem))
    await returnSlot(env, slot)
    throw err
  })
  const row = { id: inserted.results[0].id }
  await notify(env, row, "reported", { author: user.name, owner: false, admins: true, actor: user, on: "issues" }).run()
  emailing(context)
  return reply(201, { id: row.id })
})

export const listIssues = guarded(async context => {
  const { env, request } = context
  const user = await requireUser(context, SIGN_IN)
  const review = new URL(request.url).searchParams.has("review")
  if (review && !await isAdmin(env, user)) throw new Refusal(403, "Only reviewers can do that.")
  const query = review ? env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM issues WHERE status = 'open' ORDER BY id DESC LIMIT ?`).bind(ISSUE_LIMITS.listed) : env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM issues WHERE user_id = ${USER_ROW} ORDER BY id DESC LIMIT ?`).bind(user.provider, user.providerId, ISSUE_LIMITS.listed)
  const { results } = await query.all()
  return reply(200, { issues: results.map(row => shown(env, row, user)) })
})

export const issueDetails = guarded(async context => {
  const user = await currentUser(context)
  const row = await requestedIssue(context)
  return reply(200, { issue: shown(context.env, row, user), comments: await cachedThread(context, row) })
})

export const addIssueComment = guarded(async context => {
  const { env, request } = context
  const user = await requireUser(context, "Sign in to comment.")
  const row = await requestedIssue(context)
  const role = row.owner === user.id ? "reporter" : await isAdmin(env, user) ? "reviewer" : "commenter"
  const text = commentText((await jsonBody(request)).body)
  if (!text) throw new Refusal(400, "Write a comment first.")
  const slot = role !== "reviewer" ? await takeSlot(env, { table: "account_submissions", column: "account_hash", owner: await accountKey(env, "comments", user) }, SUBMISSION_LIMITS.commentsPerDay) : null
  if (role !== "reviewer" && !slot) throw new Refusal(429, `You can send up to ${SUBMISSION_LIMITS.commentsPerDay} comments a day.`)
  await onGitHub(() => postComment(env, row.number, user, role, text), UNAVAILABLE).catch(async err => {
    if (slot) await returnSlot(env, slot)
    throw err
  })
  await forgetThread(request, row)
  await env.DB.batch((role === "commenter" ? [] : [saveUser(env, user)]).concat(notify(env, row, "comment", { author: user.name, body: text, admins: true, actor: user, on: "issues" })))
  emailing(context)
  return reply(201, { comments: await threadOf(env, row.number, false) })
})

export const closeIssue = guarded(async context => {
  const { env, request } = context
  const user = await requireUser(context, "Sign in to close your report.")
  const row = await requestedIssue(context)
  if (row.owner !== user.id) throw new Refusal(403, "Only the person who reported this can close it here.")
  if (row.status !== "open") throw new Refusal(409, "This report is already closed.")
  await onGitHub(async () => {
    await github(env, `issues/${row.number}/comments`, { method: "POST", body: { body: "Closed by the person who reported it, on the site." } })
    await github(env, `issues/${row.number}`, { method: "PATCH", body: { state: "closed", state_reason: "not_planned" } })
  }, UNAVAILABLE)
  const now = Date.now()
  const closed = await env.DB.prepare("UPDATE issues SET status = 'closed', updated_at = ? WHERE id = ? AND status = 'open' RETURNING user_id AS userId").bind(now, row.id).first()
  if (closed) await forgetEmail(env, closed.userId).run()
  await forgetThread(request, row)
  return reply(200, { issue: shown(env, { ...row, status: "closed", updatedAt: now }, user) })
})

async function issueByNumber(env, number) {
  return env.DB.prepare("SELECT id, user_id AS userId, status FROM issues WHERE number = ?").bind(number).first()
}

export async function issueCommented(context, number, entry) {
  if (entry.user?.type === "Bot" || !REVIEWERS.has(entry.author_association)) return false
  const row = await issueByNumber(context.env, number)
  if (!row) return false
  await notify(context.env, row, "comment", { author: entry.user.login, body: entry.body ?? "", url: entry.html_url, admins: true, actor: gitHubActor(entry.user), on: "issues" }).run()
  emailing(context)
  return true
}

export async function issueStateChanged(context, issue, sender, action) {
  const { env } = context
  const status = action === "reopened" ? "open" : issue.state_reason === "completed" ? "fixed" : "closed"
  const row = await env.DB.prepare("UPDATE issues SET status = ?, updated_at = ? WHERE number = ? AND status != ? RETURNING id").bind(status, Date.now(), issue.number, status).first()
  if (!row || sender?.type === "Bot") return
  await notify(env, row, status === "open" ? "reopened" : status, { author: sender?.login ?? "", url: issue.html_url, actor: gitHubActor(sender), on: "issues" }).run()
  emailing(context)
}

export async function issueDeleted({ env }, issue) {
  const row = await issueByNumber(env, issue.number)
  if (!row) return
  await env.DB.batch([env.DB.prepare("DELETE FROM notifications WHERE issue_id = ?").bind(row.id), env.DB.prepare("DELETE FROM issues WHERE id = ?").bind(row.id), forgetEmail(env, row.userId)])
}

export function releaseIssues(env, user, keep) {
  const theirs = `SELECT id FROM issues WHERE user_id = ${USER_ROW}`
  const mine = statement => env.DB.prepare(statement).bind(user.provider, user.providerId)
  return [env.DB.prepare(`UPDATE notifications SET author = '' WHERE author = ? AND issue_id IN (${theirs})`).bind(user.name, user.provider, user.providerId)].concat(keep ? mine(`UPDATE issues SET user_id = NULL WHERE user_id = ${USER_ROW}`) : [
    mine(`DELETE FROM notifications WHERE issue_id IN (${theirs})`),
    mine(`DELETE FROM issues WHERE user_id = ${USER_ROW}`)
  ])
}
