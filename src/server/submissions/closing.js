import { publishedTitle } from "../../lib/submissions/kinds/published.js"
import { forgetEmail } from "../accounts.js"
import { NOTE_LENGTH, clipped, emailing } from "./notifications.js"
import { deleteBranch, pullLink } from "./pulls.js"
import { claim, publishedFonts, removing } from "./store.js"

export async function startClosing(context, row, merged) {
  const status = merged ? "published" : "rejected"
  const link = merged ? publishedTitle({ ...row, details: JSON.parse(row.details) }, await publishedFonts(context)) : pullLink(context.env, row)
  const closed = await claim(context.env, row.id, status)
  return closed && { status, link, userId: closed.userId }
}

export async function finishClosing(context, row, { status, link, userId }, { author = "", body = "", url = "", actor = null }) {
  const { env } = context
  const told = env.DB.prepare("INSERT INTO notifications (user_id, submission_name, kind, author, body, url, link, created_at) SELECT users.id, submissions.name, ?, ?, ?, ?, ?, ? FROM submissions JOIN users ON users.id = submissions.user_id WHERE submissions.id = ? AND NOT (users.provider = ? AND users.provider_id = ?)").bind(status, author, clipped(body, NOTE_LENGTH), url, link, Date.now(), row.id, actor?.provider ?? "", actor?.providerId ?? "")
  await env.DB.batch([told].concat(removing(env, row.id)))
  emailing(context, forgetEmail(env, userId))
  await deleteBranch(env, row.id)
}
