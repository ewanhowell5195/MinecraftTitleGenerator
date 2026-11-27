import { computed, ref, watch } from "vue"
import { byName } from "../core/names.js"
import { titleBody } from "../link/linkformat.js"
import { presetStats } from "../state/community.js"
import { askConfirm } from "../state/confirm.js"
import { showNotice } from "../state/notices.js"
import { deleteSharedPreset, presets, removePreset, renamePreset, unsharePreset } from "./savedPresets.js"

export const MINE_SORTS = [{ value: "new", label: "Newest" }, { value: "name", label: "Name" }]
export const MINE_FILTERS = [{ value: "all", label: "All" }, { value: "shared", label: "Shared" }, { value: "unshared", label: "Not shared" }]

const sort = ref(MINE_SORTS[0].value)
const filter = ref(MINE_FILTERS[0].value)

export function useMyPresets({ search, active, forgotten }) {
  const selectedCode = ref(null)
  const stats = ref({})
  const removing = ref(null)
  const term = computed(() => search.value.trim().toLowerCase())
  const shown = computed(() => {
    const matched = presets.value.filter(preset => preset.name.toLowerCase().includes(term.value) && (filter.value === "all" || !!preset.shared === (filter.value === "shared")))
    return sort.value === "name" ? matched.sort(byName) : matched.reverse()
  })
  const emptyNote = computed(() => !presets.value.length ? null : term.value ? "None of your presets match this search." : filter.value === "shared" ? "You haven't shared any presets yet." : filter.value === "unshared" ? "All of your presets are shared." : null)
  const selected = computed(() => presets.value.find(preset => preset.code === selectedCode.value) ?? null)
  const saved = computed(() => new Set(presets.value.map(preset => titleBody(preset.code))))
  const sharedIds = computed(() => presets.value.filter(preset => preset.shared).map(preset => preset.shared).join(","))

  async function loadStats() {
    if (!active() || !sharedIds.value) return
    try {
      stats.value = await presetStats(sharedIds.value.split(","))
    } catch (err) {
      console.error(err)
    }
  }

  function isSaved(preset) {
    return saved.value.has(titleBody(preset.code))
  }

  function rename(preset, name) {
    const trimmed = name.trim()
    if (trimmed && trimmed !== preset.name) renamePreset(preset, trimmed)
  }

  async function remove(preset) {
    if (preset.shared) {
      removing.value = preset
      return
    }
    if (!await askConfirm({ title: "Delete preset", message: `Delete the preset ${preset.name}?`, action: "Delete", danger: true })) return
    removePreset(preset)
    selectedCode.value = null
  }

  async function removeShared(choice) {
    const preset = removing.value
    removing.value = null
    try {
      if (choice === "local") removePreset(preset)
      else if (choice === "unshare") await unsharePreset(preset.shared)
      else await deleteSharedPreset(preset.shared)
      if (choice !== "unshare") selectedCode.value = null
      forgotten(preset.shared)
    } catch (err) {
      showNotice(err.message)
    }
  }

  watch([active, sharedIds], loadStats, { immediate: true })

  return { sort, filter, selectedCode, stats, removing, term, shown, emptyNote, selected, isSaved, rename, remove, removeShared }
}
