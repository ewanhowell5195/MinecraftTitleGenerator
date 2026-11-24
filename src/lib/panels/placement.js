import { host } from "./host.js"

export const PLACEMENT_PANEL = {
  id: "placement",
  title: "Placement",
  reset({ set }) {
    host.placeLine("top")
    set("row", 0)
    set("rowSpacing", 0)
  },
  controls: [
    { type: "block", name: "placement" },
    { type: "heading", text: "Rows" },
    { type: "hint", text: "Stack more lines of the same placement by giving each its own row." },
    { type: "slider", key: "row", label: "Row", min: get => get("type") === "top" ? -3 : 0, max: 3, typedMin: get => get("type") === "top" ? null : 0, typedMax: null },
    { type: "slider", key: "rowSpacing", label: "Row spacing", min: -4, max: 20, shown: get => get("row") !== 0 }
  ]
}
