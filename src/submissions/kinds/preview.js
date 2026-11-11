import { ref, shallowRef, watch } from "vue"
import { defaultBorder, defaultDepth, defaultSpacing } from "../../lib/settings.js"

export function fontDefaults(font) {
  return { depth: defaultDepth(font), border: defaultBorder("top", font), spacing: defaultSpacing("top", font) }
}

export function useLoaded(inputs, load, empty = null) {
  const value = shallowRef(empty)
  const problem = ref("")
  let asked = 0

  async function run() {
    const token = ++asked
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
  }

  watch(inputs, run, { immediate: true })
  return { value, problem }
}

export function usePreviewLine(inputs, build) {
  const { value: line, problem } = useLoaded(inputs, build)
  return { line, problem }
}
