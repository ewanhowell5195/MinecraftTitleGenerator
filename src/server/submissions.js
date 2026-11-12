import { authorList } from "../lib/authors.js"
import { flattenFonts } from "../lib/font.js"
import { titleCase } from "../lib/names.js"
import { providerLabel } from "../lib/providers.js"
import { SUBMISSION_KINDS, checkSubmission, submissionContext } from "../lib/submissionKinds/index.js"
import { publishedTitle } from "../lib/submissionKinds/published.js"
import { EXTRA_FILE, SUBMISSION_LIMITS, assetId, sizedProblem } from "../lib/submissions.js"
import { USER_ROW, accountKey, activeUser, forgetEmail, forgetSpareEmails, forgetUnusedUser, isAdmin, rememberUser, requireUser, saveUser, signedInUser } from "./accounts.js"
import { returnSlot, takeSlot } from "./daily.js"
import { emailNotifications, emailReviewers } from "./email.js"
import { GitHubError, base64, github, repository, verifiedWebhook } from "./github.js"
import { Refusal, bodyBytes, cachedAtEdge, guarded, idParam, jsonBody, reply } from "./http.js"
import { SERVER_KINDS } from "./submissionKinds/index.js"

const BASE = "main"
const MISSING = "This submission doesn't exist."
const SIGN_IN = "Sign in to send submissions."
const REVIEWED = "This submission has already been reviewed."
const FRESH_SECONDS = 30
const LASTING_SECONDS = 31536000
const PER_PAGE = 100
const UNAVAILABLE = "GitHub isn't taking submissions right now. Try again in a few minutes."
const FORM_ALLOWANCE = 20000
const EXTRA_PREFIX = "extra:"
const ANONYMOUS = "Sent from the website."
const SENDER = /^Sent from the website by .*$/m
const NOTE_LENGTH = 1000
const NEXT_ID = "MAX(COALESCE((SELECT MAX(id) FROM submissions), 0), COALESCE((SELECT MAX(id) FROM deleted_submissions), 0)) + 1"
const REVIEWERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])
const COMMENTERS = { submitter: "The submitter", reviewer: "A reviewer" }
const ANONYMOUS_ROLES = { "The submitter": "submitter", "A reviewer": "reviewer" }
const SITE_COMMENT = /^(?:(`+) (.+?) \1 \((submitter|reviewer)\)|(The submitter|A reviewer)) commented on the site:\n\n(`{3,})text\n([\s\S]*)\n\5$/
const SITE_EDIT = /^(?:(`+) (.+?) \1 \((submitter|reviewer)\)|(The submitter|A reviewer)) changed the submission on the site\.$/
const UNMERGEABLE = [405, 409, 422]
const PREVIEW_HOST = "minecrafttitlegenerator.pages.dev"
const WORKFLOW = "submission.yml"
// the commit message .github/workflows/submission.yml makes after converting
const WORKFLOW_COMMIT = "add thumbnails and compress textures"
const SHOWN = "id, kind, target, asset, name, credit, notes, details, file, status, pull, created_at AS createdAt, updated_at AS updatedAt"
const OWNER = "(SELECT users.provider || ':' || users.provider_id FROM users WHERE users.id = submissions.user_id) AS owner, (SELECT users.name FROM users WHERE users.id = submissions.user_id) AS ownerName, (SELECT users.provider FROM users WHERE users.id = submissions.user_id) AS ownerProvider"

async function asset({ request, env }, path) {
  const response = await env.ASSETS.fetch(new URL(path, request.url))
  if (!response.ok) throw new Error(`the site has no ${path}`)
  return response
}

async function publishedFonts(context) {
  return flattenFonts(await (await asset(context, "/font/fonts.json")).json()).map(font => ({ ...font, name: font.name ?? titleCase(font.id) }))
}

function storedCredit(text) {
  try {
    const names = JSON.parse(text)
    if (Array.isArray(names)) return authorList(names)
  } catch {}
  return authorList(text)
}

function withCredit(row) {
  return row && { ...row, credit: storedCredit(row.credit) }
}

function sentCredit(text) {
  try {
    return JSON.parse(text ?? "")
  } catch {
    return null
  }
}

async function findSubmission(env, id) {
  const row = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE id = ?`).bind(id).first()
  if (!row) throw new Refusal(404, MISSING)
  return withCredit(row)
}

async function ownSubmission(context, reviewers = false) {
  const user = await requireUser(context, SIGN_IN)
  const row = await findSubmission(context.env, idParam(context.params, MISSING))
  const mine = row.owner === user.id
  if (!mine && !(reviewers && await isAdmin(context.env, user))) throw new Refusal(404, MISSING)
  if (row.status !== "open") throw new Refusal(409, "This submission has already been reviewed, so it can't be changed.")
  return { user, row, role: mine ? "submitter" : "reviewer" }
}

async function onGitHub(work) {
  try {
    return await work()
  } catch (err) {
    if (!(err instanceof GitHubError)) throw err
    console.error(err)
    throw new Refusal(502, UNAVAILABLE)
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
  const files = {}
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

async function readForm(context, previous = null) {
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
  const fields = { kind, target: form.get("target") ?? "", details: parsedDetails(form.get("details")), bytes, files, name: form.get("name"), credit: sentCredit(form.get("credit")), notes: form.get("notes") ?? "", agree: form.get("agree") === "true" }
  const { problems, clean } = await checkSubmission(fields, submissionContext(fonts, path => asset(context, path)))
  const problem = Object.values(problems)[0]
  if (problem) throw new Refusal(400, problem)
  const before = previous ? JSON.parse(previous.details) : {}
  if (!bytes) {
    if (clean.kind !== previous.kind || clean.target !== previous.target) throw new Refusal(400, `Choose the ${type.noun}'s file again for the new choice.`)
    for (const key of type.derived) clean.details[key] ??= before[key]
  }
  const wanted = type.fileKeys?.(clean.details) ?? []
  const missing = wanted.find(key => !files[key] && !before.files?.[key])
  if (missing) throw new Refusal(400, "One of the extra files is missing. Choose it again.")
  const stored = bytes && type.cleanFile ? type.cleanFile(bytes) : bytes
  return { clean, fonts, bytes: stored, files: Object.fromEntries(wanted.map(key => [key, files[key] ?? before.files[key]])) }
}

async function withFiles(env, clean, files) {
  const shas = {}
  for (const [key, value] of Object.entries(files)) shas[key] = typeof value === "string" ? value : await uploadFile(env, value)
  return { ...clean, details: JSON.stringify(Object.keys(shas).length ? { ...clean.details, files: shas } : clean.details) }
}

function branchOf(id) {
  return `submission/${id}`
}

function longestRun(text) {
  return Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length))
}

function inline(text) {
  const fence = "`".repeat(longestRun(text) + 1)
  return `${fence} ${text} ${fence}`
}

function block(text) {
  const fence = "`".repeat(Math.max(3, longestRun(text) + 1))
  return `${fence}text\n${text}\n${fence}`
}

function phrase(...parts) {
  return parts.filter(Boolean).join(" ")
}

function pullText(env, origin, row, described, preview, commit) {
  const { noun } = SUBMISSION_KINDS[row.kind]
  const body = [
    `New ${phrase(noun, inline(row.name), described.where)}, credited to ${row.credit.map(inline).join(", ")}.`,
    row.ownerName ? `Sent from the website by ${inline(row.ownerName)} (${row.ownerProvider}).` : ANONYMOUS,
    `**[Preview it on the site](${origin}/submissions/${row.id})**`,
    preview ? `<img src="https://raw.githubusercontent.com/${repository(env)}/${commit}/${preview}" alt="" width="512">` : null,
    row.notes ? `Notes from the submitter:\n\n${block(row.notes)}` : null
  ]
  return { title: phrase(row.name, noun, described.where), body: body.filter(Boolean).join("\n\n") }
}

async function moveBranch(env, id, sha) {
  try {
    await github(env, `git/refs/heads/${branchOf(id)}`, { method: "PATCH", body: { sha, force: true } })
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 422) throw err
    await github(env, "git/refs", { method: "POST", body: { ref: `refs/heads/${branchOf(id)}`, sha } })
  }
}

