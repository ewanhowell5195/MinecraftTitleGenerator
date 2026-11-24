import { SEPARATE_KEYS, overlayFits, separateLayers } from "../settings/layers.js"
import { host } from "./host.js"
import { editingLayer, usedLayers } from "./panel.js"

function fits(layer, item) {
  const data = item.source === "file" ? null : host.active.value.list?.overlays?.[item.overlay]
  return !data || overlayFits(data, layer, usedLayers.value)
}

function setLayer(layer) {
  host.layer.value = layer
}

export function layersPanel(group) {
  const key = SEPARATE_KEYS[group]
  return {
    id: "layers",
    shown: () => usedLayers.value.length > 1,
    modified: () => false,
    controls: [
      {
        type: "toggle",
        key,
        label: "Separate layers",
        hint: "Give each depth of this font its own look",
        write(on, { object, font }) {
          separateLayers(object, group, on, font?.layers?.length ?? 1, fits)
          setLayer(usedLayers.value[0])
        }
      },
      { type: "segments", options: () => usedLayers.value.map(layer => ({ value: layer, label: `Layer ${layer + 1}` })), read: () => editingLayer.value, write: setLayer, shown: get => get(key) }
    ]
  }
}
