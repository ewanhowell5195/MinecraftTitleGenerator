import { nextTick, watch } from "vue"
import { communityPreset, refreshAccount } from "../../lib/state/community.js"
import { titleBody } from "../../lib/link/linkformat.js"
import { presets, presetsLoaded, unmarkShared } from "../../lib/state/presets.js"
import { addressHasFilters, openLinkInEditor, presetsPage, showOwnPreset, showPreset } from "../../lib/state/presetsPage.js"
import { openSharedLink } from "../../lib/link/share.js"

const TAB_STORAGE = "minecraft-title-presets-tab"

function storedTab(storage) {
  return storage.getItem(TAB_STORAGE) === "mine" ? "mine" : "community"
}

export function startingTab(landed) {
  if (presetsPage.code !== null) return "mine"
  if (addressHasFilters()) return "community"
  if (!landed) return presetsPage.id === null ? storedTab(localStorage) : "community"
  return performance.getEntriesByType("navigation")[0]?.type === "reload" ? storedTab(sessionStorage) : "community"
}

export function rememberTab(value) {
  localStorage.setItem(TAB_STORAGE, value)
  sessionStorage.setItem(TAB_STORAGE, value)
}

export function usePresetAddress({ tab, results, error, selectedCommunity, selectedLocalCode, selectedLocal, clearSelection }) {
  async function followOwnShared(id) {
    await refreshAccount()
    await presetsLoaded()
    const own = presets.value.find(preset => preset.shared === id)
    if (presetsPage.id !== id) return
    if (own) selectedLocalCode.value = own.code
    else followAddress()
  }

  async function followOwnLink(code) {
    await refreshAccount()
    await presetsLoaded()
    if (presetsPage.code !== code) return
    const own = presets.value.find(preset => titleBody(preset.code) === titleBody(code))
    if (!own) {
      openLinkInEditor(code)
      openSharedLink()
      return
    }
    tab.value = "mine"
    await nextTick()
    selectedLocalCode.value = own.code
  }

  async function followAddress() {
    const { id, code } = presetsPage
    if (code !== null) {
      if (selectedLocal.value?.code !== code) await followOwnLink(code)
      return
    }
    if (id === null) {
      selectedCommunity.value = null
      selectedLocalCode.value = null
      return
    }
    if (selectedLocal.value?.shared === id || selectedCommunity.value?.id === id) return
    tab.value = "community"
    error.value = ""
    try {
      const found = results.value.find(preset => preset.id === id) ?? await communityPreset(id)
      if (presetsPage.id === id) selectedCommunity.value = found
    } catch (err) {
      if (err.status === 404) unmarkShared(id)
      error.value = err.message
      clearSelection()
    }
  }

  watch(selectedLocal, (preset, before) => {
    if (tab.value !== "mine") return
    if (preset?.shared) showPreset(preset.shared)
    else if (preset) showOwnPreset(preset.code)
    else if (before && (presetsPage.id !== null || presetsPage.code !== null)) showPreset(null)
  })
  watch(() => [presetsPage.id, presetsPage.code], followAddress)

  return { followAddress, followOwnShared }
}
