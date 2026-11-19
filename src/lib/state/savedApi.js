import { apiCall, jsonOptions } from "../submissions/api.js"
import { LIMITS } from "../core/limits.js"
import { refreshAccount } from "./account.js"

const SAVED_API = "/api/saved"

function called(url, options) {
  return apiCall(url, options, "The community presets aren't available right now", () => refreshAccount(true))
}

export async function loadSaved() {
  return (await called(SAVED_API)).presets
}

export async function uploadSaved(presets) {
  const kept = []
  for (let start = 0; start < presets.length; start += LIMITS.savedBatch) {
    const reply = await called(SAVED_API, jsonOptions("POST", { presets: presets.slice(start, start + LIMITS.savedBatch) }))
    kept.push(...reply.kept)
  }
  return kept
}

export function changeSaved(code, changes) {
  return called(SAVED_API, jsonOptions("PATCH", { code, ...changes }))
}

export function deleteSaved(code) {
  return called(SAVED_API, jsonOptions("DELETE", { code }))
}
