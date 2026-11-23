import { SUBMISSION_LIMITS } from "../../lib/submissions/submissions.js"
import { USER_ROW, forgetSpareEmails, forgetUnusedUser, requireUser } from "../accounts.js"
import { emailNotifications } from "../email.js"
import { guarded, idParam, reply } from "../http.js"
import { MISSING, SIGN_IN } from "./store.js"

export const NOTE_LENGTH = 1000

export function clipped(text, limit) {
  return Array.from(text).slice(0, limit).join("")
}

const TARGETS = { submissions: "submission_id", issues: "issue_id" }

export function notify(env, row, kind, { author = "", body = "", url = "", owner = true, admins = false, actor = null, unlessUnread = false, email = true, on = "submissions" }) {
  const column = TARGETS[on]
  const audience = [owner && `users.id = ${on}.user_id`, admins && "users.admin = 1"].filter(Boolean).join(" OR ")
  const unread = unlessUnread ? ` AND NOT EXISTS (SELECT 1 FROM notifications AS earlier WHERE earlier.user_id = users.id AND earlier.${column} = ${on}.id AND earlier.kind = '${kind}' AND earlier.seen = 0)` : ""
  return env.DB.prepare(`INSERT INTO notifications (user_id, ${column}, kind, author, body, url, emailed, created_at) SELECT users.id, ${on}.id, ?, ?, ?, ?, ?, ? FROM ${on} JOIN users ON ${audience} WHERE ${on}.id = ? AND NOT (users.provider = ? AND users.provider_id = ?) AND (users.email IS NULL OR users.email NOT IN (SELECT email FROM users AS actor WHERE actor.provider = ? AND actor.provider_id = ? AND actor.email IS NOT NULL AND (actor.admin = 1 OR users.admin = 0)))${unread}`).bind(kind, author, clipped(body, NOTE_LENGTH), url, email ? 0 : 1, Date.now(), row.id, actor?.provider ?? "", actor?.providerId ?? "", actor?.provider ?? "", actor?.providerId ?? "")
}

export function emailing(context, afterwards = null) {
  context.waitUntil(emailNotifications(context.env).catch(err => console.error(err)).then(() => afterwards?.run()))
}

export const listNotifications = guarded(async context => {
  const user = await requireUser(context, SIGN_IN)
  const { results } = await context.env.DB.prepare(`SELECT notifications.id, notifications.submission_id AS submission, notifications.issue_id AS issue, COALESCE(submissions.name, issues.title, notifications.submission_name) AS submissionName, notifications.kind, notifications.author, notifications.body, notifications.url, notifications.link, notifications.seen, notifications.created_at AS createdAt FROM notifications LEFT JOIN submissions ON submissions.id = notifications.submission_id LEFT JOIN issues ON issues.id = notifications.issue_id WHERE notifications.user_id = ${USER_ROW} ORDER BY notifications.id DESC LIMIT ?`).bind(user.provider, user.providerId, SUBMISSION_LIMITS.notifications).all()
  return reply(200, { notifications: results.map(item => ({ ...item, seen: !!item.seen })) })
})

export const clearNotifications = guarded(async context => {
  const user = await requireUser(context, SIGN_IN)
  await context.env.DB.batch([context.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ${USER_ROW}`).bind(user.provider, user.providerId), forgetSpareEmails(context.env), forgetUnusedUser(context.env, user)])
  return reply(200, { notifications: [] })
})

export const markNotificationsSeen = guarded(async context => {
  const user = await requireUser(context, SIGN_IN)
  const search = new URL(context.request.url).searchParams
  const [column, id] = search.has("submission") ? ["submission_id", search.get("submission")] : search.has("issue") ? ["issue_id", search.get("issue")] : [null, null]
  if (column === null) await context.env.DB.prepare(`UPDATE notifications SET seen = 1 WHERE seen = 0 AND user_id = ${USER_ROW}`).bind(user.provider, user.providerId).run()
  else await context.env.DB.prepare(`UPDATE notifications SET seen = 1 WHERE seen = 0 AND user_id = ${USER_ROW} AND ${column} = ?`).bind(user.provider, user.providerId, idParam({ id }, MISSING)).run()
  return reply(200, { seen: true })
})
