import { clearedSession, signedInUser } from "./accounts.js"
import { Refusal, guarded, jsonBody, reply } from "./http.js"
import { forgetCached, presetsForDeletion } from "./presets.js"
import { releaseSubmissions } from "./submissions.js"

const MODES = { anonymise: true, remove: false }

export const deleteAccount = guarded(async context => {
  const { request, env } = context
  const user = await signedInUser(context)
  if (!user) throw new Refusal(401, "Sign in to delete your account.")
  const { mode } = await jsonBody(request)
  if (!Object.hasOwn(MODES, mode)) throw new Refusal(400, "Choose what happens to your shared presets and submissions.")
  const keep = MODES[mode]
  const submissions = await releaseSubmissions(context, user, keep)
  const { statements, changed } = await presetsForDeletion(env, user, keep)
  await env.DB.batch(statements.concat(submissions, env.DB.prepare("DELETE FROM users WHERE provider = ? AND provider_id = ?").bind(user.provider, user.providerId)))
  await forgetCached(request, ...changed)
  return reply(200, { deleted: true }, { "Set-Cookie": clearedSession() })
})
