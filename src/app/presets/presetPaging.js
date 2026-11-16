import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { listCommunity } from "../../lib/state/community.js"

const SEARCH_DELAY = 500

export function usePresetPaging({ sort, search, active, loaded }) {
  const results = ref([])
  const more = ref(false)
  const loading = ref(false)
  const error = ref("")
  const sentinel = ref(null)
  let request = 0
  let next = 0
  let searching = null
  let observer = null

  async function load(offset) {
    const current = ++request
    loading.value = true
    error.value = ""
    try {
      const page = await listCommunity({ sort: sort.value, search: search.value, offset })
      if (current !== request) return
      const listed = new Set(offset ? results.value.map(preset => preset.id) : [])
      results.value = (offset ? results.value : []).concat(page.presets.filter(preset => !listed.has(preset.id)))
      more.value = page.more
      next = page.next
      loaded()
    } catch (err) {
      if (current === request) error.value = err.message
    } finally {
      if (current === request) loading.value = false
    }
  }

  function searchNow() {
    clearTimeout(searching)
    load(0)
  }

  watch(search, () => {
    clearTimeout(searching)
    if (!active()) return
    searching = setTimeout(() => load(0), SEARCH_DELAY)
  })

  onMounted(() => {
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && active() && more.value && !loading.value) load(next)
    }, { rootMargin: "300px" })
    observer.observe(sentinel.value)
  })

  watch(more, value => {
    if (value && sentinel.value) {
      observer.unobserve(sentinel.value)
      observer.observe(sentinel.value)
    }
  })

  onBeforeUnmount(() => {
    clearTimeout(searching)
    observer.disconnect()
  })

  return { results, loading, error, sentinel, load, searchNow }
}
