import { TYPES } from "../settings/defaults.js"
import { transformKeys, isModified, resetTransform } from "../settings/settings.js"
import { hasMarks } from "../font/stretchMarks.js"
import { leadsTo } from "../title/match.js"
import { host } from "./host.js"

const MATCH_MODES = [{ value: true, label: "Bottom edge", title: "The widest point in the bottom of the row" }, { value: false, label: "Widest part", title: "The widest point in the row" }]

const matching = get => get("matchWidth") !== null

function references(object) {
  const own = host.words(object)
  return host.title.objects.filter(other => !own.includes(other) && host.words(other)[0] === other && !own.some(word => leadsTo(other, word, host.title)))
}

function matchOptions(get, { line }) {
  return [{ value: null, label: "None" }].concat(references(line).map(other => ({ value: other.id, label: host.lineText(other) || "(empty)", hint: TYPES[other.type].name, image: host.preview(other) })))
}

function matched(get) {
  const target = host.title.objects.find(other => other.id === get("matchWidth"))
  return target ? host.words(target)[0].id : get("matchWidth")
}

export const MATCH_PANEL = {
  id: "transform",
  title: "Match width to",
  shown: (get, { word, line }) => !word && (references(line).length > 0 || matching(get)),
  modified: (get, { object }) => isModified(object, "transform", {}, transformKeys("match", false)),
  reset: ({ object }) => resetTransform(object, "match"),
  controls: [
    { type: "dropdown", options: matchOptions, read: matched, write: (id, { line }) => host.chooseMatch(line, id) },
    { type: "segments", key: "matchBottom", options: MATCH_MODES, shown: matching },
    { type: "toggle", key: "matchScaleY", label: "Scale Y to match too", shown: matching },
    { type: "hint", text: (get, { object }) => host.title.problems[object.id], shown: (get, { object }) => matching(get) && !!host.title.problems[object.id] },
    { type: "button", label: "Bake match", tooltip: "Stop matching and move its scale and position into the sliders", narrow: true, press: ({ line }) => host.bakeMatch(line), shown: matching }
  ]
}

export const SCALING_PANEL = {
  id: "transform",
  controls: [
    { type: "toggle", key: "scaleMarked", label: "Only stretch the stretchable parts", shown: (get, { font }) => hasMarks(font) },
    { type: "toggle", key: "scaleOutline", label: "Scale the outline too" }
  ]
}
