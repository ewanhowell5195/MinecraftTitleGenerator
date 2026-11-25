import { apiCall, jsonOptions } from "../core/api.js"
import { refreshAccount } from "./account.js"

const API = "/api/account/connections"

function called(options) {
  return apiCall(API, options, "Blockbench couldn't be connected right now", () => refreshAccount(true))
}

export async function loadConnections() {
  return (await called()).connections
}

export function connectBlockbench(key) {
  return called(jsonOptions("POST", { key }))
}

export function disconnectBlockbench(key) {
  return called(jsonOptions("DELETE", { key }))
}
