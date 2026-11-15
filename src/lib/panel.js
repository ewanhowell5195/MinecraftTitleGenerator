import { computed } from "vue"
import { isModified, isSeparate, layerView, resetPanel, wordKey } from "./settings.js"
import { active, current, currentWord } from "./scene.js"
import { view } from "./view.js"

const font = computed(() => active.value.font)
const list = computed(() => active.value.list)
const GROUPS = { texture: "texture", tiling: "texture", overlays: "overlays", edgeOverlays: "overlays", colour: "colour", outline: "colour", faces: "colour", inner: "colour", sides: "colour" }

export const usedLayers = computed(() => active.value.built?.layers ?? [0])

export const editingLayer = computed(() => {
  if (usedLayers.value.length < 2) return 0
  return usedLayers.value.includes(view.layer) ? view.layer : usedLayers.value[0]
})

export function layerShown(group) {
  return computed(() => isSeparate(current.value, group) && usedLayers.value.length > 1 ? editingLayer.value : null)
}

function context() {
  return { font: font.value, list: list.value }
}

export function usePanel(name, word = false) {
  const base = word ? currentWord : current
  const group = GROUPS[name]
  const layer = computed(() => group && isSeparate(base.value, group) ? editingLayer.value : 0)
  const object = group ? computed(() => layerView(base.value, layer.value, group)) : base
  return {
    object,
    font,
    list,
    layer,
    modified: computed(() => isModified(object.value, name, { ...context(), layer: layer.value })),
    reset: () => resetPanel(object.value, name, { ...context(), layer: layer.value }),
    k: key => word ? wordKey(key) : key
  }
}
