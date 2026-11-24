import { defaultBorder } from "../settings/defaults.js"
import { isModified } from "../settings/settings.js"
import { hasMarks } from "../font/stretchMarks.js"
import { host } from "./host.js"
import { CENTRE_HINT } from "./twists.js"

const ARC_MODES = [{ value: "stretch", label: "Stretch" }, { value: "move", label: "Move" }]

const letters = (get, { font }) => !font?.model
const stretching = get => get("arcMode") === "stretch"
const moving = get => get("arcMode") !== "stretch"

export const GEOMETRY_PANEL = {
  id: "geometry",
  title: (get, { font }) => font?.model ? "Outline" : "Depth and outline",
  modified: (get, { object, font, modified }) => font?.model ? isModified(object, "geometry", { font }, ["border"]) : modified,
  reset(context) {
    if (context.font?.model) context.set("border", defaultBorder(context.object.type, context.font))
    else context.reset()
  },
  controls: [
    { type: "slider", key: "depth", fallback: true, label: "Depth", min: 0, max: 80, shown: letters },
    { type: "slider", key: "border", fallback: true, label: "Outline width", min: 0, max: 8, step: 0.1 },
    { type: "toggle", key: "clipHoles", label: "See through holes", hint: "Cuts away anything behind a gap that is fully closed in", shown: (get, context) => !context.word && letters(get, context) },
    { type: "toggle", key: "layerWords", label: "Layer words separately", hint: "Each word's outline sits on top of the words around it, instead of behind the whole line", shown: (get, { word, object }) => !word && host.words(object).length > 1 }
  ]
}

export const ARC_PANEL = {
  id: "arc",
  title: "Arc",
  controls: [
    { type: "segments", key: "arcMode", options: ARC_MODES },
    { type: "hint", text: "Stretches the outer characters more than the inner ones.", shown: stretching },
    { type: "slider", key: "arcTop", label: "Top", min: -100, max: 100, shown: stretching },
    { type: "slider", key: "arcBottom", label: "Bottom", min: -100, max: 100, shown: stretching },
    { type: "toggle", key: "arcMarked", label: "Only stretch the stretchable parts", shown: (get, { font }) => stretching(get) && !font?.mesh && hasMarks(font) },
    { type: "toggle", key: "arcGradient", label: "Gradient follows the curve", shown: (get, { word, object }) => stretching(get) && !word && object.textureSource === "gradient" },
    { type: "hint", text: "Moves the outer characters more than the inner ones.", shown: moving },
    { type: "slider", key: "arcMove", label: "Curve", min: -100, max: 100, shown: moving },
    { type: "slider", key: "arcCentre", label: "Centre", min: 0, max: 100, hint: CENTRE_HINT, guide: "centre" }
  ]
}
