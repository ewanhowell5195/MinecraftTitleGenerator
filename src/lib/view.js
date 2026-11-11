import { reactive, ref, watch } from "vue"

export const DEFAULT_FOV = 43

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
  render: false,
  gizmo: null,
  fov: DEFAULT_FOV,
  fixedDistance: false,
  resolution: 2048,
  antialias: true
}

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem("minecraft-title-view") ?? "{}")
    return { ...DEFAULTS, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key in DEFAULTS)) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const view = reactive(read())

export const viewport = { capture: null }

export const viewportChanges = ref(0)

watch(view, value => {
  try {
    localStorage.setItem("minecraft-title-view", JSON.stringify(value))
  } catch {}
}, { deep: true })
