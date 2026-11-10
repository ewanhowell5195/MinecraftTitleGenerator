import { escaped } from "./http.js"

const SITE = "https://mctitlegenerator.com"
const FROM = "Minecraft Title Generator <notifications@mctitlegenerator.com>"
const RESEND = "https://api.resend.com/emails"

const FONT = "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const MESSAGES = {
  submitted: ({ author, name }) => ({ label: "New submission", subject: `${author} sent ${name}`, detail: "It is waiting for review.", action: "Review it" }),
  edited: ({ author, name }) => ({ label: "Submission changed", subject: `${author} changed ${name}`, detail: "It may need another look.", action: "Review it" }),
  comment: ({ name }) => ({ label: "New comment", subject: `New comment on ${name}`, action: "Reply" }),
  changes: ({ name }) => ({ label: "Changes requested", subject: `Changes requested on ${name}`, detail: "Make the changes on its page, and it will be reviewed again.", action: "See what to change" }),
  published: ({ name }) => ({ label: "Submission published", subject: `${name} was published`, detail: "It is now part of the Minecraft Title Generator. Thanks for sending it in!", action: "Open it in the generator" }),
  rejected: ({ name, body }) => ({ label: "Submission declined", subject: `${name} was declined`, detail: body ? "Thanks for sending it in." : "Thanks for sending it in. The pull request has any comments about it.", action: "See the pull request" })
}

const GITHUB_BODY = 2000

const GITHUB_MESSAGES = {
  issue: title => ({ label: "New issue", subject: `New issue: ${title}` }),
  pull: title => ({ label: "New pull request", subject: `New pull request: ${title}` }),
  comment: title => ({ label: "New comment", subject: `New comment on ${title}` }),
  review: title => ({ label: "New review", subject: `New review on ${title}` }),
  changes: title => ({ label: "Changes requested", subject: `Changes requested on ${title}` })
}

function linkOf(note) {
  return new URL(note.link || `/submissions/${note.submissionId}`, SITE).href
}

function quoteHtml(author, body) {
  return `<tr><td style="padding: 0 0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #202227; border-left: 3px solid #6cc04a"><tr><td style="padding: 14px 16px 6px; font-family: ${FONT}; font-size: 15px; line-height: 1.55; color: #f1f2f4; white-space: pre-wrap">${escaped(body)}</td></tr><tr><td style="padding: 0 16px 14px; font-family: ${FONT}; font-size: 13px; color: #7c818c">${escaped(author)}</td></tr></table></td></tr>`
}

function page({ label, subject, detail, action, link, quote, preview, reason }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escaped(subject)}</title></head>
<body style="margin: 0; padding: 0; background: #111214">
<div style="display: none; max-height: 0; overflow: hidden">${escaped(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #111214"><tr><td align="center" style="padding: 32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px">
<tr><td align="center" style="padding: 0 0 28px"><a href="${SITE}"><img src="${SITE}/email/logo.png" width="300" height="88" alt="Minecraft Title Generator" style="display: block; border: 0; width: 300px; max-width: 100%; height: auto"></a></td></tr>
<tr><td style="background: #18191d; border: 1px solid #2b2e35; padding: 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding: 0 0 8px; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6cc04a">${escaped(label)}</td></tr>
<tr><td style="padding: 0 0 ${detail ? 8 : 20}px; font-family: ${FONT}; font-size: 22px; font-weight: 700; line-height: 1.3; color: #f1f2f4">${escaped(subject)}</td></tr>
${detail ? `<tr><td style="padding: 0 0 24px; font-family: ${FONT}; font-size: 15px; line-height: 1.55; color: #b0b4bd">${escaped(detail)}</td></tr>` : ""}
${quote}
<tr><td><a href="${escaped(link)}" style="display: inline-block; padding: 11px 18px; background: #6cc04a; border-top: 2px solid #9be37b; border-bottom: 2px solid #467f2e; font-family: ${FONT}; font-size: 15px; font-weight: 700; line-height: 1.15; color: #0d1a07; text-decoration: none">${escaped(action)}</a></td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding: 24px 8px 0; font-family: ${FONT}; font-size: 12px; line-height: 1.6; color: #7c818c">You are getting this email because ${reason} the <a href="${SITE}" style="color: #b0b4bd">Minecraft Title Generator</a>.<br><a href="${SITE}/privacy/" style="color: #b0b4bd">Privacy Policy</a></td></tr>
</table>
</td></tr></table>
</body></html>`
}

function composed(to, message, { author, body, link, reason }) {
  return {
    from: FROM,
    to,
    subject: message.subject,
    html: page({ ...message, link, reason, quote: body ? quoteHtml(author, body) : "", preview: body || message.detail || message.subject }),
    text: [`${message.subject}.`, message.detail, body, `${message.action}: ${link}`].filter(Boolean).join("\n\n")
  }
}

export function notificationEmail(note) {
  const author = note.author || "Someone"
  const message = MESSAGES[note.kind]({ author, name: note.name, body: note.body })
  return composed(note.email, message, { author, body: note.body, link: linkOf(note), reason: "of a submission on" })
}

export function gitHubEmail(to, event) {
  const body = Array.from(event.body ?? "").slice(0, GITHUB_BODY).join("").trim()
  const message = { ...GITHUB_MESSAGES[event.kind](event.title), detail: body ? null : `By ${event.author}.`, action: "Open it on GitHub" }
  return composed(to, message, { author: event.author, body, link: event.link, reason: "you review" })
}

async function send(env, message) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set")
  const response = await fetch(RESEND, { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(message) })
  if (!response.ok) throw new Error(`Resend refused an email to a notification recipient (${response.status}): ${await response.text()}`)
}

async function sendAll(env, messages) {
  const failures = (await Promise.allSettled(messages.map(message => send(env, message)))).filter(outcome => outcome.status === "rejected")
  if (failures.length) throw new AggregateError(failures.map(outcome => outcome.reason), `${failures.length} emails failed`)
}

export async function emailReviewers(env, event, actorId) {
  const { results } = await env.DB.prepare("SELECT DISTINCT email FROM users WHERE admin = 1 AND email IS NOT NULL AND email NOT IN (SELECT email FROM users WHERE provider = 'github' AND provider_id = ? AND email IS NOT NULL)").bind(String(actorId)).all()
  await sendAll(env, results.map(row => gitHubEmail(row.email, event)))
}

export async function emailNotifications(env) {
  const { results: claimed } = await env.DB.prepare("UPDATE notifications SET emailed = 1 WHERE emailed = 0 RETURNING id").all()
  if (!claimed.length) return
  const { results } = await env.DB.prepare("SELECT users.email, notifications.submission_id AS submissionId, COALESCE(submissions.name, notifications.submission_name) AS name, notifications.kind, notifications.author, notifications.body, notifications.link FROM notifications JOIN users ON users.id = notifications.user_id LEFT JOIN submissions ON submissions.id = notifications.submission_id WHERE users.email IS NOT NULL AND notifications.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(claimed.map(row => row.id))).all()
  const messages = new Map(results.map(note => [JSON.stringify([note.email, note.kind, note.submissionId, note.name, note.body]), notificationEmail(note)]))
  await sendAll(env, Array.from(messages.values()))
}