async function deleteBranch(env, id) {
  try {
    await github(env, `git/refs/heads/${branchOf(id)}`, { method: "DELETE" })
  } catch (err) {
    if (!(err instanceof GitHubError) || ![404, 422].includes(err.status)) throw err
  }
}

function reader(env, base) {
  return async path => {
    try {
      return new TextDecoder().decode(await github(env, `contents/${path}?ref=${base}`, { raw: true }))
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null
      throw err
    }
  }
}

function scopesOf(row, details, fonts) {
  return SERVER_KINDS[row.kind].scopes?.({ row, details, fonts }) ?? [row.target]
}

async function openSubmissions(env) {
  return (await env.DB.prepare("SELECT id, kind, target, asset, details FROM submissions WHERE status = 'open'").all()).results
}

function takenIds(row, details, fonts, open) {
  const mine = new Set(scopesOf(row, details, fonts))
  return open.filter(other => other.id !== row.id && scopesOf(other, JSON.parse(other.details), fonts).some(scope => mine.has(scope))).map(other => other.asset)
}

async function syncSubmission(context, row, fonts, open = null) {
  const { env, request } = context
  const type = SERVER_KINDS[row.kind]
  const details = JSON.parse(row.details)
  const base = (await github(env, `git/ref/heads/${BASE}`)).object.sha
  const commit = await github(env, `git/commits/${base}`)
  const written = await type.write({ row, details, fonts, read: reader(env, base), taken: takenIds(row, details, fonts, open ?? await openSubmissions(env)) })
  const tree = await github(env, "git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: written.files.map(({ path, content, sha }) => ({ path, mode: "100644", type: "blob", ...(sha ? { sha } : { content }) })) } })
  const described = type.describe({ row, details, fonts })
  const made = await github(env, "git/commits", { method: "POST", body: { message: `add ${phrase(row.name, SUBMISSION_KINDS[row.kind].noun, described.into)}`, tree: tree.sha, parents: [base] } })
  await moveBranch(env, row.id, made.sha)
  row.asset = written.asset
  const text = pullText(env, new URL(request.url).origin, row, described, written.preview, made.sha)
  if (row.pull) await github(env, `pulls/${row.pull}`, { method: "PATCH", body: text })
  else row.pull = (await github(env, "pulls", { method: "POST", body: { ...text, head: branchOf(row.id), base: BASE, maintainer_can_modify: true } })).number
  await env.DB.prepare("UPDATE submissions SET kind = ?, target = ?, asset = ?, name = ?, credit = ?, notes = ?, details = ?, file = ?, pull = ?, updated_at = ? WHERE id = ?").bind(row.kind, row.target, row.asset, row.name, JSON.stringify(row.credit), row.notes, row.details, row.file, row.pull, Date.now(), row.id).run()
}

async function uploadFile(env, bytes) {
  return (await github(env, "git/blobs", { method: "POST", body: { content: base64(bytes), encoding: "base64" } })).sha
}

function shown(env, row, user) {
  const { owner, details, ...rest } = row
  const building = row.pull && row.status === "open"
  return { ...rest, details: JSON.parse(details), pullUrl: row.pull ? pullLink(env, row) : null, previewUrl: building ? `https://${branchOf(row.id).replace(/\//g, "-")}.${PREVIEW_HOST}` : null, filesUrl: building ? `https://raw.githubusercontent.com/${repository(env)}/refs/heads/${branchOf(row.id)}/public/` : null, mine: !!user && user.id === owner }
}

function clipped(text, limit) {
  return Array.from(text).slice(0, limit).join("")
}

function gitHubActor(person) {
  return person?.id ? { provider: "github", providerId: String(person.id) } : null
}

function notify(env, row, kind, { author = "", body = "", url = "", owner = true, admins = false, actor = null, unlessUnread = false, email = true }) {
  const audience = [owner && "users.id = submissions.user_id", admins && "users.admin = 1"].filter(Boolean).join(" OR ")
  const unread = unlessUnread ? ` AND NOT EXISTS (SELECT 1 FROM notifications AS earlier WHERE earlier.user_id = users.id AND earlier.submission_id = submissions.id AND earlier.kind = '${kind}' AND earlier.seen = 0)` : ""
  return env.DB.prepare(`INSERT INTO notifications (user_id, submission_id, kind, author, body, url, emailed, created_at) SELECT users.id, submissions.id, ?, ?, ?, ?, ?, ? FROM submissions JOIN users ON ${audience} WHERE submissions.id = ? AND NOT (users.provider = ? AND users.provider_id = ?) AND (users.email IS NULL OR users.email NOT IN (SELECT email FROM users AS actor WHERE actor.provider = ? AND actor.provider_id = ? AND actor.email IS NOT NULL))${unread}`).bind(kind, author, clipped(body, NOTE_LENGTH), url, email ? 0 : 1, Date.now(), row.id, actor?.provider ?? "", actor?.providerId ?? "", actor?.provider ?? "", actor?.providerId ?? "")
}

function emailing(context, afterwards = null) {
  context.waitUntil(emailNotifications(context.env).catch(err => console.error(err)).then(() => afterwards?.run()))
}

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

function cacheKey(request, id, part) {
  return new URL(`/api/submissions/${id}/${part}`, request.url).href
}

function freshKey(request, row, part) {
  return `${cacheKey(request, row.id, part)}?pull=${row.pull}`
}

async function forgetFresh(request, row) {
  await Promise.all(["thread", "processing"].map(part => globalThis.caches?.default.delete(new Request(freshKey(request, row, part)))))
}

async function threadReply(env, row) {
  const comments = await threadOf(env, row)
  return reply(comments ? 200 : 502, comments)
}

async function cachedThread(context, row) {
  const response = await cachedAtEdge(context, () => threadReply(context.env, row), { seconds: FRESH_SECONDS, key: freshKey(context.request, row, "thread") })
  return response.json()
}

function commentText(value) {
  const text = typeof value === "string" ? value.trim() : ""
  if (Array.from(text).length > SUBMISSION_LIMITS.comment) throw new Refusal(400, `Comments can be up to ${SUBMISSION_LIMITS.comment} characters.`)
  return text
}

function onGitHubText(name, { kind = "comment", role, body = "" }) {
  const who = name ? `${inline(name)} (${role})` : COMMENTERS[role]
  return kind === "edit" ? `${who} changed the submission on the site.` : `${who} commented on the site:\n\n${block(body)}`
}

function postComment(env, row, user, role, text) {
  return github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body: onGitHubText(user.name, { role, body: text }) } })
}

