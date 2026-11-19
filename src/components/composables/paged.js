import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"

export function usePaged(items, page, resets) {
  const limit = ref(page)
  const end = ref(null)
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    limit.value += page
    observer.unobserve(entries[0].target)
    nextTick(() => end.value && observer.observe(end.value))
  }, { rootMargin: "400px 0px" })

  watch(end, (element, before) => {
    if (before) observer.unobserve(before)
    if (element) observer.observe(element)
  })
  watch(resets, () => (limit.value = page))
  onBeforeUnmount(() => observer.disconnect())

  return {
    shown: computed(() => items.value.slice(0, limit.value)),
    more: computed(() => limit.value < items.value.length),
    end
  }
}
