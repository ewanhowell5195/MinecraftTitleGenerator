import { computed } from "vue"
import { applyType } from "../../lib/settings/defaults.js"
import { isSeparate, layerView } from "../../lib/settings/layers.js"
import { isModified, resetPanel, wordKey } from "../../lib/settings/settings.js"
import { defaultTexture, setTexture } from "../../lib/settings/textureDefaults.js"
import { active, current, currentWord, freeRow, noteType, selection, words } from "../../lib/state/scene.js"
import { view } from "../../lib/state/view.js"

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

export function panelTarget(name, word = false) {
  const base = (word ? currentWord : current).value
  const group = GROUPS[name]
  const layer = group && isSeparate(base, group) ? editingLayer.value : 0
  return { object: group ? layerView(base, layer, group) : base, font: font.value, list: list.value, layer }
}

export function placeLine(type) {
  if (current.value.type === type) return
  const row = freeRow(type, selection.value[0])
  for (const word of words(selection.value[0])) {
    if (list.value && !word.textureVariant && word.texture === defaultTexture(list.value, word.type)) setTexture(word, { texture: defaultTexture(list.value, type) }, { before: list.value })
    word.type = type
    word.row = row
    applyType(word, type, font.value)
  }
  noteType(selection.value[0])
}

export function usePanel(name, word = false) {
  const base = word ? currentWord : current
  const group = GROUPS[name]
  const layer = computed(() => group && isSeparate(base.value, group) ? editingLayer.value : 0)
  const object = group ? computed(() => layerView(base.value, layer.value, group)) : base
  const options = () => ({ font: font.value, list: list.value, layer: layer.value })
  return {
    object,
    font,
    list,
    layer,
    modified: computed(() => isModified(object.value, name, options())),
    reset: () => resetPanel(object.value, name, options()),
    k: key => word ? wordKey(key) : key
  }
}
