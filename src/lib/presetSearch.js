import { PROVIDERS } from "./providers.js"

const USER_FILTER = /^user:(\S+)$/i

function parseUser(value) {
  const provider = PROVIDERS.find(({ prefix }) => value.toLowerCase().startsWith(`${prefix}:`))
  return provider ? { user: value.slice(provider.prefix.length + 1).toLowerCase(), provider: provider.id } : { user: value.toLowerCase(), provider: null }
}

export function parseSearch(search) {
  const words = search.trim().split(/\s+/).filter(Boolean)
  const filter = words.findLast(word => USER_FILTER.test(word))
  const text = words.filter(word => !USER_FILTER.test(word)).join(" ")
  return filter ? { ...parseUser(filter.match(USER_FILTER)[1]), text } : { user: null, provider: null, text }
}

export function searchWithUser(search, name, provider) {
  const { prefix } = PROVIDERS.find(({ id }) => id === provider)
  return [parseSearch(search).text, `user:${prefix}:${name}`].filter(Boolean).join(" ")
}