async function noteEdit(env, row, user, role) {
  const body = onGitHubText(user.name, { kind: "edit", role })
  const last = (await listed(env, `issues/${row.pull}/comments`)).at(-1)
  const before = last && fromApp(env, last) ? siteComment(last.body) : null
  if (before?.kind === "edit" && before.role === role && (role === "submitter" || before.author === user.name)) await github(env, `issues/comments/${last.id}`, { method: "PATCH", body: { body } })
  else await github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body } })
}

async function closePull(env, pull, comment) {
  if (comment) await github(env, `issues/${pull}/comments`, { method: "POST", body: { body: comment } })
  await github(env, `pulls/${pull}`, { method: "PATCH", body: { state: "closed" } })
}

async function anonymiseComments(env, pull, theirs) {
  for (const entry of await listed(env, `issues/${pull}/comments`)) {
    const comment = fromApp(env, entry) && siteComment(entry.body)
    if (comment?.author && theirs(comment)) await github(env, `issues/comments/${entry.id}`, { method: "PATCH", body: { body: onGitHubText(null, comment) } })
  }
}

function pullLink(env, row) {
  return `https://github.com/${repository(env)}/pull/${row.pull}`
}

function claim(env, id, status) {
  return env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ? AND status = 'open' RETURNING user_id AS userId").bind(status, Date.now(), id).first()
}

