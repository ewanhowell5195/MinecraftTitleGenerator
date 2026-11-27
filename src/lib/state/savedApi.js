import { jsonOptions } from "../core/api.js"
import { LIMITS } from "../core/limits.js"
import { communityCall } from "./account.js"

const SAVED_API = "/api/saved"

export async function loadSaved() {
  return (await communityCall(SAVED_API)).presets
}

export async function uploadSaved(presets) {
  const kept = []
  for (let start = 0; start < presets.length; start += LIMITS.savedBatch) {
    const reply = await communityCall(SAVED_API, jsonOptions("POST", { presets: presets.slice(start, start + LIMITS.savedBatch) }))
    kept.push(...reply.kept)
  }
  return kept
}

export function changeSaved(code, changes) {
  return communityCall(SAVED_API, jsonOptions("PATCH", { code, ...changes }))
}

export function deleteSaved(code) {
  return communityCall(SAVED_API, jsonOptions("DELETE", { code }))
}
