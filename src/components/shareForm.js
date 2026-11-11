import { computed, ref, watch } from "vue"
import { usage } from "../lib/community.js"
import { sharingProblem } from "../lib/sharing.js"

export function useShareForm(code, fallback) {
  const name = ref(fallback())
  const error = ref("")
  const sending = ref(false)
  const agreed = ref(false)
  const target = ref(null)
  const problem = computed(() => code() ? sharingProblem(code(), name.value.trim() || fallback()) : null)
  const full = computed(() => !!usage.value && usage.value.used >= usage.value.limit)
  const blocked = computed(() => sending.value || !!problem.value || !agreed.value || !target.value?.online && full.value)
  const replaceLabel = computed(() => sending.value && target.value?.online ? "Replacing" : "Replace")

  watch(target, next => name.value = next?.name ?? fallback())

  async function attempt(work) {
    sending.value = true
    error.value = ""
    try {
      await work()
    } catch (err) {
      error.value = err.message
    } finally {
      sending.value = false
    }
  }

  return { name, error, sending, agreed, target, problem, blocked, replaceLabel, attempt }
}
