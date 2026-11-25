import { ref } from "vue"
import { FRAMINGS, MINECRAFT_MODES, framing, framingModified, outlineModified, paddingScale, resetFraming, resetOutline, setAspect, setResolution, textureSize, textureSizes } from "#render/framing.js"
import { canvasLimit } from "../texture/canvas.js"
import { GRADIENT_MIXES } from "../texture/colourStops.js"
import { host } from "./host.js"
import { useRenderTask } from "./renderTask.js"

const PRESETS = [{ value: 1024, label: "1K" }, { value: 2048, label: "2K" }, { value: 4096, label: "4K" }, { value: 8192, label: "8K" }]

const inMinecraft = () => framing.tab === "minecraft"
const outsideMinecraft = () => !inMinecraft()
const background = get => outsideMinecraft() && get("backgroundEnabled")
const backgroundGradient = get => background(get) && get("backgroundStops").length > 1

function toggleOutline(on) {
  const widths = host.title.objects.filter(object => !object.hidden).map(object => object.wordBorder ?? object.border)
  const counts = Map.groupBy(widths, width => width)
  if (on && widths.length) framing.outlineWidth = Array.from(counts.keys()).reduce((best, width) => counts.get(width).length > counts.get(best).length ? width : best)
  framing.outline = on
}

function presetOptions() {
  return PRESETS.filter(({ value }) => value <= canvasLimit()).map(preset => ({ ...preset, title: `Around ${preset.value} pixels` })).concat([{ value: "custom", label: "Custom" }])
}

function pickResolution(size, { object, state }) {
  state.value = size === "custom"
  object.resolution = state.value ? object.customResolution ?? object.resolution : size
}

function setCustomResolution(value, { object }) {
  object.resolution = value
  object.customResolution = value
}

function side(key, label, write) {
  return { label, max: canvasLimit, read: () => framing[key], write: value => write(key, value) }
}

const FRAME_SIZE = {
  type: "group",
  shown: get => get("tab") === "custom",
  controls: [
    { type: "pair", label: "Size", between: "\u00d7", sides: [side("width", "Width", setResolution), side("height", "Height", setResolution)], link: { title: "Link width and height", read: () => framing.linked, toggle: () => (framing.linked = !framing.linked) } },
    { type: "pair", label: "Aspect ratio", between: ":", sides: [side("aspectWidth", "Aspect width", setAspect), side("aspectHeight", "Aspect height", setAspect)] }
  ]
}

const busy = (get, { state }) => state.progress.value !== null
const layered = () => host.layered?.() ?? true

const RENDER_OUTPUT = {
  type: "group",
  setup: useRenderTask,
  controls: [
    { type: "button", label: "Render image", icon: "camera", primary: true, big: true, press: ({ state }) => state.render(), disabled: busy },
    { type: "button", label: "Save SVG", icon: "download", press: ({ state }) => state.saveVector(), disabled: (get, context) => busy(get, context) || context.state.saving.value, shown: () => outsideMinecraft() && layered() },
    { type: "button", label: "Render layers", icon: "layers", hint: "A zip with each line as its own image", press: ({ state }) => state.downloadLayers(), disabled: busy, shown: layered },
    { type: "hint", text: "SVGs and layers can only be made when nothing but title texts and shapes is shown.", shown: () => !layered() },
    { type: "notice", text: (get, { state }) => state.failed.value, shown: (get, { state }) => !!state.failed.value },
    { type: "block", name: "renderOutput" }
  ]
}

export const FRAMING_PANEL = {
  id: "framing",
  on: "framing",
  title: "Framing",
  modified: framingModified,
  reset: resetFraming,
  controls: [
    { type: "segments", key: "tab", options: FRAMINGS },
    FRAME_SIZE,
    { type: "dropdown", key: "mode", label: "Texture mode", options: MINECRAFT_MODES, shown: inMinecraft },
    { type: "toggle", key: "backgroundEnabled", label: "Background", shown: outsideMinecraft },
    { type: "gradient", key: "backgroundStops", smooth: get => get("backgroundSmooth"), mix: get => get("backgroundMix"), angle: get => get("backgroundAngle"), min: 1, shown: background },
    { type: "toggle", key: "backgroundSmooth", label: "Smooth gradient", shown: backgroundGradient },
    { type: "dropdown", key: "backgroundMix", label: "Mix", options: GRADIENT_MIXES, shown: get => backgroundGradient(get) && get("backgroundSmooth") },
    { type: "slider", key: "backgroundAngle", label: "Angle", min: 0, max: 360, shown: backgroundGradient },
    { type: "slider", key: "padding", label: "Padding", min: 0, max: () => Math.round(256 * paddingScale()), read: get => Math.round(get("padding") * paddingScale()), write: (value, { set }) => set("padding", value / paddingScale()), shown: outsideMinecraft }
  ]
}

export const SECOND_OUTLINE_PANEL = {
  id: "secondOutline",
  on: "framing",
  title: "Outline",
  modified: outlineModified,
  reset: resetOutline,
  controls: [
    { type: "toggle", key: "outline", label: "Second outline", hint: "Goes around the whole title", write: toggleOutline },
    { type: "colour", key: "outlineColour", shown: get => get("outline") },
    { type: "slider", key: "outlineWidth", label: "Outline width", min: 0, max: 8, step: 0.1, shown: get => get("outline") }
  ]
}

export const IMAGE_PANEL = {
  id: "image",
  on: "view",
  title: "Image",
  setup: ({ object }) => ref(object.customResolution === object.resolution || !PRESETS.some(({ value }) => value === object.resolution && value <= canvasLimit())),
  controls: [
    { type: "segments", label: "Texture size", options: () => textureSizes().map(size => ({ value: size, label: String(size), title: `${size} pixel texture` })), read: textureSize, write: size => (framing.textureSize = size), shown: inMinecraft },
    { type: "hint", text: "The title is rendered at the size it takes up in the texture.", shown: inMinecraft },
    { type: "segments", label: "Resolution", options: presetOptions, read: (get, { state }) => state.value ? "custom" : get("resolution"), write: pickResolution, shown: outsideMinecraft },
    { type: "slider", key: "resolution", label: "Size", min: 128, max: canvasLimit, log: true, write: setCustomResolution, shown: (get, { state }) => outsideMinecraft() && state.value },
    { type: "hint", text: "The longer side of the title, in pixels. The final size may differ slightly.", shown: outsideMinecraft },
    { type: "toggle", key: "antialias", label: "Antialiasing", hint: "Smoother edges, renders take longer" },
    RENDER_OUTPUT
  ]
}
