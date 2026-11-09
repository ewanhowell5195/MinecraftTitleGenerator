import { flattenFonts } from "../lib/font.js"
import { titleCase } from "../lib/names.js"
import { SUBMISSION_KINDS, checkSubmission, submissionContext } from "../lib/submissionKinds/index.js"
import { EXTRA_FILE, SUBMISSION_LIMITS, assetId, sizedProblem } from "../lib/submissions.js"
import { USER_ROW, forgetUnusedUser, isAdmin, saveUser, signedInUser } from "./accounts.js"
import { GitHubError, base64, github, repository, verifiedWebhook } from "./github.js"
import { Refusal, guarded, jsonBody, reply } from "./http.js"
import { SERVER_KINDS } from "./submissionKinds/index.js"

const BASE = "main"
const MISSING = "This submission doesn't exist."
const UNAVAILABLE = "GitHub isn't taking submissions right now. Try again in a few minutes."
const FORM_ALLOWANCE = 20000
const EXTRA_PREFIX = "extra:"
const ANONYMOUS = "Sent from the website."
const SENDER = /^Sent from the website by .*$/m
const NOTE_LENGTH = 1000
const REVIEWERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])
const COMMENTERS = { submitter: "The submitter", reviewer: "A reviewer" }
const ANONYMOUS_ROLES = { "The submitter": "submitter", "A reviewer": "reviewer" }
const SITE_COMMENT = /^(?:(`+) (.+?) \1 \((submitter|reviewer)\)|(The submitter|A reviewer)) commented on the site:\n\n(`{3,})text\n([\s\S]*)\n\5$/
const UNMERGEABLE = [405, 409, 422]
const PREVIEW_HOST = "minecrafttitlegenerator.pages.dev"
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
    `New ${phrase(noun, inline(row.name), described.where)}, credited to ${inline(row.credit)}.`,
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
  const { owner, details, ...rest } = row
  const building = row.pull && row.status === "open"
  return { ...rest, details: JSON.parse(details), pullUrl: row.pull ? `https://github.com/${repository(env)}/pull/${row.pull}` : null, previewUrl: building ? `https://${branchOf(row.id).replace(/\//g, "-")}.${PREVIEW_HOST}/app/` : null, mine: !!user && user.id === owner }
}

function clipped(text, limit) {
  return Array.from(text).slice(0, limit).join("")
}

function gitHubActor(person) {
  return person?.id ? { provider: "github", providerId: String(person.id) } : null
}

function notify(env, row, kind, { author = "", body = "", url = "", owner = true, admins = false, actor = null }) {
  const audience = [owner && "users.id = submissions.user_id", admins && "users.admin = 1"].filter(Boolean).join(" OR ")
  return env.DB.prepare(`INSERT INTO notifications (user_id, submission_id, kind, author, body, url, created_at) SELECT users.id, submissions.id, ?, ?, ?, ?, ? FROM submissions JOIN users ON ${audience} WHERE submissions.id = ? AND NOT (users.provider = ? AND users.provider_id = ?)`).bind(kind, author, clipped(body, NOTE_LENGTH), url, Date.now(), row.id, actor?.provider ?? "", actor?.providerId ?? "")
}

function siteComment(text) {
  const match = SITE_COMMENT.exec(text ?? "")
  return match && { author: match[2] ?? "", role: match[3] ?? ANONYMOUS_ROLES[match[4]], body: match[6] }
}

function fromApp(env, entry) {
  return !!entry.performed_via_github_app && String(entry.performed_via_github_app.id) === String(env.GITHUB_APP_ID)
}

function fromReviewer(entry) {
  return REVIEWERS.has(entry.author_association) && entry.user?.type !== "Bot"
}

async function commentsOf(env, row) {
  if (!row.pull) return []
  const [comments, reviews] = await Promise.all([github(env, `issues/${row.pull}/comments?per_page=100`), github(env, `pulls/${row.pull}/reviews?per_page=100`)])
  const written = comments.flatMap(entry => {
    const shownAs = fromApp(env, entry) ? siteComment(entry.body) : fromReviewer(entry) ? { author: entry.user.login, role: "reviewer", body: entry.body ?? "" } : null
    return shownAs ? [{ id: entry.id, ...shownAs, url: entry.html_url, createdAt: Date.parse(entry.created_at) }] : []
  })
  const reviewed = reviews.filter(entry => entry.body && fromReviewer(entry)).map(entry => ({ id: entry.id, author: entry.user.login, role: "reviewer", body: entry.body, url: entry.html_url, createdAt: Date.parse(entry.submitted_at) }))
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

function commentText(value) {
  const text = typeof value === "string" ? value.trim() : ""
  if (Array.from(text).length > SUBMISSION_LIMITS.comment) throw new Refusal(400, `Comments can be up to ${SUBMISSION_LIMITS.comment} characters.`)
  return text
}

function commentOnGitHub(name, role, text) {
  return `${name ? `${inline(name)} (${role})` : COMMENTERS[role]} commented on the site:\n\n${block(text)}`
}

function postComment(env, row, user, role, text) {
  return github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body: commentOnGitHub(user.name, role, text) } })
}

