const listeners = []
let navigator = null

export function setNavigator(next) {
  navigator = next
}

export function navigate(path, { replace = false } = {}) {
  if (!navigator) throw new Error(`nothing is set up to navigate to ${path}`)
  return replace ? navigator.replace(path) : navigator.push(path)
}

export function onNavigated(listener) {
  listeners.push(listener)
}

export function navigated(to, from) {
  for (const listener of listeners) listener(to, from)
}
