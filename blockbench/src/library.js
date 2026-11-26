import { reactive } from "vue"
import { loadLibrary } from "#lib/link/titleNames.js"

const RETRY = 20000

export const library = reactive({ ready: false, loading: false, error: null, unreachable: false, fonts: [], shapes: [], tileables: {} })

let retrying = null

export function libraryFailed() {
  return !library.ready && !!library.error
}

export async function openLibrary() {
  if (library.ready || library.loading) return
  clearTimeout(retrying)
  library.loading = true
  try {
    const [fonts, tileables, shapes] = await loadLibrary()
    Object.assign(library, { fonts: Object.freeze(fonts), tileables: Object.freeze(tileables), shapes: Object.freeze(shapes), ready: true, error: null })
  } catch (err) {
    console.error(err)
    library.error = err.message
    library.unreachable = !!err.unreachable
    retrying = setTimeout(openLibrary, RETRY)
  } finally {
    library.loading = false
  }
}

export function watchConnection() {
  addEventListener("online", openLibrary)
  openLibrary()
}

export function closeLibrary() {
  removeEventListener("online", openLibrary)
  clearTimeout(retrying)
}
