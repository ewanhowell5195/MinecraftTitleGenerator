import { computed, ref, shallowRef, watch } from "vue"
import { keyed } from "../core/keyed.js"
import { googleFontList, googlePreview, googlePreviewFamily, styleLabel, styleParts } from "../font/googleFonts.js"
import { byUsage } from "../title/popularity.js"
import { googleStatId } from "../title/statIds.js"
import { openedFirst } from "./opened.js"

const PAGE = 60

function useGoogleFonts({ state }) {
  const fonts = shallowRef([])
  const error = ref("")
  const limit = ref(PAGE)
  const weight = ref(400)
  const loaded = keyed()
  const current = computed(() => state.usingCustom.value && state.object.value.customFont.google ? state.object.value.customFont : null)
  const found = computed(() => {
    const term = state.search.value.trim().toLowerCase()
    const ordered = openedFirst(byUsage(fonts.value, font => googleStatId(font.family)), font => font.family === state.opened.value.google)
    if (!term) return ordered
    return ordered.filter(font => [font.family, font.category].concat(font.designers).some(text => text.toLowerCase().includes(term)))
  })
  const shown = computed(() => found.value.slice(0, limit.value))
  const entry = computed(() => current.value && fonts.value.find(font => font.family === current.value.google))
  const styles = computed(() => (entry.value?.styles ?? []).map(style => ({ value: style, label: styleLabel(style) })))
  const italic = computed(() => !!current.value && styleParts(current.value.style).italic)
  const bothSlants = computed(() => ["", "i"].every(end => entry.value?.styles.some(style => style.endsWith("i") === !!end)))

  function restyle(style) {
    if (style !== current.value.style) return state.pickGoogle({ family: current.value.google, style })
  }

  function slant(nextItalic) {
    return restyle(`${weight.value}${nextItalic ? "i" : ""}`)
  }

  function pick(font) {
    if (!state.googleLoading.value && font.family !== current.value?.google) return state.pickGoogle({ family: font.family, style: font.style })
  }

  function preview(font) {
    googlePreview(font).then(() => (loaded[font.family] = true), () => {})
  }

  function more() {
    limit.value += PAGE
  }

  watch(() => current.value?.style, style => {
    if (style) weight.value = styleParts(style).weight
  }, { immediate: true })

  watch(state.search, () => (limit.value = PAGE))

  googleFontList().then(list => (fonts.value = list), err => (error.value = `Couldn't load Google Fonts: ${err.message}`))

  return { bothSlants, current, entry, error, fonts, found, italic, loaded, loading: state.googleLoading, more, pick, preview, restyle, shown, slant, styles, weight }
}

const listed = (get, { state }) => !state.error.value && state.found.value.length > 0
const weighted = (get, { state }) => !!state.entry.value?.weights

function tiles(get, { state }) {
  return state.shown.value.map(font => ({
    key: font.family,
    label: font.family === state.loading.value ? "Loading..." : font.family,
    author: font.designers,
    selected: font.family === state.current.value?.google,
    faded: !!state.loading.value && font.family !== state.loading.value,
    sample: { family: googlePreviewFamily(font.family), shown: !!state.loaded[font.family], seen: () => state.preview(font) },
    pick: () => state.pick(font)
  }))
}

export const GOOGLE_FONTS = {
  type: "group",
  setup: useGoogleFonts,
  controls: [
    { type: "notice", text: (get, { state }) => state.error.value, shown: (get, { state }) => !!state.error.value },
    { type: "hint", text: "Loading fonts...", shown: (get, { state }) => !state.error.value && !state.fonts.value.length },
    { type: "hint", text: "No fonts match", shown: (get, { state }) => !state.error.value && state.fonts.value.length > 0 && !state.found.value.length },
    { type: "tiles", scroll: true, items: tiles, more: (get, { state }) => state.shown.value.length < state.found.value.length ? { key: state.shown.value.length, seen: state.more } : null, shown: listed },
    { type: "slider", label: "Weight", local: true, min: (get, { state }) => state.entry.value.weights[0], max: (get, { state }) => state.entry.value.weights[1], read: (get, { state }) => state.weight.value, write: (value, { state }) => (state.weight.value = value), done: ({ state }) => state.slant(state.italic.value), shown: weighted },
    { type: "toggle", label: "Italic", read: (get, { state }) => state.italic.value, write: (on, { state }) => state.slant(on), shown: (get, context) => weighted(get, context) && context.state.bothSlants.value },
    { type: "dropdown", label: "Style", options: (get, { state }) => state.styles.value, read: (get, { state }) => state.current.value.style, write: (style, { state }) => state.restyle(style), shown: (get, context) => !weighted(get, context) && context.state.styles.value.length > 1 }
  ]
}
