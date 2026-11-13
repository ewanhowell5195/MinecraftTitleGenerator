import { computed, shallowRef, toRaw, watch } from "vue"
import { forgetFolder } from "../lib/assets.js"
import { forgetFont } from "../lib/font.js"
import { buildSheet, exportJson, flatTexture } from "../lib/fontEditor.js"
import { defaultBorder, defaultDepth, defaultSpacing } from "../lib/settings.js"
import { forgetFiles, pngUrl, serveFile } from "../lib/virtualFiles.js"

const served = new Map()
let count = 0

function forget(id) {
  const folder = `font/${id}`
  forgetFont(id)
  forgetFolder(folder)
  forgetFiles(folder)
}

function servedFont(slot, font, strip) {
  const key = JSON.stringify(strip)
  const current = served.get(slot)
  if (current && current.font === font && current.key === key) return current.entry
  if (current) forget(current.entry.id)
  const id = `editor-preview-${++count}`
  const folder = `font/${id}`
  const { editor, strips, ...entry } = { ...exportJson(font, ""), id, name: font.name || "My Font" }
  if (strip) entry.strips = [strip]
  serveFile(`${folder}/font.png`, pngUrl(buildSheet(font)))
  serveFile(`${folder}/textures/flat.png`, pngUrl(flatTexture(font)))
  serveFile(`${folder}/textures.json`, { primary: "flat", secondary: "flat", textures: { flat: { border: "#000000" } }, overlays: {} })
  served.set(slot, { font, key, entry })
  return entry
}

export function useServedFont(slot, source) {
  const entry = shallowRef(null)
  let waiting = false

  function show() {
    const next = source()
    const font = next && toRaw(next.font)
    const strip = next?.strip ?? null
    if (!font) {
      entry.value = null
      waiting = false
      return
    }
    const current = served.get(slot)
    if (entry.value && current?.font === font && current.key === JSON.stringify(strip)) {
      waiting = false
      return
    }
    waiting = true
    entry.value = servedFont(slot, font, strip)
  }

  watch(source, () => {
    if (!waiting) show()
  }, { immediate: true })

  return { entry: computed(() => entry.value), settled: show }
}

export function editorLine(entry, text, { terminators = false, stretch = 1, texture = null, variant = null, layer = null, layers = 1 } = {}) {
  const line = { text, font: entry.id, terminators, depth: defaultDepth(entry), border: defaultBorder("top", entry), spacing: defaultSpacing("top", entry) }
  if (stretch !== 1) Object.assign(line, { scaleY: stretch, scaleMarked: true })
  const own = { ...(texture && { texture }), ...(variant && { textureVariant: variant }) }
  if (!layer) Object.assign(line, own)
  if (layer !== null && layers > 1) Object.assign(line, { separateLayers: true, layerSettings: Array.from({ length: layers - 1 }, (_, index) => index + 1 === layer ? own : {}) })
  return line
}
