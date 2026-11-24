const STORE = "saves"

function opened() {
  return new Promise((fulfil, reject) => {
    const request = indexedDB.open("minecraft-title", 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => fulfil(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run(mode, use) {
  const database = await opened()
  try {
    return await new Promise((fulfil, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = use(transaction.objectStore(STORE))
      transaction.oncomplete = () => fulfil(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export function readLarge(key) {
  return run("readonly", store => store.get(key))
}

export function writeLarge(key, value) {
  return run("readwrite", store => store.put(value, key))
}

export function removeLarge(key) {
  return run("readwrite", store => store.delete(key))
}
