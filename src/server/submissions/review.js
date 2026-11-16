import { github } from "../github.js"
import { Refusal, cachedAtEdge, guarded, idParam, jsonBody, reply } from "../http.js"
import { finishClosing, startClosing } from "./closing.js"
import { FRESH_SECONDS, commentText, freshKey, onGitHubText } from "./comments.js"
import { closePull, mergePull, onGitHub, processingOf } from "./pulls.js"
import { MISSING, findSubmission, reopen, reviewerOf } from "./store.js"

const REVIEWED = "This submission has already been reviewed."

export const submissionProcessing = guarded(async context => {
  const row = await findSubmission(context.env, idParam(context.params, MISSING))
  return cachedAtEdge(context, async () => reply(200, await onGitHub(() => processingOf(context.env, row))), { seconds: FRESH_SECONDS, key: freshKey(context.request, row, "processing") })
})

export const reviewState = guarded(async context => {
  const { env } = context
  await reviewerOf(context)
  const row = await findSubmission(env, idParam(context.params, MISSING))
  if (row.status !== "open" || !row.pull) return reply(200, { state: null })
  const pull = await onGitHub(() => github(env, `pulls/${row.pull}`))
  return reply(200, { state: pull.mergeable_state ?? "unknown" })
})

export const reviewSubmission = guarded(async context => {
  const { env, request } = context
  const user = await reviewerOf(context)
  const row = await findSubmission(env, idParam(context.params, MISSING))
  const { action, comment } = await jsonBody(request)
  if (!["merge", "decline"].includes(action)) throw new Refusal(400, "Choose to merge or decline it.")
  if (row.status !== "open" || !row.pull) throw new Refusal(409, REVIEWED)
  const merged = action === "merge"
  const text = merged ? "" : commentText(comment)
  const closing = await startClosing(context, row, merged)
  if (!closing) throw new Refusal(409, REVIEWED)
  try {
    await onGitHub(() => merged ? mergePull(env, row.pull) : closePull(env, row.pull, text && onGitHubText(user.name, { role: "reviewer", body: text })))
  } catch (err) {
    await reopen(env, row.id)
    throw err
  }
  await finishClosing(context, row, closing, { author: user.name, body: text, actor: user })
  return reply(200, { outcome: closing.status })
})
