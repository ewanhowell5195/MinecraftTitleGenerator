import { isCustomFont } from "../settings/settings.js"

export const CURVES_PANEL = {
  id: "curves",
  title: "Curved faces",
  shown: (get, { object }) => isCustomFont(object.font) && object.customFont?.kind === "outline",
  controls: [
    { type: "slider", key: "curveAngle", label: "Face angle", min: 0, max: 90, hint: "How steep a curve can get and still count as a top or bottom face." },
    { type: "slider", key: "curveHeight", label: "Face height", min: 0, max: 50, hint: "How far a top or bottom face can reach into the letter, as a percentage of the cap height." },
    { type: "toggle", key: "fadeCurves", label: "Fade curved edges", hint: "Top and bottom faces fade out round curves instead of stopping sharply, into the sides when they are on", shown: get => get("customFont").mesh }
  ]
}

export const CREEPER_PANEL = {
  id: "creeper",
  title: "Creeper face",
  shown: (get, { font }) => !!font?.glyphs["\u{1F633}"],
  controls: [
    { type: "toggle", key: "creeperFace", label: "Creeper face on A", hint: (get, { font }) => `${font.multicase ? "Every capital A" : "Every a"} gets the creeper face. Split a word off to set it for just part of the text` }
  ]
}

export const TERMINATORS_PANEL = {
  id: "terminators",
  title: "Terminators",
  shown: (get, { font }) => font && font.glyphs["┫"] && font.glyphs["┣"] && !font.forcedTerminators,
  controls: [
    { type: "toggle", key: "terminators", label: "Line terminators", hint: "Adds the end pieces either side of the text" }
  ]
}

export const SPACING_PANEL = {
  id: "spacing",
  title: "Spacing",
  controls: [
    { type: "slider", key: "spacing", label: "Character spacing", min: -6, max: 20, step: 0.1 },
    { type: "toggle", key: "kerning", label: "Kerning", shown: (get, { font }) => Object.keys(font?.kerning ?? {}).length > 0 }
  ]
}
