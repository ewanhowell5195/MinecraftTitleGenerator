import { computed } from "vue"
import { isSeparate, layerView } from "../settings/layers.js"
import { isModified, resetPanel, wordKey } from "../settings/settings.js"
import { host } from "./host.js"

const GROUPS = { texture: "texture", tiling: "texture", overlays: "overlays", edgeOverlays: "overlays", colour: "colour", outline: "colour", faces: "colour", inner: "colour", sides: "colour" }

const font = computed(() => host.active.value.font)
const list = computed(() => host.active.value.list)

export const usedLayers = computed(() => host.active.value.built?.layers ?? [0])

export const editingLayer = computed(() => {
  if (usedLayers.value.length < 2) return 0
  return usedLayers.value.includes(host.layer.value) ? host.layer.value : usedLayers.value[0]
})

export function layerShown(group) {
  return computed(() => isSeparate(host.current.value, group) && usedLayers.value.length > 1 ? editingLayer.value : null)
}

export function panelTarget(name, word = false) {
  const base = (word ? host.currentWord : host.current).value
  const group = GROUPS[name]
  const layer = group && isSeparate(base, group) ? editingLayer.value : 0
  return { object: group ? layerView(base, layer, group) : base, font: font.value, list: list.value, layer }
}

export function usePanel(name, word = false) {
  const base = word ? host.currentWord : host.current
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

function settingsTarget(panel) {
  return { object: computed(() => host[panel.on]), font, list, layer: computed(() => 0), modified: computed(() => false), reset: null, k: key => key }
}

export function usePanelState(panel, word = false) {
  const target = panel.on ? settingsTarget(panel) : usePanel(word ? wordKey(panel.id) : panel.id, word)
  const { k } = target
  const context = {
    word,
    get object() {
      return target.object.value
    },
    get font() {
      return target.font.value
    },
    get list() {
      return target.list.value
    },
    get layer() {
      return target.layer.value
    },
    get modified() {
      return target.modified.value
    },
    get line() {
      return host.line.value
    },
    get: key => target.object.value[k(key)],
    set: (key, value) => (target.object.value[k(key)] = value),
    reset: () => target.reset()
  }
  context.state = panel.setup?.(context) ?? null

  function resolved(value) {
    return typeof value === "function" ? value(context.get, context) : value
  }

  function valueOf(control) {
    if (control.read) return control.read(context.get, context)
    return control.fallback ? context.get(control.key) ?? context.object[control.key] : context.get(control.key)
  }

  function change(control, value) {
    if (control.write) control.write(value, context)
    else context.set(control.key, value)
  }

  return {
    context,
    resolved,
    valueOf,
    change,
    isShown: item => !item.shown || !!item.shown(context.get, context),
    title: computed(() => resolved(panel.title) ?? ""),
    shown: computed(() => !panel.shown || !!panel.shown(context.get, context)),
    modified: computed(() => panel.modified ? panel.modified(context.get, context) : context.modified),
    enabled: computed(() => panel.enabled ? context.get(panel.enabled) : null),
    enable: on => context.set(panel.enabled, on),
    reset: () => panel.reset ? panel.reset(context) : context.reset()
  }
}
