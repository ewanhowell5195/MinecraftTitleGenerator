import { computed, toRaw, watch } from "vue"
import { keyed } from "../core/keyed.js"
import { overlayFits } from "../settings/layers.js"
import { OVERLAY_KINDS, activeOverlays, defaultOverlays } from "../settings/textureDefaults.js"
import { layerShown, usedLayers } from "./panel.js"

const MODES = [{ value: "default", label: "Default" }, { value: "custom", label: "Custom" }]
const remembered = keyed()

function overlaysPanel({ id, title, hint }) {
  const modeKey = OVERLAY_KINDS[id]

  function setup(context) {
    const shownLayer = layerShown("overlays")
    const available = computed(() => Object.fromEntries(Object.entries(context.list?.[id] ?? {}).filter(([, data]) => overlayFits(data, shownLayer.value, usedLayers.value))))
    const defaults = computed(() => defaultOverlays(context.list, context.object, id, context.layer))
    const layers = computed(() => activeOverlays(context.list, context.object, id, context.layer))
    const memoryKey = computed(() => `${context.object.id}:${id}:${context.layer}:${context.object[modeKey]}`)
    const selected = computed({
      get() {
        const value = remembered[memoryKey.value]
        return value === null ? null : Math.max(0, Math.min(value ?? 0, layers.value.length - 1))
      },
      set: value => (remembered[memoryKey.value] = value)
    })

    function edit() {
      const { object } = context
      if (object[modeKey] !== "custom") {
        object[id] = structuredClone(toRaw(defaults.value))
        object[modeKey] = "custom"
      }
      return object[id]
    }

    function pickMode(mode) {
      const { object } = context
      if (mode === "custom" && !object[id].length) object[id] = structuredClone(toRaw(defaults.value))
      object[modeKey] = mode
    }

    watch(() => [context.object.id, context.object.textureSource, context.object.texture, context.object.textureVariant], () => {
      selected.value = 0
    })

    return { available, edit, layers, pickMode, selected, shownLayer }
  }

  return {
    id,
    title,
    setup,
    reset(context) {
      context.reset()
      context.state.selected.value = 0
    },
    controls: [
      { type: "toggle", key: "disableFontOverlay", label: "Hide the font's own overlay", shown: (get, { object, font }) => id === "overlays" && object.textureSource !== "premade" && font?.overlay },
      { type: "segments", key: modeKey, options: MODES, write: (mode, { state }) => state.pickMode(mode) },
      { type: "hint", text: hint, shown: () => !!hint },
      { type: "hint", text: "The overlays this texture comes with. Editing switches to Custom.", shown: get => get(modeKey) === "default" },
      { type: "block", name: "overlays" }
    ]
  }
}

export const OVERLAYS_PANEL = overlaysPanel({ id: "overlays", title: (get, { font }) => font?.model ? "Overlays" : "Face overlays" })
export const EDGE_OVERLAYS_PANEL = { ...overlaysPanel({ id: "edgeOverlays", title: "Edge overlays", hint: "Paints the top and bottom faces around each letter." }), shown: (get, { font }) => !font?.model }
