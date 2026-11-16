import { clearedSession, forgetSessions, requireUser } from "./accounts.js"
import { Refusal, guarded, jsonBody, reply } from "./http.js"
import { forgetCached, presetsForDeletion } from "./presets.js"
import { releaseSubmissions, unhandledSubmission } from "./submissions/index.js"

const MODES = { anonymise: true, remove: false }

export const deleteAccount = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, "Sign in to delete your account.")
  const { mode } = await jsonBody(request)
  if (!Object.hasOwn(MODES, mode)) throw new Refusal(400, "Choose what happens to your shared presets and submissions.")
  const keep = MODES[mode]
  const submissions = await releaseSubmissions(context, user, keep)
  const { statements, changed } = await presetsForDeletion(env, user, keep)
  const results = await env.DB.batch(statements.concat(submissions.statements, env.DB.prepare("DELETE FROM users WHERE provider = ? AND provider_id = ?").bind(user.provider, user.providerId), await forgetSessions(env, user))).catch(async err => {
    if (await unhandledSubmission(env, user, submissions.handled)) throw new Refusal(409, "A submission was sent from your account while it was being deleted. Try again.")
    throw err
  })
  await forgetCached(request, ...changed(results))
  return reply(200, { deleted: true }, { "Set-Cookie": clearedSession() })
})
