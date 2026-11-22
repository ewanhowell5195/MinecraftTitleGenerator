import { SUBMISSION_KINDS } from "../../lib/submissions/kinds/index.js"
import { GitHubError, base64, github, repository } from "../github.js"
import { Refusal } from "../http.js"
import { SERVER_KINDS } from "./kinds/index.js"

export const BASE = "main"
const UNAVAILABLE = "GitHub isn't taking submissions right now. Try again in a few minutes."
const ANONYMOUS = "Sent from the website."
const SENDER = /^Sent from the website by .*$/m
const UNMERGEABLE = [405, 409, 422]
const WORKFLOW = "submission.yml"
// the commit message .github/workflows/submission.yml makes after converting
const WORKFLOW_COMMIT = "add thumbnails and compress textures"
export const PAGES_SKIP = "[CF-Pages-Skip]"

export async function onGitHub(work, unavailable = UNAVAILABLE) {
  try {
    return await work()
  } catch (err) {
    if (!(err instanceof GitHubError)) throw err
    console.error(err)
    throw new Refusal(502, unavailable)
  }
}

export function branchOf(id) {
  return `submission/${id}`
}

function longestRun(text) {
  return Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length))
}

export function inline(text) {
  const fence = "`".repeat(longestRun(text) + 1)
  return `${fence} ${text} ${fence}`
}

export function block(text) {
  const fence = "`".repeat(Math.max(3, longestRun(text) + 1))
  return `${fence}text\n${text}\n${fence}`
}

function phrase(...parts) {
  return parts.filter(Boolean).join(" ")
}

function pullText(env, origin, row, described, preview, commit) {
  const { noun } = SUBMISSION_KINDS[row.kind]
  const sourced = JSON.parse(row.details)
  const body = [
    `New ${phrase(noun, inline(row.name), described.where)}, credited to ${row.credit.map(inline).join(", ")}.`,
    row.ownerName ? `Sent from the website by ${inline(row.ownerName)} (${row.ownerProvider}).` : ANONYMOUS,
    `**[Preview it on the site](${origin}/submissions/${row.id})**`,
    preview ? `<img src="https://raw.githubusercontent.com/${repository(env)}/${commit}/${preview}" alt="" width="512">` : null,
    row.notes ? `Notes from the submitter:\n\n${block(row.notes)}` : null,
    sourced.source ? `The submitter says this uses someone else's files or artwork, and their licence allows it to be used here. Check both links before merging.\n\n- Source: <${sourced.source}>\n- Licence: <${sourced.licence}>` : null
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

export async function deleteBranch(env, id) {
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

export async function syncSubmission(context, row, fonts, open = null) {
  const { env } = context
  const revision = row.updatedAt
  const claimed = await env.DB.prepare("UPDATE submissions SET updated_at = ? WHERE id = ? AND status = 'open' AND updated_at = ? AND updated_at > 0 RETURNING updated_at AS updatedAt").bind(-(revision + 1), row.id, revision).first()
  if (!claimed) return false
  try {
    await pushSubmission(context, row, fonts, open)
  } catch (err) {
    await env.DB.prepare("UPDATE submissions SET updated_at = ? WHERE id = ? AND updated_at = ?").bind(revision, row.id, claimed.updatedAt).run()
    throw err
  }
  const saved = await env.DB.prepare("UPDATE submissions SET kind = ?, target = ?, asset = ?, name = ?, credit = ?, notes = ?, details = ?, file = ?, pull = ?, updated_at = MAX(?, -updated_at) WHERE id = ? AND status = 'open' AND updated_at = ? RETURNING updated_at AS updatedAt").bind(row.kind, row.target, row.asset, row.name, JSON.stringify(row.credit), row.notes, row.details, row.file, row.pull, Date.now(), row.id, claimed.updatedAt).first()
  if (!saved) return false
  row.updatedAt = saved.updatedAt
  return true
}

async function pushSubmission(context, row, fonts, open) {
  const { env, request } = context
  const type = SERVER_KINDS[row.kind]
  const details = JSON.parse(row.details)
  const base = (await github(env, `git/ref/heads/${BASE}`)).object.sha
  const commit = await github(env, `git/commits/${base}`)
  const written = await type.write({ row, details, fonts, read: reader(env, base), taken: takenIds(row, details, fonts, open ?? await openSubmissions(env)) })
  const tree = await github(env, "git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: written.files.map(({ path, content, sha }) => ({ path, mode: "100644", type: "blob", ...(sha ? { sha } : { content }) })) } })
  const described = type.describe({ row, details, fonts })
  const made = await github(env, "git/commits", { method: "POST", body: { message: `${PAGES_SKIP} add ${phrase(row.name, SUBMISSION_KINDS[row.kind].noun, described.into)}`, tree: tree.sha, parents: [base] } })
  await moveBranch(env, row.id, made.sha)
  row.asset = written.asset
  const text = pullText(env, new URL(request.url).origin, row, described, written.preview, made.sha)
  if (row.pull) await github(env, `pulls/${row.pull}`, { method: "PATCH", body: text })
  else row.pull = (await github(env, "pulls", { method: "POST", body: { ...text, head: branchOf(row.id), base: BASE, maintainer_can_modify: true } })).number
}

export async function uploadFile(env, bytes) {
  return (await github(env, "git/blobs", { method: "POST", body: { content: base64(bytes), encoding: "base64" } })).sha
}

export async function withFiles(env, clean, files) {
  const shas = {}
  for (const [key, value] of Object.entries(files)) shas[key] = typeof value === "string" ? value : await uploadFile(env, value)
  return { ...clean, details: JSON.stringify(Object.keys(shas).length ? { ...clean.details, files: shas } : clean.details) }
}

export function pullLink(env, row) {
  return `https://github.com/${repository(env)}/pull/${row.pull}`
}

export async function closePull(env, pull, comment) {
  if (comment) await github(env, `issues/${pull}/comments`, { method: "POST", body: { body: comment } })
  await github(env, `pulls/${pull}`, { method: "PATCH", body: { state: "closed" } })
}

export async function mergePull(env, pull) {
  try {
    await github(env, `pulls/${pull}/merge`, { method: "PUT", body: { merge_method: "squash", commit_message: "" } })
  } catch (err) {
    if (err instanceof GitHubError && UNMERGEABLE.includes(err.status)) throw new Refusal(409, "GitHub can't merge this yet. Wait for its checks to finish, or open the pull request to see why.")
    throw err
  }
}

export async function anonymisePull(env, number) {
  const pull = await github(env, `pulls/${number}`)
  if (typeof pull.body === "string" && SENDER.test(pull.body)) await github(env, `pulls/${number}`, { method: "PATCH", body: { body: pull.body.replace(SENDER, ANONYMOUS) } })
}

export async function processingOf(env, row) {
  if (row.status !== "open" || !row.pull) return { state: "done" }
  const head = (await github(env, `git/ref/heads/${branchOf(row.id)}`)).object.sha
  if ((await github(env, `git/commits/${head}`)).message.startsWith(WORKFLOW_COMMIT)) return { state: "done" }
  const run = (await github(env, `actions/workflows/${WORKFLOW}/runs?head_sha=${head}&per_page=1`)).workflow_runs[0]
  if (!run || run.status !== "completed") return { state: "processing" }
  return run.conclusion === "success" ? { state: "done" } : { state: "failed", url: run.html_url }
}
