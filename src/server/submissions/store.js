import { authorList } from "../../lib/core/authors.js"
import { titleCase } from "../../lib/core/names.js"
import { flattenFonts } from "../../lib/font/font.js"
import { isAdmin, requireUser } from "../accounts.js"
import { repository } from "../github.js"
import { Refusal, idParam } from "../http.js"
import { branchOf, pullLink } from "./pulls.js"

export const MISSING = "This submission doesn't exist."
export const SIGN_IN = "Sign in to send submissions."
export const CLOSED = "This submission has already been reviewed, so it can't be changed."
const PREVIEW_HOST = "minecrafttitlegenerator.pages.dev"
export const SHOWN = "id, kind, target, asset, name, credit, notes, details, file, status, pull, created_at AS createdAt, updated_at AS updatedAt"
export const OWNER = "(SELECT users.provider || ':' || users.provider_id FROM users WHERE users.id = submissions.user_id) AS owner, (SELECT users.name FROM users WHERE users.id = submissions.user_id) AS ownerName, (SELECT users.provider FROM users WHERE users.id = submissions.user_id) AS ownerProvider"

export async function asset({ request, env }, path) {
  const response = await env.ASSETS.fetch(new URL(path, request.url))
  if (!response.ok) throw new Error(`the site has no ${path}`)
  return response
}

export async function publishedFonts(context) {
  return flattenFonts(await (await asset(context, "/fonts/fonts.json")).json()).map(font => ({ ...font, name: font.name ?? titleCase(font.id) }))
}

function storedCredit(text) {
  try {
    const names = JSON.parse(text)
    if (Array.isArray(names)) return authorList(names)
  } catch {}
  return authorList(text)
}

export function withCredit(row) {
  return row && { ...row, credit: storedCredit(row.credit) }
}

export async function findSubmission(env, id) {
  const row = await env.DB.prepare(`SELECT ${SHOWN}, ${OWNER} FROM submissions WHERE id = ?`).bind(id).first()
  if (!row) throw new Refusal(404, MISSING)
  return withCredit(row)
}

export async function ownSubmission(context, reviewers = false) {
  const user = await requireUser(context, SIGN_IN)
  const row = await findSubmission(context.env, idParam(context.params, MISSING))
  const mine = row.owner === user.id
  if (!mine && !(reviewers && await isAdmin(context.env, user))) throw new Refusal(404, MISSING)
  if (row.status !== "open") throw new Refusal(409, CLOSED)
  return { user, row, role: mine ? "submitter" : "reviewer" }
}

export async function reviewerOf(context) {
  const user = await requireUser(context, "Sign in to review submissions.")
  if (!await isAdmin(context.env, user)) throw new Refusal(403, "Only reviewers can do that.")
  return user
}

export function shown(env, row, user) {
  const { owner, details, ...rest } = row
  const building = row.pull && row.status === "open"
  return { ...rest, details: JSON.parse(details), pullUrl: row.pull ? pullLink(env, row) : null, previewUrl: building ? `https://${branchOf(row.id).replace(/\//g, "-")}.${PREVIEW_HOST}` : null, filesUrl: building ? `https://raw.githubusercontent.com/${repository(env)}/refs/heads/${branchOf(row.id)}/public/` : null, mine: !!user && user.id === owner }
}

export function claim(env, id, status) {
  return env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ? AND status = 'open' RETURNING user_id AS userId").bind(status, Date.now(), id).first()
}

export function reopen(env, id) {
  return env.DB.prepare("UPDATE submissions SET status = 'open' WHERE id = ?").bind(id).run()
}

export function removing(env, id) {
  return [env.DB.prepare("DELETE FROM notifications WHERE submission_id = ?").bind(id), env.DB.prepare("INSERT OR IGNORE INTO deleted_submissions (id) VALUES (?)").bind(id), env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(id)]
}
