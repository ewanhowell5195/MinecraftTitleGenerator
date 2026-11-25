import { computed, ref, watch } from "vue"
import { titleBody } from "../link/linkformat.js"
import { presetStats } from "../state/community.js"
import { askConfirm } from "../state/confirm.js"
import { showNotice } from "../state/notices.js"
import { deleteSharedPreset, presets, removePreset, renamePreset, unsharePreset } from "./savedPresets.js"

export function useMyPresets({ search, active, forgotten }) {
  const selectedCode = ref(null)
  const stats = ref({})
  const removing = ref(null)
  const term = computed(() => search.value.trim().toLowerCase())
  const shown = computed(() => presets.value.filter(preset => preset.name.toLowerCase().includes(term.value)))
  const groups = computed(() => [{ label: "Shared", presets: shown.value.filter(preset => preset.shared) }, { label: "Local", presets: shown.value.filter(preset => !preset.shared) }].filter(group => group.presets.length))
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

  return { selectedCode, stats, removing, term, shown, groups, selected, isSaved, rename, remove, removeShared }
}
