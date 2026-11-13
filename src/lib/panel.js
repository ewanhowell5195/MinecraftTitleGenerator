import { computed } from "vue"
import { isModified, layerView, resetPanel, wordKey } from "./settings.js"
import { active, current, currentWord } from "./scene.js"
import { view } from "./view.js"

const font = computed(() => active.value.font)
const list = computed(() => active.value.list)
const LAYERED = new Set(["texture", "tiling", "overlays", "edgeOverlays", "colour", "faces"])

export const usedLayers = computed(() => active.value.built?.layers ?? [0])

export const editingLayer = computed(() => {
  if (!current.value?.separateLayers || usedLayers.value.length < 2) return 0
  return usedLayers.value.includes(view.layer) ? view.layer : usedLayers.value[0]
})

export const shownLayer = computed(() => current.value?.separateLayers && usedLayers.value.length > 1 ? editingLayer.value : null)

function context() {
  return { font: font.value, list: list.value }
}

export function usePanel(name, word = false) {
  const base = word ? currentWord : current
  const object = LAYERED.has(name) ? computed(() => layerView(base.value, editingLayer.value)) : base
  return {
    object,
    font,
    list,
    modified: computed(() => isModified(object.value, name, context())),
    reset: () => resetPanel(object.value, name, context()),
    k: key => word ? wordKey(key) : key
  }
}
