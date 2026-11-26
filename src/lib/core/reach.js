export function reachMessage() {
  return globalThis.navigator?.onLine === false ? "You're offline. Connect to the internet and try again." : "The Minecraft Title Generator can't be reached right now. Try again in a moment."
}

export function unreachable(cause) {
  const error = new Error(reachMessage(), { cause })
  error.unreachable = true
  return error
}

export async function sent(request) {
  try {
    return await request
  } catch (err) {
    if (err.name === "AbortError") throw err
    throw unreachable(err)
  }
}

export async function reachable(request) {
  const response = await sent(request)
  if (response.status >= 500) throw unreachable(new Error(`${response.url} answered ${response.status}`))
  return response
}
