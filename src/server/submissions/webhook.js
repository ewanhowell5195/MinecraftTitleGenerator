import { emailReviewers } from "../email.js"
import { issueCommented, issueDeleted, issueStateChanged } from "../issues/index.js"
import { github, repository, verifiedWebhook } from "../github.js"
import { Refusal, guarded, reply } from "../http.js"
import { finishClosing, startClosing } from "./closing.js"
import { REVIEWERS } from "./comments.js"
import { SERVER_KINDS } from "./kinds/index.js"
import { emailing, notify } from "./notifications.js"
import { BASE, branchOf, syncSubmission } from "./pulls.js"
import { OWNER, SHOWN, publishedFonts, withCredit } from "./store.js"
import { forgetWithdrawnPull } from "./withdrawn.js"

function gitHubActor(person) {
  return person?.id ? { provider: "github", providerId: String(person.id) } : null
}

async function pulledSubmission(env, pull) {
  return withCredit(await env.DB.prepare(`SELECT ${SHOWN} FROM submissions WHERE pull = ?`).bind(pull).first())
}

async function pullClosed(context, pull, sender) {
  const { env } = context
  const row = await pulledSubmission(env, pull.number)
  if (!row && pull.merged) await forgetWithdrawnPull(env, pull.number)
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
  if (await fromGitHub(context, item.number, "comment", comment) || await issueCommented(context, item.number, comment)) return
  reviewersHear(context, "comment", item.title, comment)
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

export const receiveWebhook = guarded(async context => {
  const { request, env } = context
  const payload = await verifiedWebhook(env, request)
  if (!payload) throw new Refusal(401, "This webhook isn't signed.")
  const event = request.headers.get("X-GitHub-Event")
  if (payload.repository?.full_name?.toLowerCase() !== repository(env).toLowerCase()) return reply(200, { ignored: true })
  if (event === "pull_request" && payload.action === "closed") await pullClosed(context, payload.pull_request, payload.sender)
  else if (event === "pull_request" && payload.action === "opened") reviewersHear(context, "pull", payload.pull_request.title, payload.pull_request)
  else if (event === "issues" && payload.action === "opened") reviewersHear(context, "issue", payload.issue.title, payload.issue)
  else if (event === "issues" && ["closed", "reopened"].includes(payload.action)) await issueStateChanged(context, payload.issue, payload.sender, payload.action)
  else if (event === "issues" && payload.action === "deleted") await issueDeleted(context, payload.issue)
  else if (event === "issue_comment" && payload.action === "created") await commented(context, payload.issue, payload.comment)
  else if (event === "pull_request_review_comment" && payload.action === "created") await commented(context, payload.pull_request, payload.comment)
  else if (event === "pull_request_review" && payload.action === "submitted") await reviewed(context, payload.pull_request, payload.review)
  else if (event === "push" && payload.ref === `refs/heads/${BASE}`) context.waitUntil(rebuildAfterPush(context, payload).catch(err => console.error(err)))
  return reply(200, { ok: true })
})