function reopen(env, id) {
  return env.DB.prepare("UPDATE submissions SET status = 'open' WHERE id = ?").bind(id).run()
}

function removing(env, id) {
  return [env.DB.prepare("DELETE FROM notifications WHERE submission_id = ?").bind(id), env.DB.prepare("INSERT OR IGNORE INTO deleted_submissions (id) VALUES (?)").bind(id), env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(id)]
}

async function startClosing(context, row, merged) {
  const status = merged ? "published" : "rejected"
  const link = merged ? publishedTitle({ ...row, details: JSON.parse(row.details) }, await publishedFonts(context)) : pullLink(context.env, row)
  const closed = await claim(context.env, row.id, status)
  return closed && { status, link, userId: closed.userId }
}

async function finishClosing(context, row, { status, link, userId }, { author = "", body = "", url = "", actor = null }) {
  const { env } = context
  const told = env.DB.prepare("INSERT INTO notifications (user_id, submission_name, kind, author, body, url, link, created_at) SELECT users.id, submissions.name, ?, ?, ?, ?, ?, ? FROM submissions JOIN users ON users.id = submissions.user_id WHERE submissions.id = ? AND NOT (users.provider = ? AND users.provider_id = ?)").bind(status, author, clipped(body, NOTE_LENGTH), url, link, Date.now(), row.id, actor?.provider ?? "", actor?.providerId ?? "")
  await env.DB.batch([told].concat(removing(env, row.id)))
  emailing(context, forgetEmail(env, userId))
  await deleteBranch(env, row.id)
}

async function reviewerOf(context) {
  const user = await requireUser(context, "Sign in to review submissions.")
  if (!await isAdmin(context.env, user)) throw new Refusal(403, "Only reviewers can do that.")
  return user
}

