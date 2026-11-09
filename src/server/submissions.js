import { flattenFonts } from "../lib/font.js"
import { titleCase } from "../lib/names.js"
import { SUBMISSION_KINDS, checkSubmission, submissionContext } from "../lib/submissionKinds/index.js"
import { EXTRA_FILE, SUBMISSION_LIMITS, assetId, sizedProblem } from "../lib/submissions.js"
import { USER_ROW, saveUser, signedInUser } from "./accounts.js"
import { GitHubError, base64, github, repository, verifiedWebhook } from "./github.js"
import { Refusal, guarded, reply } from "./http.js"
import { SERVER_KINDS } from "./submissionKinds/index.js"

const BASE = "main"
const MISSING = "This submission doesn't exist."
const UNAVAILABLE = "GitHub isn't taking submissions right now. Try again in a few minutes."
const FORM_ALLOWANCE = 20000
const EXTRA_PREFIX = "extra:"
const NOTE_LENGTH = 1000
const REVIEWERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])
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

async function requireUser(context) {
  const user = await signedInUser(context)
  if (!user) throw new Refusal(401, "Sign in to send submissions.")
  return user
}

function submissionId(params) {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id < 1) throw new Refusal(404, MISSING)
  return id
}

async function findSubmission(env, id) {
  const row = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE id = ?`).bind(id).first()
  if (!row) throw new Refusal(404, MISSING)
  return row
}

async function ownSubmission(context) {
  const user = await requireUser(context)
  const row = await findSubmission(context.env, submissionId(context.params))
  if (row.owner !== user.id) throw new Refusal(404, MISSING)
  if (row.status !== "open") throw new Refusal(409, "This submission has already been reviewed, so it can't be changed.")
  return { user, row }
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

function startOfDay() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
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
  if (Number(request.headers.get("Content-Length") ?? 0) > SUBMISSION_LIMITS.totalBytes + FORM_ALLOWANCE) throw new Refusal(413, "This submission is too big.")
  const form = await request.formData().catch(() => null)
  if (!form) throw new Refusal(400, "This submission isn't valid.")
  const bytes = await uploaded(form.get("file"))
  const files = await extraFiles(form)
  if (Object.values(files).concat(bytes ?? []).reduce((total, item) => total + item.length, 0) > SUBMISSION_LIMITS.totalBytes) throw new Refusal(413, `A submission can be up to ${SUBMISSION_LIMITS.totalBytes / 1000000} MB in total.`)
  const kind = form.get("kind")
  const type = SUBMISSION_KINDS[kind]
  if (!type?.available) throw new Refusal(400, "Pick what you're submitting.")
  if (!bytes && !previous) throw new Refusal(400, sizedProblem(bytes, type.noun))
  const fonts = await publishedFonts(context)
  const fields = { kind, target: form.get("target") ?? "", details: parsedDetails(form.get("details")), bytes, files, name: form.get("name"), credit: form.get("credit"), notes: form.get("notes") ?? "", agree: form.get("agree") === "true" }
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
  return { clean, fonts, bytes, files: Object.fromEntries(wanted.map(key => [key, files[key] ?? before.files[key]])) }
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
    `New ${phrase(noun, inline(row.name), described.where)}, credited to ${inline(row.credit)}.`,
    `Sent from the website by ${inline(row.ownerName)} (${row.ownerProvider}).`,
    `**[Preview it on the site](${origin}/submissions/${row.id})**`,
    preview ? `<img src="https://raw.githubusercontent.com/${repository(env)}/${commit}/${preview}" alt="" width="512">` : null,
    row.notes ? `Notes from the submitter:\n\n${block(row.notes)}` : null,
    "Merge to publish it, or close it to turn it down. Comments from collaborators are passed on to the submitter."
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

async function takenIds(env, row, details, fonts) {
  const mine = new Set(scopesOf(row, details, fonts))
  const { results } = await env.DB.prepare("SELECT id, kind, target, asset, details FROM submissions WHERE status = 'open' AND id != ?").bind(row.id).all()
  return results.filter(other => scopesOf(other, JSON.parse(other.details), fonts).some(scope => mine.has(scope))).map(other => other.asset)
}

async function syncSubmission(context, row, fonts) {
  const { env, request } = context
  const type = SERVER_KINDS[row.kind]
  const details = JSON.parse(row.details)
  const base = (await github(env, `git/ref/heads/${BASE}`)).object.sha
  const commit = await github(env, `git/commits/${base}`)
  const written = await type.write({ row, details, fonts, read: reader(env, base), taken: await takenIds(env, row, details, fonts) })
  const tree = await github(env, "git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: written.files.map(({ path, content, sha }) => ({ path, mode: "100644", type: "blob", ...(sha ? { sha } : { content }) })) } })
  const described = type.describe({ row, details, fonts })
  const made = await github(env, "git/commits", { method: "POST", body: { message: `add ${phrase(row.name, SUBMISSION_KINDS[row.kind].noun, described.into)}`, tree: tree.sha, parents: [base] } })
  await moveBranch(env, row.id, made.sha)
  row.asset = written.asset
  const text = pullText(env, new URL(request.url).origin, row, described, written.preview, made.sha)
  if (row.pull) await github(env, `pulls/${row.pull}`, { method: "PATCH", body: text })
  else row.pull = (await github(env, "pulls", { method: "POST", body: { ...text, head: branchOf(row.id), base: BASE, maintainer_can_modify: true } })).number
  await env.DB.prepare("UPDATE submissions SET kind = ?, target = ?, asset = ?, name = ?, credit = ?, notes = ?, details = ?, file = ?, pull = ?, updated_at = ? WHERE id = ?").bind(row.kind, row.target, row.asset, row.name, row.credit, row.notes, row.details, row.file, row.pull, Date.now(), row.id).run()
}

async function uploadFile(env, bytes) {
  return (await github(env, "git/blobs", { method: "POST", body: { content: base64(bytes), encoding: "base64" } })).sha
}

function shown(env, row, user) {
  const { owner, ownerProvider, details, ...rest } = row
  return { ...rest, details: JSON.parse(details), pullUrl: row.pull ? `https://github.com/${repository(env)}/pull/${row.pull}` : null, mine: !!user && user.id === owner }
}

