import { providerLabel } from "../../lib/core/providers.js"
import { SUBMISSION_KINDS } from "../../lib/submissions/kinds/index.js"
import { SUBMISSION_LIMITS, assetId } from "../../lib/submissions/submissions.js"
import { USER_ROW, accountKey, forgetEmail, forgetUnusedUser, isAdmin, rememberUser, requireUser, saveUser, signedInUser } from "../accounts.js"
import { returnSlot, takeSlot } from "../daily.js"
import { github } from "../github.js"
import { Refusal, cachedAtEdge, canonical, guarded, idParam, reply } from "../http.js"
import { anonymiseComments, cacheKey, cachedThread, forgetFresh, noteEdit } from "./comments.js"
import { readForm } from "./form.js"
import { emailing, notify } from "./notifications.js"
import { anonymisePull, closePull, deleteBranch, onGitHub, syncSubmission, uploadFile, withFiles } from "./pulls.js"
import { CLOSED, MISSING, OWNER, SHOWN, SIGN_IN, claim, findSubmission, ownSubmission, removing, reopen, reviewerOf, shown, withCredit } from "./store.js"

const LASTING_SECONDS = 31536000
const NEXT_ID = "MAX(COALESCE((SELECT MAX(id) FROM submissions), 0), COALESCE((SELECT MAX(id) FROM deleted_submissions), 0)) + 1"
const EDITABLE = ["kind", "target", "name", "credit", "notes", "details", "file"]

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
  const user = await requireUser(context, SIGN_IN)
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

function sameSubmission(before, after) {
  return EDITABLE.every(key => {
    const read = row => key === "details" ? JSON.parse(row.details) : row[key]
    return JSON.stringify(canonical(read(before))) === JSON.stringify(canonical(read(after)))
  })
}

export const editSubmission = guarded(async context => {
  const { env } = context
  const { user, row, role } = await ownSubmission(context, true)
  const mine = role === "submitter"
  const { clean, fonts, bytes, files, revision } = await readForm(context, row)
  if (revision !== row.updatedAt) throw new Refusal(409, "This submission was changed after you opened it, by someone else or in another tab. Reload the page to see the latest version.")
  const file = bytes ? await onGitHub(() => uploadFile(env, bytes)) : row.file
  const changed = { ...row, ...await onGitHub(() => withFiles(env, clean, files)), file, notes: mine ? clean.notes : row.notes }
  if (sameSubmission(row, changed)) return reply(200, { submission: shown(env, row, user) })
  await onGitHub(async () => {
    await syncSubmission(context, changed, fonts)
    await noteEdit(env, changed, user, role)
  })
  await forgetFresh(context.request, changed)
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
  if (!withdrawn) throw new Refusal(409, CLOSED)
  try {
    if (row.pull) await onGitHub(() => closePull(env, row.pull, "Withdrawn by the person who sent it. Reopen this pull request to accept it anyway."))
  } catch (err) {
    await reopen(env, row.id)
    throw err
  }
  await env.DB.batch(removing(env, row.id).concat(forgetEmail(env, withdrawn.userId), forgetUnusedUser(env, user)))
  return reply(200, { id: row.id })
})

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
