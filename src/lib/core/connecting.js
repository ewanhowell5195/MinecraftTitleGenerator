export const KEY_HASH = /^[0-9a-f]{64}$/
export const CONNECT_LIFE = 10 * 60000

export function connectPath(keyHash) {
  return `/connect/?key=${keyHash}&at=${Date.now()}`
}

export function connectCode(keyHash) {
  return `${keyHash.slice(0, 4)}-${keyHash.slice(4, 8)}`.toUpperCase()
}

export function readConnect({ key, at }) {
  const age = Date.now() - Number(at)
  if (!KEY_HASH.test(key ?? "")) return { key: null, expired: false }
  return { key, expired: !(age < CONNECT_LIFE) }
}
