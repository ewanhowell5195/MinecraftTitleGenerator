import { sent, unreachable } from "./reach.js"

let site = ""
let headersOf = () => ({})

export function useApi(address, headers) {
  site = address
  headersOf = headers
}

export function jsonOptions(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }
}

export async function apiCall(url, options, unavailable, signedOut) {
  const response = await sent(fetch(site + url, { ...options, headers: { ...options?.headers, ...headersOf() } }))
  const body = await response.json().catch(() => null)
  if (response.ok && body) return body
  if (response.status === 401) signedOut()
  if (response.status >= 500 && !body?.error) throw unreachable(new Error(`${url} answered ${response.status}`))
  const error = new Error(body?.error ?? `${unavailable} (${response.status}).`)
  error.status = response.status
  error.id = body?.id
  throw error
}

export async function fetched(url, what, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${what} could not be loaded (${response.status})`)
  return response
}