async function anonymiseComments(env, pull, theirs) {
  for (const entry of await github(env, `issues/${pull}/comments?per_page=100`)) {
    const comment = fromApp(env, entry) && siteComment(entry.body)
    if (comment?.author && theirs(comment)) await github(env, `issues/comments/${entry.id}`, { method: "PATCH", body: { body: commentOnGitHub(null, comment.role, comment.body) } })
  }
}

async function closeSubmission(env, row, merged, { author = "", body = "", url = "", actor = null }) {
  const status = merged ? "published" : "rejected"
  const { meta } = await env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(status, Date.now(), row.id).run()
  if (!meta.changes) return
  await env.DB.batch((merged ? [env.DB.prepare("DELETE FROM notifications WHERE submission_id = ?").bind(row.id)] : []).concat(notify(env, row, status, { author, body, url, actor })))
  await deleteBranch(env, row.id)
}

async function reviewerOf(context) {
  const user = await signedInUser(context)
  if (!user) throw new Refusal(401, "Sign in to review submissions.")
  if (!await isAdmin(context.env, user)) throw new Refusal(403, "Only reviewers can do that.")
  return user
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
  await notify(env, row, "submitted", { author: user.name, owner: false, admins: true, actor: user }).run()
  return reply(201, { id: row.id, pull: row.pull })
})

export const editSubmission = guarded(async context => {
  const { env } = context
  const { user, row } = await ownSubmission(context)
  const { clean, fonts, bytes, files } = await readForm(context, row)
  const file = bytes ? await onGitHub(() => uploadFile(env, bytes)) : row.file
  const changed = { ...row, ...await onGitHub(() => withFiles(env, clean, files)), file }
  await onGitHub(() => syncSubmission(context, changed, fonts))
  await notify(env, changed, "edited", { author: user.name, owner: false, admins: true, actor: user }).run()
  return reply(200, { submission: shown(env, changed, { id: row.owner }) })
})

export const withdrawSubmission = guarded(async context => {
  const { env } = context
  const { user, row } = await ownSubmission(context)
  await env.DB.prepare("UPDATE submissions SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status = 'open'").bind(Date.now(), row.id).run()
  try {
    await onGitHub(async () => {
      if (row.pull) {
        await github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body: "Withdrawn by the person who sent it. Reopen this pull request to accept it anyway." } })
        await github(env, `pulls/${row.pull}`, { method: "PATCH", body: { state: "closed" } })
      }
    })
  } catch (err) {
    await env.DB.prepare("UPDATE submissions SET status = 'open' WHERE id = ?").bind(row.id).run()
    throw err
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notifications WHERE submission_id = ?").bind(row.id),
    env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(row.id),
    forgetUnusedUser(env, user)
  ])
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
        if (!withdrawing.includes(row)) continue
        await github(env, `issues/${row.pull}/comments`, { method: "POST", body: { body: "Withdrawn because the person who sent it deleted their account. Reopen this pull request to accept it anyway." } })
        await github(env, `pulls/${row.pull}`, { method: "PATCH", body: { state: "closed" } })
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
    mine(`DELETE FROM submissions WHERE user_id = ${USER_ROW}`)
  ])
}

export const listSubmissions = guarded(async context => {
  const { env, request } = context
  if (new URL(request.url).searchParams.has("review")) {
    const user = await reviewerOf(context)
    const { results } = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE status = 'open' ORDER BY id LIMIT ?`).bind(SUBMISSION_LIMITS.listed).all()
    return reply(200, { submissions: results.map(row => shown(env, row, user)) })
  }
  const user = await requireUser(context)
  const { results } = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE user_id = ${USER_ROW} ORDER BY id DESC LIMIT ?`).bind(user.provider, user.providerId, SUBMISSION_LIMITS.listed).all()
  return reply(200, { submissions: results.map(row => shown(env, row, user)) })
})