async function openedSubmission(context, user, { clean, fonts, bytes, files }) {
  const { env } = context
  const file = await onGitHub(() => uploadFile(env, bytes))
  const { details } = await onGitHub(() => withFiles(env, clean, files))
  const now = Date.now()
  const placeholder = assetId(clean.name, new Set())
  const [, inserted] = await env.DB.batch([
    saveUser(env, user),
    env.DB.prepare(`INSERT INTO submissions (id, user_id, kind, target, asset, name, credit, notes, details, file, created_at, updated_at) VALUES (${NEXT_ID}, ${USER_ROW}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(user.provider, user.providerId, clean.kind, clean.target, placeholder, clean.name, JSON.stringify(clean.credit), clean.notes, details, file, now, now),
    rememberUser(env, user)
  ])
  const row = { id: inserted.results[0].id, ...clean, asset: placeholder, details, file, pull: null, ownerName: user.name, ownerProvider: user.provider }
  try {
    await onGitHub(() => syncSubmission(context, row, fonts))
  } catch (err) {
    await env.DB.prepare("DELETE FROM submissions WHERE id = ? AND pull IS NULL").bind(row.id).run()
    if (!row.pull) await deleteBranch(env, row.id).catch(problem => console.error(problem))
    throw err
  }
  return row
}

export const createSubmission = guarded(async context => {
  const { env } = context
  const user = await requireUser(context, SIGN_IN, activeUser)
  if (user.email === undefined) throw new Refusal(403, "Sign in again so you can be emailed about your submission.")
  if (!user.email) throw new Refusal(403, `Add an email address to your ${providerLabel(user.provider)} account, then sign in again. You'll be emailed about your submission there.`)
  const form = await readForm(context)
  const slot = await takeSlot(env, { table: "account_submissions", column: "account_hash", owner: await accountKey(env, "submissions", user) }, SUBMISSION_LIMITS.perDay)
  if (!slot) throw new Refusal(429, `You can send up to ${SUBMISSION_LIMITS.perDay} submissions a day.`)
  const row = await openedSubmission(context, user, form).catch(async err => {
    await returnSlot(env, slot)
    throw err
  })
  await notify(env, row, "submitted", { author: user.name, owner: false, admins: true, actor: user }).run()
  emailing(context)
  return reply(201, { id: row.id, pull: row.pull })
})

export const editSubmission = guarded(async context => {
  const { env } = context
  const { user, row, role } = await ownSubmission(context, true)
  const { clean, fonts, bytes, files } = await readForm(context, row)
  const file = bytes ? await onGitHub(() => uploadFile(env, bytes)) : row.file
  const changed = { ...row, ...await onGitHub(() => withFiles(env, clean, files)), file }
  await onGitHub(async () => {
    await syncSubmission(context, changed, fonts)
    await noteEdit(env, changed, user, role)
  })
  await forgetFresh(context.request, changed)
  const mine = role === "submitter"
  await env.DB.batch([
    env.DB.prepare(`UPDATE notifications SET author = ?, created_at = ? WHERE submission_id = ? AND kind = 'edited' AND seen = 0 AND user_id ${mine ? "IS NOT" : "IS"} (SELECT user_id FROM submissions WHERE id = ?)`).bind(user.name, Date.now(), changed.id, changed.id),
    notify(env, changed, "edited", { author: user.name, owner: !mine, admins: mine, actor: user, unlessUnread: true, email: mine })
  ])
  if (mine) emailing(context)
  return reply(200, { submission: shown(env, changed, user) })
})

export const withdrawSubmission = guarded(async context => {
  const { env } = context
  const { user, row } = await ownSubmission(context)
  const withdrawn = await claim(env, row.id, "withdrawn")
  try {
    if (row.pull) await onGitHub(() => closePull(env, row.pull, "Withdrawn by the person who sent it. Reopen this pull request to accept it anyway."))
  } catch (err) {
    await reopen(env, row.id)
    throw err
  }
  await env.DB.batch(removing(env, row.id).concat(forgetEmail(env, withdrawn?.userId ?? null), forgetUnusedUser(env, user)))
  return reply(200, { id: row.id })
})

async function anonymisePull(env, number) {
  const pull = await github(env, `pulls/${number}`)
  if (typeof pull.body === "string" && SENDER.test(pull.body)) await github(env, `pulls/${number}`, { method: "PATCH", body: { body: pull.body.replace(SENDER, ANONYMOUS) } })
}

export async function releaseSubmissions(context, user, keep) {
  const { env } = context
  const { results } = await env.DB.prepare(`SELECT id, status, pull FROM submissions WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId).all()
  const reviewing = await isAdmin(env, user) ? (await env.DB.prepare(`SELECT pull FROM submissions WHERE pull IS NOT NULL AND (user_id IS NULL OR user_id != ${USER_ROW})`).bind(user.provider, user.providerId).all()).results : []
  const withdrawing = keep ? [] : results.filter(row => row.status === "open")
  if (withdrawing.length) await env.DB.prepare(`UPDATE submissions SET status = 'withdrawn', updated_at = ? WHERE status = 'open' AND user_id = ${USER_ROW}`).bind(Date.now(), user.provider, user.providerId).run()
  try {
    await onGitHub(async () => {
      for (const row of results.filter(item => item.pull)) {
        await anonymisePull(env, row.pull)
        await anonymiseComments(env, row.pull, comment => comment.role === "submitter")
        if (withdrawing.includes(row)) await closePull(env, row.pull, "Withdrawn because the person who sent it deleted their account. Reopen this pull request to accept it anyway.")
      }
      for (const row of reviewing) await anonymiseComments(env, row.pull, comment => comment.role === "reviewer" && comment.author === user.name)
    })
  } catch (err) {
    if (withdrawing.length) await env.DB.prepare(`UPDATE submissions SET status = 'open' WHERE status = 'withdrawn' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(withdrawing.map(row => row.id))).run()
    throw err
  }
  const theirs = `SELECT id FROM submissions WHERE user_id = ${USER_ROW}`
  const mine = statement => env.DB.prepare(statement).bind(user.provider, user.providerId)
  return [
    mine(`DELETE FROM notifications WHERE user_id = ${USER_ROW}`),
    env.DB.prepare(`UPDATE notifications SET author = '' WHERE author = ? AND submission_id IN (${theirs})`).bind(user.name, user.provider, user.providerId)
  ].concat(keep ? mine(`UPDATE submissions SET user_id = NULL WHERE user_id = ${USER_ROW}`) : [
    mine(`DELETE FROM notifications WHERE submission_id IN (${theirs})`),
    mine(`INSERT OR IGNORE INTO deleted_submissions (id) SELECT id FROM submissions WHERE user_id = ${USER_ROW}`),
    mine(`DELETE FROM submissions WHERE user_id = ${USER_ROW}`)
  ])
}

export const listSubmissions = guarded(async context => {
  const { env, request } = context
  if (new URL(request.url).searchParams.has("review")) {
    const user = await reviewerOf(context)
    const { results } = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE status = 'open' ORDER BY id LIMIT ?`).bind(SUBMISSION_LIMITS.listed).all()
    return reply(200, { submissions: results.map(row => shown(env, withCredit(row), user)) })
  }
  const user = await requireUser(context, SIGN_IN)
  const { results } = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE user_id = ${USER_ROW} ORDER BY id DESC LIMIT ?`).bind(user.provider, user.providerId, SUBMISSION_LIMITS.listed).all()
  return reply(200, { submissions: results.map(row => shown(env, withCredit(row), user)) })
})

export const submissionDetails = guarded(async context => {
  const { env } = context
  const row = await findSubmission(env, idParam(context.params, MISSING))
  const user = await signedInUser(context)
  return reply(200, { submission: shown(env, row, user), comments: await cachedThread(context, row), reviewer: await isAdmin(env, user) })
})

export const addComment = guarded(async context => {
  const { env, request } = context
  const user = await requireUser(context, "Sign in to comment.", activeUser)
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

async function processingOf(env, row) {
  if (row.status !== "open" || !row.pull) return { state: "done" }
  const head = (await github(env, `git/ref/heads/${branchOf(row.id)}`)).object.sha
  if ((await github(env, `git/commits/${head}`)).message.startsWith(WORKFLOW_COMMIT)) return { state: "done" }
  const run = (await github(env, `actions/workflows/${WORKFLOW}/runs?head_sha=${head}&per_page=1`)).workflow_runs[0]
  if (!run || run.status !== "completed") return { state: "processing" }
  return run.conclusion === "success" ? { state: "done" } : { state: "failed", url: run.html_url }
}

export const submissionProcessing = guarded(async context => {
  const row = await findSubmission(context.env, idParam(context.params, MISSING))
  return cachedAtEdge(context, async () => reply(200, await onGitHub(() => processingOf(context.env, row))), { seconds: FRESH_SECONDS, key: freshKey(context.request, row, "processing") })
})

export const reviewState = guarded(async context => {
  const { env } = context
  await reviewerOf(context)
  const row = await findSubmission(env, idParam(context.params, MISSING))
  if (row.status !== "open" || !row.pull) return reply(200, { state: null })
  const pull = await onGitHub(() => github(env, `pulls/${row.pull}`))
  return reply(200, { state: pull.mergeable_state ?? "unknown" })
})

async function mergePull(env, pull) {
  try {
    await github(env, `pulls/${pull}/merge`, { method: "PUT", body: { merge_method: "squash" } })
  } catch (err) {
    if (err instanceof GitHubError && UNMERGEABLE.includes(err.status)) throw new Refusal(409, "GitHub can't merge this yet. Wait for its checks to finish, or open the pull request to see why.")
    throw err
  }
}

export const reviewSubmission = guarded(async context => {
  const { env, request } = context
  const user = await reviewerOf(context)
  const row = await findSubmission(env, idParam(context.params, MISSING))
  const { action, comment } = await jsonBody(request)
  if (!["merge", "decline"].includes(action)) throw new Refusal(400, "Choose to merge or decline it.")
  if (row.status !== "open" || !row.pull) throw new Refusal(409, REVIEWED)
  const merged = action === "merge"
  const text = merged ? "" : commentText(comment)
  const closing = await startClosing(context, row, merged)
  if (!closing) throw new Refusal(409, REVIEWED)
  try {
    await onGitHub(() => merged ? mergePull(env, row.pull) : closePull(env, row.pull, text && onGitHubText(user.name, { role: "reviewer", body: text })))
  } catch (err) {
    await reopen(env, row.id)
    throw err
  }
  await finishClosing(context, row, closing, { author: user.name, body: text, actor: user })
  return reply(200, { outcome: closing.status })
})

function blobReply(context, row, path, sha, type) {
  const { env, request } = context
  const lasting = new URL(request.url).searchParams.get("v") === sha
  return cachedAtEdge(context, async () => new Response(await onGitHub(() => github(env, `git/blobs/${sha}`, { raw: true })), { headers: { "Content-Type": type } }), { seconds: LASTING_SECONDS, key: `${cacheKey(request, row.id, path)}?v=${sha}`, browser: lasting ? `public, max-age=${LASTING_SECONDS}, immutable` : "no-store" })
}

export const submissionFile = guarded(async context => {
  const row = await findSubmission(context.env, idParam(context.params, MISSING))
  return blobReply(context, row, "file", row.file, SUBMISSION_KINDS[row.kind].accept)
})

export const submissionExtraFile = guarded(async context => {
  const { env, params } = context
  const row = await findSubmission(env, idParam(params, MISSING))
  const sha = JSON.parse(row.details).files?.[params.key]
  if (typeof sha !== "string") throw new Refusal(404, "This file doesn't exist.")
  return blobReply(context, row, `files/${params.key}`, sha, "image/png")
})

export const listNotifications = guarded(async context => {
  const user = await requireUser(context, SIGN_IN)
  const { results } = await context.env.DB.prepare(`SELECT notifications.id, notifications.submission_id AS submission, COALESCE(submissions.name, notifications.submission_name) AS submissionName, notifications.kind, notifications.author, notifications.body, notifications.url, notifications.link, notifications.seen, notifications.created_at AS createdAt FROM notifications LEFT JOIN submissions ON submissions.id = notifications.submission_id WHERE notifications.user_id = ${USER_ROW} ORDER BY notifications.id DESC LIMIT ?`).bind(user.provider, user.providerId, SUBMISSION_LIMITS.notifications).all()
  return reply(200, { notifications: results.map(item => ({ ...item, seen: !!item.seen })) })
})

export const clearNotifications = guarded(async context => {
  const user = await requireUser(context, SIGN_IN)
  await context.env.DB.batch([context.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId), forgetSpareEmails(context.env), forgetUnusedUser(context.env, user)])
  return reply(200, { notifications: [] })
})

export const markNotificationsSeen = guarded(async context => {
  const user = await requireUser(context, SIGN_IN)
  const submission = new URL(context.request.url).searchParams.get("submission")
  if (submission === null) await context.env.DB.prepare(`UPDATE notifications SET seen = 1 WHERE seen = 0 AND user_id = ${USER_ROW}`).bind(user.provider, user.providerId).run()
  else await context.env.DB.prepare(`UPDATE notifications SET seen = 1 WHERE seen = 0 AND user_id = ${USER_ROW} AND submission_id = ?`).bind(user.provider, user.providerId, idParam({ id: submission }, MISSING)).run()
  return reply(200, { seen: true })
})

async function pulledSubmission(env, pull) {
  return withCredit(await env.DB.prepare(`SELECT ${SHOWN} FROM submissions WHERE pull = ?`).bind(pull).first())
}

async function pullClosed(context, pull, sender) {
  const { env } = context
  const row = await pulledSubmission(env, pull.number)
  if (!row || row.status !== "open" || pull.head.ref !== branchOf(row.id)) return
  const closing = await startClosing(context, row, pull.merged)
  if (closing) await finishClosing(context, row, closing, { author: sender?.login ?? "", url: pull.html_url, actor: gitHubActor(sender) })
}

function reviewersHear(context, kind, title, entry) {
  if (entry.user?.type === "Bot") return
  const event = { kind, title, author: entry.user.login, body: entry.body ?? "", link: entry.html_url }
  context.waitUntil(emailReviewers(context.env, event, entry.user.id).catch(err => console.error(err)))
}

async function fromGitHub(context, number, kind, entry) {
  if (entry.user?.type === "Bot" || !REVIEWERS.has(entry.author_association)) return false
  const row = await pulledSubmission(context.env, number)
  if (!row) return false
  const fields = { author: entry.user.login, body: entry.body ?? "", url: entry.html_url }
  await notify(context.env, row, kind, { ...fields, admins: true, actor: gitHubActor(entry.user) }).run()
  emailing(context)
  return true
}

async function commented(context, item, comment) {
  if (!await fromGitHub(context, item.number, "comment", comment)) reviewersHear(context, "comment", item.title, comment)
}

async function reviewed(context, pull, review) {
  const changes = review.state === "changes_requested"
  if (!review.body && !changes) return
  if (!await fromGitHub(context, pull.number, changes ? "changes" : "comment", review)) reviewersHear(context, changes ? "changes" : "review", pull.title, review)
}

async function rebuildAfterPush(context, payload) {
  const { env } = context
  const touched = new Set((payload.commits ?? []).flatMap(commit => [].concat(commit.added ?? [], commit.modified ?? [], commit.removed ?? [])))
  const { results: open } = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE status = 'open' ORDER BY id`).all()
  const pulled = open.filter(row => row.pull).map(withCredit)
  if (!pulled.length) return
  const fonts = await publishedFonts(context)
  for (const row of pulled) {
    try {
      const watched = SERVER_KINDS[row.kind].watches({ row, details: JSON.parse(row.details), fonts })
      if (!watched.some(path => touched.has(path))) continue
      if ((await github(env, `pulls/${row.pull}`)).state !== "open") continue
      await syncSubmission(context, row, fonts, open)
    } catch (err) {
      console.error(`submission ${row.id} could not be rebuilt`, err)
    }
  }
}

export function submissionPage({ request, env }) {
  return env.ASSETS.fetch(new URL("/submissions/", request.url))
}

export const receiveWebhook = guarded(async context => {
  const { request, env } = context
  const payload = await verifiedWebhook(env, request)
  if (!payload) throw new Refusal(401, "This webhook isn't signed.")
  const event = request.headers.get("X-GitHub-Event")
  if (payload.repository?.full_name?.toLowerCase() !== repository(env).toLowerCase()) return reply(200, { ignored: true })
  if (event === "pull_request" && payload.action === "closed") await pullClosed(context, payload.pull_request, payload.sender)
  else if (event === "pull_request" && payload.action === "opened") reviewersHear(context, "pull", payload.pull_request.title, payload.pull_request)
  else if (event === "issues" && payload.action === "opened") reviewersHear(context, "issue", payload.issue.title, payload.issue)
  else if (event === "issue_comment" && payload.action === "created") await commented(context, payload.issue, payload.comment)
  else if (event === "pull_request_review_comment" && payload.action === "created") await commented(context, payload.pull_request, payload.comment)
  else if (event === "pull_request_review" && payload.action === "submitted") await reviewed(context, payload.pull_request, payload.review)
  else if (event === "push" && payload.ref === `refs/heads/${BASE}`) context.waitUntil(rebuildAfterPush(context, payload).catch(err => console.error(err)))
  return reply(200, { ok: true })
})