export const createSubmission = guarded(async context => {
  const { env } = context
  const user = await requireUser(context)
  const { clean, fonts, bytes, files } = await readForm(context)
  const sent = await env.DB.prepare(`SELECT COUNT(*) AS count FROM submissions WHERE user_id = ${USER_ROW} AND created_at >= ?`).bind(user.provider, user.providerId, startOfDay()).first()
  if ((sent?.count ?? 0) >= SUBMISSION_LIMITS.perDay) throw new Refusal(429, `You can send up to ${SUBMISSION_LIMITS.perDay} submissions a day.`)
  const file = await onGitHub(() => uploadFile(env, bytes))
  const { details } = await onGitHub(() => withFiles(env, clean, files))
  const now = Date.now()
  const placeholder = assetId(clean.name, new Set())
  const [, inserted] = await env.DB.batch([
    saveUser(env, user),
    env.DB.prepare(`INSERT INTO submissions (user_id, kind, target, asset, name, credit, notes, details, file, created_at, updated_at) VALUES (${USER_ROW}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(user.provider, user.providerId, clean.kind, clean.target, placeholder, clean.name, clean.credit, clean.notes, details, file, now, now)
  ])
  const row = { id: inserted.results[0].id, ...clean, asset: placeholder, details, file, pull: null, ownerName: user.name, ownerProvider: user.provider }
  try {
    await onGitHub(() => syncSubmission(context, row, fonts))
  } catch (err) {
    await env.DB.prepare("DELETE FROM submissions WHERE id = ? AND pull IS NULL").bind(row.id).run()
    if (!row.pull) await deleteBranch(env, row.id).catch(problem => console.error(problem))
    throw err
  }
  return reply(201, { id: row.id, pull: row.pull })
})

export const editSubmission = guarded(async context => {
  const { env } = context
  const { row } = await ownSubmission(context)
  const { clean, fonts, bytes, files } = await readForm(context, row)
  const file = bytes ? await onGitHub(() => uploadFile(env, bytes)) : row.file
  const changed = { ...row, ...await onGitHub(() => withFiles(env, clean, files)), file }
  await onGitHub(() => syncSubmission(context, changed, fonts))
  return reply(200, { submission: shown(env, changed, { id: row.owner }) })
})

export const withdrawSubmission = guarded(async context => {
  const { env } = context
  const { row } = await ownSubmission(context)
  await env.DB.prepare("UPDATE submissions SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status = 'open'").bind(Date.now(), row.id).run()
  try {
    await onGitHub(async () => {
      if (row.pull) {
        await github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body: "Withdrawn by the person who sent it." } })
        await github(env, `pulls/${row.pull}`, { method: "PATCH", body: { state: "closed" } })
      }
      await deleteBranch(env, row.id)
    })
  } catch (err) {
    await env.DB.prepare("UPDATE submissions SET status = 'open' WHERE id = ?").bind(row.id).run()
    throw err
  }
  return reply(200, { id: row.id })
})

export const listSubmissions = guarded(async context => {
  const user = await requireUser(context)
  const { results } = await context.env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE user_id = ${USER_ROW} ORDER BY id DESC LIMIT ?`).bind(user.provider, user.providerId, SUBMISSION_LIMITS.listed).all()
  return reply(200, { submissions: results.map(row => shown(context.env, row, user)) })
})

export const submissionDetails = guarded(async context => {
  const row = await findSubmission(context.env, submissionId(context.params))
  return reply(200, { submission: shown(context.env, row, await signedInUser(context)) })
})

export const submissionFile = guarded(async context => {
  const { env, request } = context
  const row = await findSubmission(env, submissionId(context.params))
  const bytes = await onGitHub(() => github(env, `git/blobs/${row.file}`, { raw: true }))
  const lasting = new URL(request.url).searchParams.get("v") === row.file
  return new Response(bytes, { headers: { "Content-Type": SUBMISSION_KINDS[row.kind].accept, "Cache-Control": lasting ? "public, max-age=31536000, immutable" : "no-store" } })
})

export const submissionExtraFile = guarded(async context => {
  const { env, request, params } = context
  const row = await findSubmission(env, submissionId(params))
  const sha = JSON.parse(row.details).files?.[params.key]
  if (typeof sha !== "string") throw new Refusal(404, "This file doesn't exist.")
  const bytes = await onGitHub(() => github(env, `git/blobs/${sha}`, { raw: true }))
  const lasting = new URL(request.url).searchParams.get("v") === sha
  return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": lasting ? "public, max-age=31536000, immutable" : "no-store" } })
})

export const listNotifications = guarded(async context => {
  const user = await requireUser(context)
  const { results } = await context.env.DB.prepare(`SELECT notifications.id, notifications.submission_id AS submission, submissions.name AS submissionName, notifications.kind, notifications.author, notifications.body, notifications.url, notifications.seen, notifications.created_at AS createdAt FROM notifications JOIN submissions ON submissions.id = notifications.submission_id WHERE notifications.user_id = ${USER_ROW} ORDER BY notifications.id DESC LIMIT ?`).bind(user.provider, user.providerId, SUBMISSION_LIMITS.notifications).all()
  return reply(200, { notifications: results.map(item => ({ ...item, seen: !!item.seen })) })
})

export const markNotificationsSeen = guarded(async context => {
  const user = await requireUser(context)
  await context.env.DB.prepare(`UPDATE notifications SET seen = 1 WHERE seen = 0 AND user_id = ${USER_ROW}`).bind(user.provider, user.providerId).run()
  return reply(200, { unread: 0 })
})

function notify(env, row, kind, { author = "", body = "", url = "" }) {
  return env.DB.prepare("INSERT INTO notifications (user_id, submission_id, kind, author, body, url, created_at) SELECT user_id, id, ?, ?, ?, ?, ? FROM submissions WHERE id = ?").bind(kind, author, Array.from(body).slice(0, NOTE_LENGTH).join(""), url, Date.now(), row.id).run()
}

async function pulledSubmission(env, pull) {
  return await env.DB.prepare(`SELECT ${SHOWN} FROM submissions WHERE pull = ?`).bind(pull).first()
}

async function pullClosed(env, pull, sender) {
  const row = await pulledSubmission(env, pull.number)
  if (!row || row.status !== "open" || pull.head.ref !== branchOf(row.id)) return
  const status = pull.merged ? "published" : "rejected"
  await env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(status, Date.now(), row.id).run()
  await notify(env, row, status, { author: sender?.login ?? "", url: pull.html_url })
  await deleteBranch(env, row.id)
}

async function commented(env, number, comment) {
  if (comment.user?.type === "Bot" || !REVIEWERS.has(comment.author_association)) return
  const row = await pulledSubmission(env, number)
  if (row) await notify(env, row, "comment", { author: comment.user.login, body: comment.body ?? "", url: comment.html_url })
}

async function reviewed(env, number, review) {
  const changes = review.state === "changes_requested"
  if (!review.body && !changes) return
  if (review.user?.type === "Bot" || !REVIEWERS.has(review.author_association)) return
  const row = await pulledSubmission(env, number)
  if (row) await notify(env, row, changes ? "changes" : "comment", { author: review.user.login, body: review.body ?? "", url: review.html_url })
}

async function rebuildAfterPush(context, payload) {
  const { env } = context
  const touched = new Set((payload.commits ?? []).flatMap(commit => [].concat(commit.added ?? [], commit.modified ?? [], commit.removed ?? [])))
  const { results } = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE status = 'open' AND pull IS NOT NULL ORDER BY id`).all()
  if (!results.length) return
  const fonts = await publishedFonts(context)
  for (const row of results) {
    try {
      const watched = SERVER_KINDS[row.kind].watches({ row, details: JSON.parse(row.details), fonts })
      if (!watched.some(path => touched.has(path))) continue
      if ((await github(env, `pulls/${row.pull}`)).state !== "open") continue
      await syncSubmission(context, row, fonts)
    } catch (err) {
      console.error(`submission ${row.id} could not be rebuilt`, err)
    }
  }
}

export const receiveWebhook = guarded(async context => {
  const { request, env } = context
  const payload = await verifiedWebhook(env, request)
  if (!payload) throw new Refusal(401, "This webhook isn't signed.")
  const event = request.headers.get("X-GitHub-Event")
  if (payload.repository?.full_name?.toLowerCase() !== repository(env).toLowerCase()) return reply(200, { ignored: true })
  if (event === "pull_request" && payload.action === "closed") await pullClosed(env, payload.pull_request, payload.sender)
  else if (event === "issue_comment" && payload.action === "created" && payload.issue.pull_request) await commented(env, payload.issue.number, payload.comment)
  else if (event === "pull_request_review_comment" && payload.action === "created") await commented(env, payload.pull_request.number, payload.comment)
  else if (event === "pull_request_review" && payload.action === "submitted") await reviewed(env, payload.pull_request.number, payload.review)
  else if (event === "push" && payload.ref === `refs/heads/${BASE}`) context.waitUntil(rebuildAfterPush(context, payload).catch(err => console.error(err)))
  return reply(200, { ok: true })
})
