import { assetId } from "../../lib/submissions/submissions.js"
import { accountKey } from "../accounts.js"
import { GitHubError, github } from "../github.js"
import { branchOf } from "./pulls.js"

const BRANCH = /^submission\/(\d+)$/
const GONE = [404, 422]

export function wantedAsset({ name, details }) {
  const read = typeof details === "string" ? JSON.parse(details) : details
  return typeof read.id === "string" ? read.id : assetId(name, new Set())
}

export function sameThing(a, b) {
  return a.kind === b.kind && a.target === b.target && wantedAsset(a) === wantedAsset(b)
}

function withdrawnKey(env, user) {
  return accountKey(env, "withdrawn", user)
}

export async function rememberWithdrawn(env, user, row) {
  return env.DB.prepare("INSERT OR REPLACE INTO withdrawn_pulls (account_hash, kind, target, asset, pull, branch, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(await withdrawnKey(env, user), row.kind, row.target, wantedAsset(row), row.pull, branchOf(row.id), Date.now())
}

export async function forgetWithdrawn(env, user) {
  return env.DB.prepare("DELETE FROM withdrawn_pulls WHERE account_hash = ?").bind(await withdrawnKey(env, user))
}

export function forgetWithdrawnPull(env, pull) {
  return env.DB.prepare("DELETE FROM withdrawn_pulls WHERE pull = ?").bind(pull).run()
}

export async function takeWithdrawn(env, user, clean) {
  const found = await env.DB.prepare("DELETE FROM withdrawn_pulls WHERE account_hash = ? AND kind = ? AND target = ? AND asset = ? RETURNING account_hash AS accountHash, kind, target, asset, pull, branch, withdrawn_at AS withdrawnAt").bind(await withdrawnKey(env, user), clean.kind, clean.target, wantedAsset(clean)).first()
  return found && { ...found, id: Number(BRANCH.exec(found.branch)[1]) }
}

export function giveBackWithdrawn(env, taken) {
  return env.DB.prepare("INSERT OR IGNORE INTO withdrawn_pulls (account_hash, kind, target, asset, pull, branch, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(taken.accountHash, taken.kind, taken.target, taken.asset, taken.pull, taken.branch, taken.withdrawnAt).run()
}

export async function reopenPull(env, taken) {
  try {
    const pull = await github(env, `pulls/${taken.pull}`)
    if (pull.merged || pull.state !== "closed") return null
    await github(env, `git/ref/heads/${taken.branch}`)
    await github(env, `pulls/${taken.pull}`, { method: "PATCH", body: { state: "open" } })
  } catch (err) {
    if (err instanceof GitHubError && GONE.includes(err.status)) return null
    throw err
  }
  return taken.pull
}

export function noteResent(env, pull) {
  return github(env, `issues/${pull}/comments`, { method: "POST", body: { body: "Sent again by the person who withdrew it." } })
}
