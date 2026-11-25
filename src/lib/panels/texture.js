import { GRADIENT_MIXES } from "../texture/colourStops.js"
import { CUSTOM_TEXTURE } from "./customTexture.js"
import { TEXTURE_PICKER } from "./texturePicker.js"
import { useTextureSource } from "./textureSource.js"

const gradient = get => get("textureSource") === "gradient"

function spread({ object }) {
  const order = object.stops.slice().sort((a, b) => a.position - b.position)
  order.forEach((item, i) => item.position = Math.round(i / (object.smooth ? order.length - 1 : order.length) * 100))
}

export const TEXTURE_PANEL = {
  id: "texture",
  title: "Source",
  subject: "texture",
  setup: useTextureSource,
  reset: ({ state }) => state.resetSource(),
  controls: [
    TEXTURE_PICKER,
    CUSTOM_TEXTURE,
    { type: "gradient", key: "stops", smooth: get => get("smooth"), mix: get => get("mix"), angle: get => get("gradientAngle"), perObject: true, shown: gradient },
    { type: "toggle", key: "smooth", label: "Smooth gradient", shown: gradient },
    { type: "dropdown", key: "mix", label: "Mix", options: GRADIENT_MIXES, shown: get => gradient(get) && get("smooth") },
    { type: "button", label: "Spread evenly", press: spread, shown: gradient },
    { type: "slider", key: "gradientAngle", label: "Angle", min: 0, max: 360, shown: gradient }
  ]
}
