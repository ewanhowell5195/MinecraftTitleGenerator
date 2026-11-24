import { ref, watch } from "vue"

export function useOpened(selected, opens) {
  const opened = ref(selected())
  watch(opens, () => (opened.value = selected()))
  return opened
}

export function openedFirst(entries, isOpened) {
  const at = entries.findIndex(isOpened)
  return at > 0 ? [entries[at]].concat(entries.slice(0, at), entries.slice(at + 1)) : entries
}

export const SEARCH_ABOVE = 9