export const submissionDetails = guarded(async context => {
  const { env } = context
  const row = await findSubmission(env, submissionId(context.params))
  const user = await signedInUser(context)
  return reply(200, { submission: shown(env, row, user), comments: await threadOf(env, row), reviewer: await isAdmin(env, user) })
})

export const addComment = guarded(async context => {
  const { env, request } = context
  const user = await signedInUser(context)
  if (!user) throw new Refusal(401, "Sign in to comment.")
  const row = await findSubmission(env, submissionId(context.params))
  const role = row.owner === user.id ? "submitter" : "reviewer"
  if (role === "reviewer" && !await isAdmin(env, user)) throw new Refusal(403, "Only the person who sent this and reviewers can comment on it.")
  const text = commentText((await jsonBody(request)).body)
  if (!text) throw new Refusal(400, "Write a comment first.")
  if (!row.pull) throw new Refusal(409, "This submission isn't on GitHub yet, so it can't take comments.")
  await onGitHub(() => postComment(env, row, user, role, text))
  await env.DB.batch([saveUser(env, user), notify(env, row, "comment", { author: user.name, body: text, admins: true, actor: user })])
  return reply(201, { comments: await threadOf(env, row) })
})

export const reviewState = guarded(async context => {
  const { env } = context
  await reviewerOf(context)
  const row = await findSubmission(env, submissionId(context.params))
  if (row.status !== "open" || !row.pull) return reply(200, { state: null })
  const pull = await onGitHub(() => github(env, `pulls/${row.pull}`))
  return reply(200, { state: pull.mergeable_state ?? "unknown" })
})

export const reviewSubmission = guarded(async context => {
  const { env, request } = context
  const user = await reviewerOf(context)
  const row = await findSubmission(env, submissionId(context.params))
  const { action, comment } = await jsonBody(request)
  if (!["merge", "decline"].includes(action)) throw new Refusal(400, "Choose to merge or decline it.")
  if (row.status !== "open" || !row.pull) throw new Refusal(409, "This submission has already been reviewed.")
  const text = action === "decline" ? commentText(comment) : ""
  if (action === "merge") {
    await onGitHub(async () => {
      try {
        await github(env, `pulls/${row.pull}/merge`, { method: "PUT", body: { merge_method: "squash" } })
      } catch (err) {
        if (err instanceof GitHubError && UNMERGEABLE.includes(err.status)) throw new Refusal(409, "GitHub can't merge this yet. Wait for its checks to finish, or open the pull request to see why.")
        throw err
      }
    })
  } else {
    await onGitHub(async () => {
      if (text) await postComment(env, row, user, "reviewer", text)
      await github(env, `pulls/${row.pull}`, { method: "PATCH", body: { state: "closed" } })
    })
  }
  await closeSubmission(env, row, action === "merge", { author: user.name, body: text, actor: user })
  return reply(200, { submission: shown(env, await findSubmission(env, row.id), user), comments: await threadOf(env, row) })
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

export const clearNotifications = guarded(async context => {
  const user = await requireUser(context)
  await context.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId).run()
  return reply(200, { notifications: [] })
})

export const markNotificationsSeen = guarded(async context => {
  const user = await requireUser(context)
  await context.env.DB.prepare(`UPDATE notifications SET seen = 1 WHERE seen = 0 AND user_id = ${USER_ROW}`).bind(user.provider, user.providerId).run()
  return reply(200, { unread: 0 })
})

async function pulledSubmission(env, pull) {
  return await env.DB.prepare(`SELECT ${SHOWN} FROM submissions WHERE pull = ?`).bind(pull).first()
}

async function pullClosed(env, pull, sender) {
  const row = await pulledSubmission(env, pull.number)
  if (!row || row.status !== "open" || pull.head.ref !== branchOf(row.id)) return
  await closeSubmission(env, row, pull.merged, { author: sender?.login ?? "", url: pull.html_url, actor: gitHubActor(sender) })
}

async function fromGitHub(env, number, kind, entry) {
  if (entry.user?.type === "Bot" || !REVIEWERS.has(entry.author_association)) return
  const row = await pulledSubmission(env, number)
  if (!row) return
  const fields = { author: entry.user.login, body: entry.body ?? "", url: entry.html_url }
  await notify(env, row, kind, { ...fields, admins: true, actor: gitHubActor(entry.user) }).run()
}

async function commented(env, number, comment) {
  await fromGitHub(env, number, "comment", comment)
}

async function reviewed(env, number, review) {
  const changes = review.state === "changes_requested"
  if (review.body || changes) await fromGitHub(env, number, changes ? "changes" : "comment", review)
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
