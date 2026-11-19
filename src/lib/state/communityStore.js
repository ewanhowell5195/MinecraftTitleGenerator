const STORAGE = "minecraft-title-community"

function read() {
  const empty = { pages: {}, votes: {}, downloads: [], own: [], owned: [], tokens: {}, account: null, providers: [], changes: {}, usage: null, pool: null }
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE)) }
  } catch {
    return empty
  }
}

export const store = read()

export function saveStore() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store))
  } catch (err) {
    console.error(err)
  }
}
