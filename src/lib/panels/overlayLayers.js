import { computed, ref, toRaw, watch } from "vue"
import { filePalette } from "../texture/assets.js"
import { hexOf } from "../core/colour.js"
import { GENERATED_SETTINGS, WRAPPED_KINDS, generatedSetting } from "../texture/overlays/settings.js"
import { titleCase } from "../core/names.js"
import { plainCopy } from "../core/values.js"
import { MAX_ANCHORS, WHITE, definitionPalette, paletteHexes } from "../texture/overlayColours.js"
import { overlayLayer } from "../settings/textureDefaults.js"
import { openedFirst, useOpened } from "./opened.js"

const memories = new WeakMap()
const pendingKind = ref("generated")

function memoryOf(layer) {
  if (!memories.has(layer)) memories.set(layer, { kinds: {}, colours: {} })
  return memories.get(layer)
}

const KINDS = [{ value: "generated", label: "Generated" }, { value: "texture", label: "Texture" }, { value: "file", label: "Custom" }]
export const COLOUR_MODES = [{ value: "original", label: "Original" }, { value: "colours", label: "Colours" }, { value: "tint", label: "Tint" }]
export const COLOUR_HINTS = {
  original: "The image's own colours.",
  colours: `This image has more than ${MAX_ANCHORS} colours, so its colours are mapped onto ${MAX_ANCHORS} and lose some detail.`,
  tint: "One colour blended over the whole image, keeping its detail."
}

