import { TYPES } from "../settings/defaults.js"
import { host } from "./host.js"

const LAYERS = { top: ["top"], bottom: ["bottom", "top"], small: ["top", "small"] }

function tiles(get) {
  return Object.entries(TYPES).map(([id, { name }]) => ({
    key: id,
    label: name,
    layers: LAYERS[id].map(layer => ({ key: layer, image: `placement/${id}-${layer}.png`, dim: layer !== id })),
    aspect: "auto",
    selected: get("type") === id,
    pick: () => host.placeLine(id)
  }))
}

export const PLACEMENT_PANEL = {
  id: "placement",
  title: "Placement",
  reset({ set }) {
    host.placeLine("top")
    set("row", 0)
    set("rowSpacing", 0)
  },
  controls: [
    { type: "tiles", columns: 1, items: tiles },
    { type: "heading", text: "Rows" },
    { type: "hint", text: "Stack more lines of the same placement by giving each its own row." },
    { type: "slider", key: "row", label: "Row", min: get => get("type") === "top" ? -3 : 0, max: 3, typedMin: get => get("type") === "top" ? null : 0, typedMax: null },
    { type: "slider", key: "rowSpacing", label: "Row spacing", min: -4, max: 20, shown: get => get("row") !== 0 }
  ]
}
