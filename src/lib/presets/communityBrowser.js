import { computed, nextTick, ref, watch } from "vue"
import { searchWithUser, searchesUser, toggleUserSearch } from "../link/presetSearch.js"
import { countDownload, randomCommunityPreset } from "../state/community.js"
import { showNotice } from "../state/notices.js"
import { usePresetPaging } from "./presetPaging.js"

export function useCommunityBrowser({ sort, search, active = () => true, start = null, shown = () => {} }) {
  const selected = ref(start)
  const { results, loading, error, sentinel, load, searchNow } = usePresetPaging({ sort, search, active, loaded: refreshSelected })
  const emptyMessage = computed(() => {
    if (search.value.trim()) return "No presets match this search."
    return sort.value === "needs" ? "You have voted on everything that needs votes. Thank you!" : "Nobody has shared a preset yet. Be the first from My presets!"
  })

  function refreshSelected() {
    if (selected.value) selected.value = results.value.find(preset => preset.id === selected.value.id) ?? selected.value
  }

  function clear() {
    selected.value = null
    shown(null)
  }

  function pick(preset) {
    if (selected.value?.id === preset.id) return clear()
    error.value = ""
    selected.value = preset
    shown(preset.id)
  }

  async function pickRandom() {
    try {
      const current = selected.value?.id ?? null
      const preset = await randomCommunityPreset(current)
      if (preset) pick(results.value.find(item => item.id === preset.id) ?? preset)
      else showNotice(current === null ? "Nobody has shared a preset yet." : "There are no other presets to show yet.")
    } catch (err) {
      showNotice(err.message)
    }
  }

  function searched({ author, authorProvider }) {
    return !!author && searchesUser(search.value, author, authorProvider)
  }

  async function searchUser(name, provider, toggling = true) {
    search.value = toggling ? toggleUserSearch(search.value, name, provider) : searchWithUser(search.value, name, provider)
    await nextTick()
    searchNow()
  }

  async function counted(preset) {
    try {
      Object.assign(preset, await countDownload(preset))
    } catch (err) {
      console.error(err)
    }
  }

  watch(sort, () => load(0))

  return { results, loading, error, sentinel, load, selected, emptyMessage, clear, pick, pickRandom, searched, searchUser, counted }
}