export function useOverlayLayers(props, selected, popular) {
  const pending = pendingKind

  const overlays = computed(() => popular(Object.entries(props.available), ([id]) => `${props.statScope ?? props.font?.id}.${id}`, ([id, data]) => data.name ?? titleCase(id)))
  const layer = computed(() => props.layers[selected.value] ?? null)
  const generated = computed(() => layer.value?.source === "premade" ? props.available[layer.value.overlay]?.generated ?? null : null)
  const textured = computed(() => overlays.value.some(ofKind("texture")) || layer.value?.source === "premade" && !generated.value)
  const kinds = computed(() => KINDS.filter(item => (item.value !== "generated" || !props.font?.model) && (item.value !== "texture" || textured.value) && (item.value !== "file" || props.files)))
  const kind = computed(() => !layer.value ? kinds.value.find(item => item.value === pending.value)?.value ?? kinds.value[0].value : layer.value.source === "file" ? "file" : generated.value ? "generated" : "texture")
  const opened = useOpened(() => layer.value?.overlay ?? null, () => [selected.value, kind.value, props.font?.id, props.statScope])
  const shown = computed(() => openedFirst(overlays.value.filter(ofKind(kind.value)), ([id]) => id === opened.value))
  const settings = computed(() => GENERATED_SETTINGS[generated.value] ?? [])
  const shownSettings = computed(() => {
    const values = Object.fromEntries(settings.value.map(item => [item.key, generatedSetting(layer.value, item)]))
    return settings.value.filter(item => !item.shown || item.shown(values))
  })
  const wraps = computed(() => !props.edge && !props.font?.model && !WRAPPED_KINDS.has(generated.value))
  const baseline = computed(() => layer.value ? { ...overlayLayer(layer.value.overlay, layer.value.source === "file" ? null : props.available[layer.value.overlay]), source: layer.value.source, file: layer.value.file } : null)
  const layerModified = computed(() => {
    if (!layer.value) return false
    if (["blend", "opacity"].some(key => layer.value[key] !== baseline.value[key])) return true
    if (JSON.stringify(layer.value.colours ?? null) !== JSON.stringify(baseline.value.colours ?? null)) return true
    if (layer.value.tint !== baseline.value.tint || layer.value.tint && layer.value.tintBlend !== baseline.value.tintBlend) return true
    if (["sideWrap", "edgeWrap"].some(key => !!layer.value[key] !== !!baseline.value[key])) return true
    return settings.value.some(item => item.key !== "seed" && generatedSetting(layer.value, item) !== generatedSetting(baseline.value, item))
  })

  const reusable = computed(() => props.reuse.filter(item => item.value !== layer.value?.file).map(item => ({ ...item, image: item.value })))

  function ofKind(value) {
    return ([, data]) => !!data.generated === (value === "generated")
  }

  function layerName(item) {
    if (item.source === "file") return "Custom"
    return props.available[item.overlay]?.name ?? titleCase(item.overlay ?? "")
  }

  function set(key, value) {
    const target = props.edit()
    const current = target[selected.value]
    if (key in current) current[key] = value
    else swapLayer(target, { ...current, [key]: value })
  }

  function addLayer(item) {
    const target = props.edit()
    target.push(item)
    selected.value = target.length - 1
  }

  function pickFile(file) {
    if (!layer.value) return addLayer({ ...overlayLayer(null), source: "file", file })
    set("file", file)
    set("colours", null)
    set("tint", null)
  }

  const filePalettes = ref({})
  const palette = computed(() => {
    if (!layer.value) return { anchors: [WHITE], complex: false }
    if (layer.value.source === "file") return filePalettes.value[layer.value.file] ?? { anchors: [WHITE], complex: false }
    return { anchors: definitionPalette(props.available[layer.value.overlay]), complex: false }
  })

  watch(() => layer.value?.source === "file" ? layer.value.file : null, async url => {
    if (!url || filePalettes.value[url]) return
    const found = await filePalette(url)
    filePalettes.value = { ...filePalettes.value, [url]: found }
  }, { immediate: true })

  function colourAt(index) {
    return layer.value.colours?.[index] ?? hexOf(palette.value.anchors[index])
  }

  function setColour(index, value) {
    const next = palette.value.anchors.map((_, at) => colourAt(at))
    next[index] = value
    set("colours", next)
  }

  const colourMode = computed(() => !palette.value.complex || layer.value.colours ? "colours" : layer.value.tint ? "tint" : "original")

  function setColourMode(mode) {
    const current = toRaw(props.edit()[selected.value])
    const saved = memoryOf(current).colours
    saved[colourMode.value] = plainCopy({ colours: current.colours ?? null, tint: current.tint ?? null })
    set("colours", structuredClone(saved[mode]?.colours ?? (mode === "colours" ? paletteHexes(palette.value.anchors) : null)))
    set("tint", saved[mode]?.tint ?? (mode === "tint" ? "#ffffff" : null))
  }

  function swapLayer(target, next) {
    const before = toRaw(target[selected.value])
    target.splice(selected.value, 1, next)
    memories.set(toRaw(target[selected.value]), memoryOf(before))
  }

  function replaceLayer(target, next) {
    swapLayer(target, { ...next, hidden: !!target[selected.value].hidden })
  }

  function freshLayer(id, seed) {
    const fresh = overlayLayer(id, props.available[id])
    const setting = GENERATED_SETTINGS[props.available[id].generated]?.find(item => item.key === "seed")
    if (seed !== undefined) fresh.seed = seed
    else if (setting) fresh.seed = Math.floor(Math.random() * (setting.max + 1))
    return fresh
  }

  function pickOverlay(id) {
    if (!layer.value) return addLayer(freshLayer(id))
    if (layer.value.overlay === id) return
    const target = props.edit()
    const before = target[selected.value]
    replaceLayer(target, { ...freshLayer(id, before.seed), source: before.source, file: before.file })
  }

  function pickKind(value) {
    if (value === kind.value) return
    if (!layer.value) {
      pending.value = value
      return
    }
    const target = props.edit()
    const kinds = memoryOf(toRaw(target[selected.value])).kinds
    kinds[kind.value] = plainCopy(target[selected.value])
    if (kinds[value]) return replaceLayer(target, structuredClone(kinds[value]))
    if (value === "file") {
      set("source", "file")
      return
    }
    const matches = ofKind(value)
    const first = overlays.value.find(matches)
    const own = overlays.value.find(entry => entry[0] === layer.value.overlay)
    set("source", "premade")
    if (first && !(own && matches(own))) pickOverlay(first[0])
  }

  function resetLayer() {
    const fresh = structuredClone(toRaw(baseline.value))
    if (layer.value.seed !== undefined) fresh.seed = layer.value.seed
    replaceLayer(props.edit(), fresh)
  }

  function removeLayer(index) {
    const target = props.edit()
    target.splice(index, 1)
    if (index < selected.value) selected.value--
    selected.value = Math.max(0, Math.min(selected.value, target.length - 1))
  }

  function toggleLayer(index) {
    const target = props.edit()
    target[index].hidden = !target[index].hidden
  }

  function duplicateLayer(index) {
    const target = props.edit()
    target.splice(index + 1, 0, plainCopy(target[index]))
    selected.value = index + 1
  }

  function moveLayer(from, to) {
    const target = props.edit()
    target.splice(to, 0, target.splice(from, 1)[0])
    if (selected.value === from) selected.value = to
    else if (from < selected.value && to >= selected.value) selected.value--
    else if (from > selected.value && to <= selected.value) selected.value++
  }

  return { colourAt, colourMode, duplicateLayer, kind, kinds, layer, layerModified, layerName, moveLayer, palette, pickFile, pickKind, pickOverlay, removeLayer, resetLayer, reusable, set, setColour, setColourMode, shown, shownSettings, toggleLayer, wraps }
}
