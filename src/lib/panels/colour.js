import { BLEND_OPTIONS, faceStops } from "../settings/defaults.js"
import { GRADIENT_MIXES } from "../texture/colourStops.js"
import { sameValue } from "../core/values.js"
import { host } from "./host.js"

const FILLS = [{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]
const DIRECTIONS = [{ value: "up", label: "Up the letters" }, { value: "along", label: "Along the text" }]
const END_ANGLES = { up: 180, along: 270 }

export const FILTERS_PANEL = {
  id: "colour",
  title: "Filters",
  controls: [
    { type: "slider", key: "hue", label: "Hue", min: 0, max: 359 },
    { type: "slider", key: "saturation", label: "Saturation", min: 0, max: 200 },
    { type: "slider", key: "brightness", label: "Brightness", min: 0, max: 200 },
    { type: "slider", key: "contrast", label: "Contrast", min: 0, max: 200 },
    { type: "heading", text: "Tint" },
    { type: "row", controls: [
      { type: "colour", key: "colour", grow: true },
      { type: "dropdown", key: "blend", options: BLEND_OPTIONS, grow: true, tooltip: "Blend mode" }
    ] },
    { type: "slider", key: "colourOpacity", label: "Opacity", min: 0, max: 100 }
  ]
}

function facePanel({ id, title, enabled, custom, colour, average, inherits, brightness, fading, fade, opacity, fill, stops, smooth, mix, direction }) {
  const painted = get => get(custom)
  const solid = get => painted(get) && get(fill) === "solid"
  const gradient = get => painted(get) && get(fill) !== "solid"
  const inherited = get => !!inherits && get(inherits) && !get(custom)

  function setCustom(on, { set }) {
    set(custom, on)
    const found = host.active.value.built?.averages[average]
    if (on && found) set(colour, found)
  }

  function setFill(value, { get, set }) {
    set(fill, value)
    if (value === "gradient" && sameValue(get(stops), faceStops())) get(stops)[0].colour = get(colour)
  }

  return {
    id,
    title,
    enabled,
    shown: (get, { font }) => !font?.model,
    controls: [
      { type: "stack", controls: [
        { type: "toggle", key: custom, label: "Custom colour", write: setCustom },
        { type: "segments", key: fill, options: FILLS, write: setFill, shown: painted },
        { type: "colour", key: colour, shown: solid },
        { type: "gradient", key: stops, smooth: get => get(smooth), mix: get => get(mix), angle: get => direction ? END_ANGLES[get(direction)] : END_ANGLES.along, shown: gradient },
        { type: "toggle", key: smooth, label: "Smooth gradient", shown: gradient },
        { type: "dropdown", key: mix, label: "Mix", options: GRADIENT_MIXES, shown: get => gradient(get) && get(smooth) }
      ].concat(direction ? [{ type: "segments", key: direction, label: "Direction", options: DIRECTIONS, shown: gradient }] : []) },
      { type: "hint", text: "Uses the custom colour of the top and bottom faces.", shown: inherited },
      { type: "slider", key: brightness, label: "Brightness", min: 0, max: 100, shown: (get, { object }) => !inherited(get) && !get(custom) && (id !== "faces" || object.textureSource !== "premade") },
      { type: "toggle", key: fading, label: "Fade into the outline" },
      { type: "slider", key: fade, label: "Fade", min: -100, max: 100, step: 5, shown: get => get(fading) },
      { type: "slider", key: opacity, label: "Fade opacity", min: 0, max: 100, step: 5, shown: get => get(fading) }
    ]
  }
}

export const FACE_PANELS = [
  facePanel({ id: "faces", title: "Top and bottom faces", custom: "customEdge", colour: "edgeColour", average: "edge", brightness: "edgeBrightness", fading: "fade", fade: "outerFade", opacity: "outerFadeOpacity", fill: "edgeFill", stops: "edgeStops", smooth: "edgeSmooth", mix: "edgeMix" }),
  facePanel({ id: "inner", title: "Inner faces", enabled: "internalFaces", custom: "customInternal", colour: "internalColour", average: "edge", inherits: "customEdge", brightness: "internalBrightness", fading: "fadeInternal", fade: "internalFade", opacity: "internalFadeOpacity", fill: "internalFill", stops: "internalStops", smooth: "internalSmooth", mix: "internalMix", direction: "internalDirection" }),
  facePanel({ id: "sides", title: "Side faces", enabled: "sideFaces", custom: "customSide", colour: "sideColour", average: "side", brightness: "sideBrightness", fading: "fadeSides", fade: "sideFade", opacity: "sideFadeOpacity", fill: "sideFill", stops: "sideStops", smooth: "sideSmooth", mix: "sideMix", direction: "sideDirection" })
]

export const OUTLINE_PANEL = {
  id: "outline",
  title: "Outline colour",
  controls: [
    { type: "stack", controls: [
      { type: "toggle", key: "customBorder", label: "Custom colour" },
      { type: "colour", key: "borderColour", shown: get => get("customBorder") }
    ] }
  ]
}
