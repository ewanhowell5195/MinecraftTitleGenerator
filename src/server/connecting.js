import { requireUser } from "./accounts.js"
import { addConnection, connectionsOf, removeConnection, validKeyHash } from "./connections.js"
import { INVALID, Refusal, guarded, jsonBody, reply } from "./http.js"

const SIGNED_OUT = "Sign in to connect Blockbench to your account."

async function keyHashIn(request) {
  const { key } = await jsonBody(request)
  if (!validKeyHash(key)) throw new Refusal(400, INVALID)
  return key
}

export const listConnections = guarded(async context => {
  const user = await requireUser(context, SIGNED_OUT)
  return reply(200, { connections: await connectionsOf(context.env, user) })
})

export const connect = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, SIGNED_OUT)
  const key = await keyHashIn(request)
  const [,, added] = await env.DB.batch(addConnection(env, user, key))
  if (!added.results.length) throw new Refusal(409, "This sign-in has already been used. Press Sign in again in Blockbench.")
  return reply(201, { connected: true })
})

export const disconnect = guarded(async context => {
  const { request, env } = context
  const user = await requireUser(context, SIGNED_OUT)
  await removeConnection(env, user, await keyHashIn(request)).run()
  return reply(200, { disconnected: true })
})
