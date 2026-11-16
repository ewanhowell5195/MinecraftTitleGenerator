import { ref, shallowRef, watch } from "vue"
import { defaultBorder, defaultDepth, defaultSpacing, fontFaces } from "../../lib/settings/defaults.js"

export function fontDefaults(font) {
  return { depth: defaultDepth(font), border: defaultBorder("top", font), spacing: defaultSpacing("top", font), ...fontFaces("top", font) }
}

export function useLoaded(inputs, load, empty = null) {
  const value = shallowRef(empty)
  const problem = ref("")
  const pending = ref(false)
  let asked = 0

  async function run() {
    const token = ++asked
    pending.value = true
    try {
      const loaded = await load()
      if (token !== asked) return
      value.value = loaded
      problem.value = ""
    } catch (err) {
      if (token !== asked) return
      value.value = empty
      problem.value = err.message
    }
    pending.value = false
  }

  watch(inputs, run, { immediate: true })
  return { value, problem, pending }
}

export function usePreviewLine(inputs, build) {
  const { value: line, problem, pending } = useLoaded(inputs, build)
  return { line, problem, pending }
}
