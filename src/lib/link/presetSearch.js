import { PROVIDERS } from "../core/providers.js"

const USER_FILTER = /^user:(\S+)$/i

function parseUser(value) {
  const provider = PROVIDERS.find(({ prefix }) => value.toLowerCase().startsWith(`${prefix}:`))
  return provider ? { user: value.slice(provider.prefix.length + 1).toLowerCase(), provider: provider.id } : { user: value.toLowerCase(), provider: null }
}

export function parseSearch(search) {
  const words = search.trim().split(/\s+/).filter(Boolean)
  const filter = words.filter(word => USER_FILTER.test(word)).map(word => parseUser(word.match(USER_FILTER)[1])).findLast(({ user }) => user)
  const text = words.filter(word => !USER_FILTER.test(word)).join(" ")
  return { ...(filter ?? { user: null, provider: null }), text }
}

export function searchWithUser(search, name, provider) {
  const { prefix } = PROVIDERS.find(({ id }) => id === provider)
  return [parseSearch(search).text, `user:${prefix}:${name}`].filter(Boolean).join(" ")
}

export function searchesUser(search, name, provider) {
  const parsed = parseSearch(search)
  return parsed.user === name.toLowerCase() && (parsed.provider === null || parsed.provider === provider)
}

export function toggleUserSearch(search, name, provider) {
  return searchesUser(search, name, provider) ? parseSearch(search).text : searchWithUser(search, name, provider)
}
