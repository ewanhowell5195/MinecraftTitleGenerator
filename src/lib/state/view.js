import { reactive, ref, watch } from "vue"
import { readStored } from "./stored.js"

export const SECTIONS = {
  text: { name: "Text", icon: "text" },
  font: { name: "Font", icon: "font" },
  shape: { name: "Shape", icon: "star" },
  placement: { name: "Placement", icon: "rows" },
  texture: { name: "Texture", icon: "texture" },
  colour: { name: "Colour", icon: "palette" },
  overlays: { name: "Overlays", icon: "layers" },
  form: { name: "Form", icon: "cube" },
  transform: { name: "Transform", icon: "move" }
}

export const FORM_SECTIONS = new Set(["form", "transform"])

const DEFAULTS = {
  section: "text",
  shapeTab: "line",
  layer: 0,
  render: false,
  camera: false,
  gizmo: null,
  resolution: 2048,
  customResolution: null,
  antialias: true
}

const TABS = ["section", "shapeTab", "layer", "render", "camera", "gizmo"]

export function resetTabs() {
  for (const key of TABS) view[key] = DEFAULTS[key]
}

export const view = reactive({ ...DEFAULTS, ...Object.fromEntries(Object.entries(readStored("minecraft-title-view") ?? {}).filter(([key]) => key in DEFAULTS)) })

export const viewport = { capture: null }

export const viewportChanges = ref(0)

export const titleLoads = ref(0)

watch(view, value => {
  try {
    localStorage.setItem("minecraft-title-view", JSON.stringify(value))
  } catch {}
}, { deep: true })
