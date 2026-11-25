import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue"
import { keyed } from "../core/keyed.js"
import { fullName } from "../font/catalog.js"
import { fontCredit } from "../font/credits.js"
import { fontSample } from "../font/fontSamples.js"
import { googleFontList, googlePreview, googlePreviewFamily } from "../font/googleFonts.js"
import { fontThumbnail } from "../font/thumbnailUrls.js"
import { byUsage, popular } from "../title/popularity.js"
import { googleStatId } from "../title/statIds.js"
import { host } from "./host.js"
import { openedFirst } from "./opened.js"

export const DEFAULT_SAMPLE = "Minecraft"
const PAGE = 40
const SORTS = {
  google: [{ value: "usage", label: "Popular here" }, { value: "google", label: "Popular on Google" }, { value: "trending", label: "Trending" }, { value: "newest", label: "Newest" }, { value: "name", label: "Name" }, { value: "random", label: "Random" }],
  published: [{ value: "usage", label: "Popular" }, { value: "name", label: "Name" }, { value: "random", label: "Random" }]
}

const sampleText = ref("")
const sorting = reactive({ google: "usage", published: "usage" })
const filters = reactive({ categories: [], variable: false })

export function fontBrowserTitle(kind) {
  return kind === "google" ? "Google Fonts" : "All fonts"
}

function styleCount({ styles, weights }) {
  if (weights) return "Variable"
  return styles.length === 1 ? "1 style" : `${styles.length} styles`
}

export function useFontBrowser({ kind, current, search }) {
  const google = kind === "google"
  const opened = current
  const typed = ref(sampleText.value)
  const text = computed(() => sampleText.value.trim() || DEFAULT_SAMPLE)
  const googleFonts = shallowRef([])
  const error = ref("")
  const limit = ref(PAGE)
  const list = ref(null)
  const more = ref(null)
  const samples = keyed()
  const randomOrder = shallowRef(new Map())
  const visible = new Set()
  let typing = null

  const sort = computed({ get: () => sorting[kind], set: value => (sorting[kind] = value) })
  const variable = computed({ get: () => filters.variable, set: value => (filters.variable = value) })
  const chosenCategories = computed(() => filters.categories)
  const entries = computed(() => {
    if (google) return googleFonts.value.map(font => ({ id: font.family, label: font.family, author: font.designers.join(", "), font, stat: googleStatId(font.family), styles: styleCount(font), words: [font.family, font.category].concat(font.designers) }))
    const { fonts } = host.library
    return fonts.map(font => ({ id: font.id, label: fullName(font, fonts), author: fontCredit(font, fonts), font, stat: font.id, words: [font.id, fullName(font, fonts)] }))
  })
  const categories = computed(() => Array.from(new Set(googleFonts.value.map(font => font.category))).sort())
  const filtered = computed(() => google && (filters.categories.length > 0 || filters.variable))
  const found = computed(() => {
    const term = search.value.trim().toLowerCase()
    return entries.value.filter(entry => (!term || entry.words.some(word => word.toLowerCase().includes(term))) && (!google || (!filters.categories.length || filters.categories.includes(entry.font.category)) && (!filters.variable || entry.font.weights)))
  })
  const sorted = computed(() => {
    const items = found.value
    if (sort.value === "random") return items.slice().sort((a, b) => randomOrder.value.get(a.id) - randomOrder.value.get(b.id))
    if (sort.value === "name") return items.slice().sort((a, b) => a.label.localeCompare(b.label))
    if (sort.value === "google") return items.slice().sort((a, b) => a.font.popularity - b.font.popularity)
    if (sort.value === "trending") return items.slice().sort((a, b) => a.font.trending - b.font.trending)
    if (sort.value === "newest") return items.slice().sort((a, b) => b.font.added.localeCompare(a.font.added))
    return google ? byUsage(items, entry => entry.stat) : popular(items, entry => entry.stat, entry => entry.label)
  })
  const ordered = computed(() => openedFirst(sorted.value, entry => entry.id === opened))
  const shown = computed(() => ordered.value.slice(0, limit.value))
  const hasMore = computed(() => shown.value.length < ordered.value.length)
  const loading = computed(() => google && !googleFonts.value.length)
  const count = computed(() => found.value.length === 1 ? "1 font" : `${found.value.length.toLocaleString()} fonts`)
  const byId = computed(() => new Map(entries.value.map(entry => [entry.id, entry])))

  function sampleKey(id) {
    return `${id}\n${text.value}`
  }

  function sampleOf({ id }) {
    return samples[sampleKey(id)]
  }

  function requestSample(entry) {
    const key = sampleKey(entry.id)
    if (key in samples) return
    samples[key] = undefined
    if (google) googlePreview(entry.font, text.value).then(() => (samples[key] = true), () => (samples[key] = false))
    else fontSample(entry.font, host.library.fonts, text.value).then(url => (samples[key] = url), () => (samples[key] = false))
  }

  function toggleCategory(category, on) {
    filters.categories = on ? filters.categories.concat(category) : filters.categories.filter(item => item !== category)
  }

  function clearFilters() {
    filters.categories = []
    filters.variable = false
  }

  const rows = new IntersectionObserver(observed => {
    for (const item of observed) {
      const id = item.target.dataset.id
      if (item.isIntersecting) {
        visible.add(id)
        requestSample(byId.value.get(id))
      } else {
        visible.delete(id)
      }
    }
  }, { rootMargin: "200px 0px" })

  const paging = new IntersectionObserver(observed => {
    if (observed.some(item => item.isIntersecting)) limit.value += PAGE
  }, { rootMargin: "400px 0px" })

  function observe(element) {
    if (element) rows.observe(element)
  }

  watch(typed, value => {
    clearTimeout(typing)
    typing = setTimeout(() => (sampleText.value = value), 250)
  })

  watch(text, () => {
    for (const id of visible) requestSample(byId.value.get(id))
  })

  watch(() => [sort.value, entries.value], ([by]) => {
    if (by === "random") randomOrder.value = new Map(entries.value.map(entry => [entry.id, Math.random()]))
  }, { immediate: true })

  watch(() => [search.value, sort.value, filters.categories, filters.variable], async () => {
    limit.value = PAGE
    await nextTick()
    if (list.value) list.value.scrollTop = 0
  })

  watch(more, (element, before) => {
    if (before) paging.unobserve(before)
    if (element) paging.observe(element)
  })

  if (google) {
    googleFontList().then(fonts => (googleFonts.value = fonts), err => (error.value = `Couldn't load Google Fonts: ${err.message}`))
  }

  onBeforeUnmount(() => {
    clearTimeout(typing)
    rows.disconnect()
    paging.disconnect()
  })

  return {
    categories,
    chosenCategories,
    clearFilters,
    count,
    error,
    filtered,
    google,
    hasMore,
    list,
    loading,
    more,
    observe,
    previewFamily: ({ id }) => googlePreviewFamily(id, text.value),
    sampleOf,
    shown,
    sort,
    sorts: SORTS[kind],
    text,
    thumbnail: ({ font }) => fontThumbnail(font),
    toggleCategory,
    typed,
    variable
  }
}
