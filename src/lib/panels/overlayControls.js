import { titleCase } from "../core/names.js"
import { credit } from "../font/credits.js"
import { thumbnail, thumbnailHeight } from "../font/thumbnailUrls.js"
import { BLEND_OPTIONS } from "../settings/defaults.js"
import { generatedSetting } from "../texture/overlays/settings.js"
import { COLOUR_HINTS, COLOUR_MODES } from "./overlayLayers.js"
import { reuseRow } from "./uploads.js"

const editing = (get, { state }) => !!state.layer.value
const complex = (get, { state }) => state.palette.value.complex
const inMode = mode => (get, { state }) => state.colourMode.value === mode
const wrapping = (get, context) => editing(get, context) && context.state.wraps.value
const ofFile = (get, { state }) => state.kind.value === "file"

function rows(get, { state }) {
  const { props } = state
  return props.layers.map((item, index) => ({
    key: index,
    label: state.layerName(item),
    image: item.source === "file" ? item.file : thumbnail(props.font, item.overlay, props.shownLayer),
    off: !!item.hidden,
    selected: state.selected.value === index,
    actions: (props.hideable === false ? [] : [{ icon: item.hidden ? "hidden" : "eye", title: item.hidden ? "Show this overlay" : "Hide this overlay", pressed: !!item.hidden, press: () => state.toggleLayer(index) }]).concat([
      { icon: "copy", title: "Duplicate overlay", press: () => state.duplicateLayer(index) },
      { icon: "trash", title: "Remove overlay", press: () => state.removeLayer(index) }
    ])
  }))
}

function tiles(get, { state }) {
  const { font, fonts, shownLayer } = state.props
  return state.shown.value.map(([id, data]) => ({
    key: id,
    label: data.name ?? titleCase(id),
    unit: thumbnailHeight(font),
    image: thumbnail(font, id, shownLayer),
    author: credit(data, font?.id, fonts),
    selected: state.layer.value?.overlay === id,
    download: data.generated ? null : { label: "Download overlay", sheet: { font, kind: "overlays", id } },
    pick: () => state.pickOverlay(id)
  }))
}

function settings(get, { state }) {
  return state.shownSettings.value.map(item => ({
    ...(item.options ? { type: "dropdown", options: item.options } : { type: "slider", min: item.min, max: item.max, step: item.step ?? 1, steps: item.steps ?? null }),
    id: item.key,
    label: item.label,
    read: () => generatedSetting(state.layer.value, item),
    write: value => state.set(item.key, value)
  }))
}

function colours(get, { state }) {
  return state.palette.value.anchors.map((anchor, index) => ({ value: state.colourAt(index), write: value => state.setColour(index, value) }))
}

function layerValue(key, values) {
  return { ...values, id: key, read: (get, { state }) => state.layer.value[key], write: (value, { state }) => state.set(key, value) }
}

export const OVERLAY_CONTROLS = [
  { type: "layerRows", id: "order", items: rows, select: (index, { state }) => (state.selected.value = index), move: (from, to, { state }) => state.moveLayer(from, to), shown: (get, { state }) => state.props.layers.length > 0 },
  { type: "button", icon: "plus", label: "Add overlay", local: true, press: ({ state }) => (state.selected.value = null), shown: editing },
  { type: "heading", text: (get, { state }) => `Editing "${state.layerName(state.layer.value)}"`, modified: (get, { state }) => state.layerModified.value, reset: ({ state }) => state.resetLayer(), shown: editing },
  { type: "segments", options: (get, { state }) => state.kinds.value, read: (get, { state }) => state.kind.value, write: (kind, { state }) => state.pickKind(kind), shown: (get, { state }) => !state.props.edge && state.kinds.value.length > 1 },
  { type: "tiles", scroll: true, short: true, min: (get, { state }) => state.props.tileMin ?? null, items: tiles, shown: (get, context) => !ofFile(get, context) },
  { type: "upload", accept: "image/*", view: (get, { state }) => ({ label: state.layer.value?.file ? "Replace image" : "Choose an image", empty: "No file selected", image: state.layer.value?.file }), pick: (data, { state }) => state.pickFile(data), shown: ofFile },
  reuseRow((value, { state }) => state.pickFile(value), ofFile),
  { type: "group", controls: settings, shown: editing },
  layerValue("blend", { type: "dropdown", label: "Blend mode", options: BLEND_OPTIONS, shown: editing }),
  {
    type: "field",
    label: (get, { state }) => state.palette.value.anchors.length > 1 && !state.palette.value.complex ? "Colours" : "Colour",
    shown: editing,
    controls: [
      { type: "segments", options: COLOUR_MODES, read: (get, { state }) => state.colourMode.value, write: (mode, { state }) => state.setColourMode(mode), shown: complex },
      { type: "hint", text: (get, { state }) => COLOUR_HINTS[state.colourMode.value], shown: complex },
      { type: "colours", id: "colours", items: colours, shown: inMode("colours") },
      {
        type: "row",
        shown: inMode("tint"),
        controls: [
          layerValue("tint", { type: "colour", grow: true }),
          layerValue("tintBlend", { type: "dropdown", options: BLEND_OPTIONS, tooltip: "Tint mode", grow: true })
        ]
      }
    ]
  },
  layerValue("opacity", { type: "slider", label: "Opacity", min: 0, max: 100, shown: editing }),
  layerValue("sideWrap", { type: "toggle", label: "Wrap onto inner and side faces", hint: "Carries the overlay from the letter's edge back along its inner and side faces.", shown: (get, context) => wrapping(get, context) && context.state.props.sideFaces }),
  layerValue("edgeWrap", { type: "toggle", label: "Wrap onto top and bottom faces", hint: "Carries the overlay from the letter's top and bottom edges back along its top and bottom faces.", shown: wrapping })
]
