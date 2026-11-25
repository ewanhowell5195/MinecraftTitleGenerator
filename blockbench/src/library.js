import { reactive } from "vue"
import { loadLibrary } from "#lib/link/titleNames.js"

export const library = reactive({ ready: false, error: null, fonts: [], shapes: [], tileables: {} })

export async function openLibrary() {
  library.error = null
  try {
    const [fonts, tileables, shapes] = await loadLibrary()
    Object.assign(library, { fonts: Object.freeze(fonts), tileables: Object.freeze(tileables), shapes: Object.freeze(shapes), ready: true })
  } catch (err) {
    library.error = err.message
    Blockbench.showQuickMessage(`The title generator's fonts couldn't be loaded: ${err.message}`, 4000)
    console.error(err)
  }
}
