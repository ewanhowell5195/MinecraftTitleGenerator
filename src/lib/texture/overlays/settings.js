const highlight = { key: "thickness", label: "Highlight thickness", min: 0.25, max: 8, steps: [0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8], fallback: 1 }
const outline = { ...highlight, label: "Outline thickness" }
const fade = { key: "fade", label: "Fade", min: 0, max: 100, fallback: 80 }
const seed = { key: "seed", label: "Seed", min: 0, max: 99, fallback: 0 }
const randomSeed = { ...seed, shown: values => values.randomness > 0 }
const bandOffset = { key: "offset", label: "Offset", min: 0, max: 63, fallback: 0 }
const angle = { key: "angle", label: "Angle", min: 0, max: 180, fallback: 45 }
const WAVE_SHAPES = [{ value: "sine", label: "Sine" }, { value: "square", label: "Square" }, { value: "triangle", label: "Triangle" }]
const wave = [{ key: "waveShape", label: "Shape", options: WAVE_SHAPES, fallback: "sine" }, { key: "pixelation", label: "Pixelation", min: 0, max: 8, fallback: 0 }, { key: "level", label: "Vertical offset", min: 0, max: 100, fallback: 45 }, { key: "amplitude", label: "Wave height", min: 0, max: 24, fallback: 7 }, { key: "length", label: "Wave length", min: 8, max: 160, fallback: 40 }, { key: "offset", label: "Wave offset", min: 0, max: 200, fallback: 0 }, { key: "randomness", label: "Randomness", min: 0, max: 100, fallback: 0 }, randomSeed, { key: "angle", label: "Angle", min: 0, max: 360, fallback: 0 }, { key: "horizontalOffset", label: "Horizontal offset", min: -200, max: 200, fallback: 0 }]
const cracks = [{ key: "amount", label: "Amount", min: 1, max: 100, fallback: 30 }, { key: "length", label: "Length", min: 1, max: 24, fallback: 5 }, { key: "width", label: "Width", min: 1, max: 6, step: 0.25, fallback: 2 }, seed]
const twoTone = [outline, { key: "direction", label: "Direction", min: 0, max: 270, steps: [0, 90, 180, 270], fallback: 0 }]
export const TONES = { two_tone_outline: ["two_tone_outline_light", "two_tone_outline_dark"] }

export const PLACED_KINDS = new Set(["shine", "shine_random", "wave", "cracks"])
export const WRAPPED_KINDS = new Set(["cracks"])
export const SMOOTH_KINDS = new Set(["wave", "cracks", "shadow"])
export const FADE_KINDS = new Set(["outline_fade", "outline_fade_inverted", "edge_outline_fade"])

export const GENERATED_SETTINGS = {
  top: [highlight],
  bottom: [highlight],
  left: [highlight],
  right: [highlight],
  outline: [{ key: "inset", label: "Inset", min: 0, max: 8, fallback: 0 }, outline],
  outline_fade: [outline, { key: "spread", label: "Fade height", min: 10, max: 100, fallback: 60 }],
  outline_fade_inverted: [outline, { key: "spread", label: "Fade height", min: 10, max: 100, fallback: 75 }],
  two_tone_outline: twoTone,
  two_tone_outline_light: twoTone,
  two_tone_outline_dark: twoTone,
  corners: [{ key: "size", label: "Dot size", min: 1, max: 8, fallback: 2 }, { key: "inset", label: "Inset", min: 0, max: 8, fallback: 1 }],
  shine: [{ key: "width", label: "Band width", min: 1, max: 32, fallback: 11 }, { key: "gap", label: "Band gap", min: 1, max: 32, fallback: 12 }, angle, bandOffset, fade],
  shine_random: [{ key: "width", label: "Band width", min: 1, max: 32, fallback: 6 }, { key: "gap", label: "Band gap", min: 1, max: 32, fallback: 11 }, { key: "randomness", label: "Randomness", min: 0, max: 100, fallback: 75 }, randomSeed, angle, bandOffset, fade],
  wave,
  cracks,
  extrusion_outline: [outline],
  edge_outline: [outline],
  edge_outline_open: [outline],
  edge_outline_fade: [outline],
  edge_front: [highlight],
  edge_rounded: [{ key: "radius", label: "Radius", min: 1, max: 8, fallback: 2 }],
  shadow: [{ key: "angle", label: "Angle", min: 0, max: 360, fallback: 45 }, { key: "distance", label: "Distance", min: 0, max: 16, step: 0.5, fallback: 2 }, { key: "blur", label: "Blur", min: 0, max: 8, step: 0.25, fallback: 2 }]
}

export const GENERATED_EDGE_OVERLAYS = {
  edge_outline: { generated: "edge_outline", name: "Outline", default: { blend: "source-over", opacity: 50 } },
  edge_outline_open: { generated: "edge_outline_open", name: "Outline (No Front)", default: { blend: "source-over", opacity: 50 } },
  edge_outline_fade: { generated: "edge_outline_fade", name: "Outline Fade", default: { blend: "source-over", opacity: 50 } },
  edge_front: { generated: "edge_front", name: "Highlight", default: { blend: "source-over", opacity: 50 } },
  edge_rounded: { generated: "edge_rounded", name: "Rounded", default: { colours: ["#000000"], blend: "source-over" } }
}

const GENERATED_OVERLAYS = {
  highlights_top: { generated: "top", name: "Top Highlight", default: { blend: "source-over", opacity: 50 } },
  highlights_bottom: { generated: "bottom", name: "Bottom Highlight", default: { blend: "source-over", opacity: 50 } },
  highlights_left: { generated: "left", name: "Left Highlight", default: { blend: "source-over", opacity: 50 } },
  highlights_right: { generated: "right", name: "Right Highlight", default: { blend: "source-over", opacity: 50 } },
  outline: { generated: "outline", default: { blend: "source-over", opacity: 50 } },
  outline_fade: { generated: "outline_fade", default: { blend: "source-over", opacity: 50 } },
  outline_fade_inverted: { generated: "outline_fade_inverted", name: "Outline Fade (Inverted)", default: { blend: "source-over", opacity: 50 } },
  two_tone_outline: { generated: "two_tone_outline", name: "Two-Tone Outline", palette: ["#ffffff", "#000000"] },
  corner_dots: { generated: "corners" },
  shine: { generated: "shine" },
  shine_random: { generated: "shine_random", name: "Shine (Random)" },
  wave: { generated: "wave", default: { blend: "source-over", sideWrap: true, edgeWrap: true } },
  cracked_edges: { generated: "cracks", default: { colours: ["#000000"], blend: "source-over" } },
  layer_shadow: { generated: "shadow", name: "Shadow", layered: true, default: { colours: ["#000000"], blend: "source-over", opacity: 60 } },
  extrusion_outline: { generated: "extrusion_outline", name: "Extrusion Outline", layered: true }
}

export function withGenerated(overlays) {
  return { ...GENERATED_OVERLAYS, ...overlays }
}

export function thumbnailLayer(layer) {
  return layer.thickness < 1 ? { ...layer, thickness: 1 } : layer
}

export function generatedSetting(layer, item) {
  return layer[item.key] ?? item.fallback
}

export function toneKinds(kind) {
  return TONES[kind] ?? [kind]
}

export function settingsOf(kind, layer) {
  return Object.fromEntries(GENERATED_SETTINGS[kind].map(item => [item.key, generatedSetting(layer, item)]))
}
