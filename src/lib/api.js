export function jsonOptions(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }
}

export async function apiCall(url, options, unavailable, signedOut) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => null)
  if (response.ok && body) return body
  if (response.status === 401) signedOut()
  const error = new Error(body?.error ?? `${unavailable} (${response.status}).`)
  error.status = response.status
  error.id = body?.id
  throw error
}

export async function fetched(url, what) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${what} could not be loaded (${response.status})`)
  return response
}
