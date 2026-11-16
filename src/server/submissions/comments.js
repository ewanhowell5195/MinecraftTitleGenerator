import { SUBMISSION_LIMITS } from "../../lib/submissions/submissions.js"
import { accountKey, isAdmin, requireUser, saveUser } from "../accounts.js"
import { returnSlot, takeSlot } from "../daily.js"
import { GitHubError, github } from "../github.js"
import { Refusal, cachedAtEdge, guarded, idParam, jsonBody, reply } from "../http.js"
import { emailing, notify } from "./notifications.js"
import { block, inline, onGitHub } from "./pulls.js"
import { MISSING, findSubmission } from "./store.js"

export const FRESH_SECONDS = 30
const PER_PAGE = 100
export const REVIEWERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])
const COMMENTERS = { submitter: "The submitter", reviewer: "A reviewer" }
const ANONYMOUS_ROLES = { "The submitter": "submitter", "A reviewer": "reviewer" }
const SITE_COMMENT = /^(?:(`+) (.+?) \1 \((submitter|reviewer)\)|(The submitter|A reviewer)) commented on the site:\n\n(`{3,})text\n([\s\S]*)\n\5$/
const SITE_EDIT = /^(?:(`+) (.+?) \1 \((submitter|reviewer)\)|(The submitter|A reviewer)) changed the submission on the site\.$/

function siteComment(text) {
  const comment = SITE_COMMENT.exec(text ?? "")
  if (comment) return { kind: "comment", author: comment[2] ?? "", role: comment[3] ?? ANONYMOUS_ROLES[comment[4]], body: comment[6] }
  const edit = SITE_EDIT.exec(text ?? "")
  return edit && { kind: "edit", author: edit[2] ?? "", role: edit[3] ?? ANONYMOUS_ROLES[edit[4]], body: "" }
}

function fromApp(env, entry) {
  return !!entry.performed_via_github_app && String(entry.performed_via_github_app.id) === String(env.GITHUB_APP_ID)
}

function fromReviewer(entry) {
  return REVIEWERS.has(entry.author_association) && entry.user?.type !== "Bot"
}

async function listed(env, path) {
  let entries = []
  for (let page = 1; entries.length < SUBMISSION_LIMITS.comments; page++) {
    const found = await github(env, `${path}?per_page=${PER_PAGE}&page=${page}`)
    entries = entries.concat(found)
    if (found.length < PER_PAGE) break
  }
  return entries.slice(0, SUBMISSION_LIMITS.comments)
}

async function commentsOf(env, row) {
  if (!row.pull) return []
  const [comments, reviews] = await Promise.all([listed(env, `issues/${row.pull}/comments`), listed(env, `pulls/${row.pull}/reviews`)])
  const written = comments.flatMap(entry => {
    const shownAs = fromApp(env, entry) ? siteComment(entry.body) : fromReviewer(entry) ? { kind: "comment", author: entry.user.login, role: "reviewer", body: entry.body ?? "" } : null
    return shownAs ? [{ id: entry.id, ...shownAs, url: entry.html_url, createdAt: Date.parse(entry.created_at) }] : []
  })
  const reviewed = reviews.filter(entry => entry.body && fromReviewer(entry)).map(entry => ({ id: entry.id, kind: "comment", author: entry.user.login, role: "reviewer", body: entry.body, url: entry.html_url, createdAt: Date.parse(entry.submitted_at) }))
  return written.concat(reviewed).sort((a, b) => a.createdAt - b.createdAt)
}

async function threadOf(env, row) {
  try {
    return await commentsOf(env, row)
  } catch (err) {
    if (!(err instanceof GitHubError)) throw err
    console.error(err)
    return null
  }
}

export function cacheKey(request, id, part) {
  return new URL(`/api/submissions/${id}/${part}`, request.url).href
}

export function freshKey(request, row, part) {
  return `${cacheKey(request, row.id, part)}?pull=${row.pull}`
}

export async function forgetFresh(request, row) {
  await Promise.all(["thread", "processing"].map(part => globalThis.caches?.default.delete(new Request(freshKey(request, row, part)))))
}

async function threadReply(env, row) {
  const comments = await threadOf(env, row)
  return reply(comments ? 200 : 502, comments)
}

export async function cachedThread(context, row) {
  const response = await cachedAtEdge(context, () => threadReply(context.env, row), { seconds: FRESH_SECONDS, key: freshKey(context.request, row, "thread") })
  return response.json()
}

export function commentText(value) {
  const text = typeof value === "string" ? value.trim() : ""
  if (Array.from(text).length > SUBMISSION_LIMITS.comment) throw new Refusal(400, `Comments can be up to ${SUBMISSION_LIMITS.comment} characters.`)
  return text
}

export function onGitHubText(name, { kind = "comment", role, body = "" }) {
  const who = name ? `${inline(name)} (${role})` : COMMENTERS[role]
  return kind === "edit" ? `${who} changed the submission on the site.` : `${who} commented on the site:\n\n${block(body)}`
}

function postComment(env, row, user, role, text) {
  return github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body: onGitHubText(user.name, { role, body: text }) } })
}

export async function noteEdit(env, row, user, role) {
  const body = onGitHubText(user.name, { kind: "edit", role })
  const last = (await listed(env, `issues/${row.pull}/comments`)).at(-1)
  const before = last && fromApp(env, last) ? siteComment(last.body) : null
  if (before?.kind === "edit" && before.role === role && (role === "submitter" || before.author === user.name)) await github(env, `issues/comments/${last.id}`, { method: "PATCH", body: { body } })
  else await github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body } })
}

export async function anonymiseComments(env, pull, theirs) {
  for (const entry of await listed(env, `issues/${pull}/comments`)) {
    const comment = fromApp(env, entry) && siteComment(entry.body)
    if (comment?.author && theirs(comment)) await github(env, `issues/comments/${entry.id}`, { method: "PATCH", body: { body: onGitHubText(null, comment) } })
  }
}

export const addComment = guarded(async context => {
  const { env, request } = context
  const user = await requireUser(context, "Sign in to comment.")
  const row = await findSubmission(env, idParam(context.params, MISSING))
  const role = row.owner === user.id ? "submitter" : "reviewer"
  if (role === "reviewer" && !await isAdmin(env, user)) throw new Refusal(403, "Only the person who sent this and reviewers can comment on it.")
  const text = commentText((await jsonBody(request)).body)
  if (!text) throw new Refusal(400, "Write a comment first.")
  if (!row.pull) throw new Refusal(409, "This submission isn't on GitHub yet, so it can't take comments.")
  const slot = role === "submitter" ? await takeSlot(env, { table: "account_submissions", column: "account_hash", owner: await accountKey(env, "comments", user) }, SUBMISSION_LIMITS.commentsPerDay) : null
  if (role === "submitter" && !slot) throw new Refusal(429, `You can send up to ${SUBMISSION_LIMITS.commentsPerDay} comments a day.`)
  await onGitHub(() => postComment(env, row, user, role, text)).catch(async err => {
    if (slot) await returnSlot(env, slot)
    throw err
  })
  await forgetFresh(request, row)
  await env.DB.batch([saveUser(env, user), notify(env, row, "comment", { author: user.name, body: text, admins: true, actor: user })])
  emailing(context)
  return reply(201, { comments: await threadOf(env, row) })
})
