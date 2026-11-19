<script>
  const sampleText = ref("")
  const sorting = reactive({ google: "usage", published: "usage" })
  const filters = reactive({ categories: [], variable: false })
</script>

<script setup>
  import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue"
  import { fontCredit } from "../../lib/font/credits.js"
  import { fullName } from "../../lib/font/catalog.js"
  import { fontSample } from "../../lib/font/fontSamples.js"
  import { googleFontList, googlePreview, googlePreviewFamily } from "../../lib/font/googleFonts.js"
  import { library } from "../../lib/state/scene.js"
  import { byUsage, googleStatId, popular } from "../../lib/state/stats.js"
  import { fontThumbnail } from "../../lib/font/thumbnailUrls.js"
  import { openedFirst } from "../../components/composables/opened.js"
  import Button from "../../components/Button.vue"
  import Checkbox from "../../components/Checkbox.vue"
  import Dialog from "../../components/Dialog.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Notice from "../../components/Notice.vue"

  const DEFAULT_SAMPLE = "Minecraft"
  const PAGE = 40
  const TYPING_WAIT = 250
  const SORTS = {
    google: [{ value: "usage", label: "Popular here" }, { value: "google", label: "Popular on Google" }, { value: "trending", label: "Trending" }, { value: "newest", label: "Newest" }, { value: "name", label: "Name" }, { value: "random", label: "Random" }],
    published: [{ value: "usage", label: "Popular" }, { value: "name", label: "Name" }, { value: "random", label: "Random" }]
  }

  const props = defineProps({
    kind: { type: String, required: true },
    current: { type: String, default: null }
  })

  const emit = defineEmits(["pick", "close"])
  const search = defineModel("search", { type: String, default: "" })

  const google = props.kind === "google"
  const opened = props.current
  const typed = ref(sampleText.value)
  const text = computed(() => sampleText.value.trim() || DEFAULT_SAMPLE)
  const googleFonts = ref([])
  const error = ref("")
  const limit = ref(PAGE)
  const list = ref(null)
  const more = ref(null)
  const samples = reactive({})
  const randomOrder = shallowRef(new Map())
  const visible = new Set()
  let typing = null

  const entries = computed(() => {
    if (google) return googleFonts.value.map(font => ({ id: font.family, label: font.family, author: font.designers.join(", "), font, stat: googleStatId(font.family), words: [font.family, font.category].concat(font.designers) }))
    return library.fonts.map(font => ({ id: font.id, label: fullName(font, library.fonts), author: fontCredit(font, library.fonts), font, stat: font.id, words: [font.id, fullName(font, library.fonts)] }))
  })
  const categories = computed(() => Array.from(new Set(googleFonts.value.map(font => font.category))).sort())
  const filtered = computed(() => google && (filters.categories.length > 0 || filters.variable))
  const found = computed(() => {
    const term = search.value.trim().toLowerCase()
    return entries.value.filter(entry => (!term || entry.words.some(word => word.toLowerCase().includes(term))) && (!google || (!filters.categories.length || filters.categories.includes(entry.font.category)) && (!filters.variable || entry.font.weights)))
  })
  const sorted = computed(() => {
    const sort = sorting[props.kind]
    const items = found.value
    if (sort === "random") return items.slice().sort((a, b) => randomOrder.value.get(a.id) - randomOrder.value.get(b.id))
    if (sort === "name") return items.slice().sort((a, b) => a.label.localeCompare(b.label))
    if (sort === "google") return items.slice().sort((a, b) => a.font.popularity - b.font.popularity)
    if (sort === "trending") return items.slice().sort((a, b) => a.font.trending - b.font.trending)
    if (sort === "newest") return items.slice().sort((a, b) => b.font.added.localeCompare(a.font.added))
    return google ? byUsage(items, entry => entry.stat) : popular(items, entry => entry.stat, entry => entry.label)
  })
  const ordered = computed(() => openedFirst(sorted.value, entry => entry.id === opened))
  const shown = computed(() => ordered.value.slice(0, limit.value))
  const byId = computed(() => new Map(entries.value.map(entry => [entry.id, entry])))

  function sampleKey(id) {
    return `${id}\n${text.value}`
  }

  function requestSample(entry) {
    const key = sampleKey(entry.id)
    if (key in samples) return
    samples[key] = undefined
    if (google) googlePreview(entry.font, text.value).then(() => (samples[key] = true), () => (samples[key] = false))
    else fontSample(entry.font, library.fonts, text.value).then(url => (samples[key] = url), () => (samples[key] = false))
  }

  function toggleCategory(category, on) {
    filters.categories = on ? filters.categories.concat(category) : filters.categories.filter(item => item !== category)
  }

  function clearFilters() {
    filters.categories = []
    filters.variable = false
  }

  function pick(entry) {
    emit("pick", entry.font)
    emit("close")
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
    typing = setTimeout(() => (sampleText.value = value), TYPING_WAIT)
  })

  watch(text, () => {
    for (const id of visible) requestSample(byId.value.get(id))
  })

  watch(() => [sorting[props.kind], entries.value], ([sort]) => {
    if (sort === "random") randomOrder.value = new Map(entries.value.map(entry => [entry.id, Math.random()]))
  }, { immediate: true })

  watch(() => [search.value, sorting[props.kind], filters.categories, filters.variable], async () => {
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
</script>

<template>
  <Dialog :title="google ? 'Google Fonts' : 'All fonts'" close-title="Close" large tall dismissable @close="emit('close')">
    <div class="browser">
      <div class="bar">
        <input type="text" v-model="search" :placeholder="google ? 'Search Google Fonts' : 'Search fonts'" aria-label="Search fonts" spellcheck="false">
        <input type="text" v-model="typed" :placeholder="`Preview text: ${DEFAULT_SAMPLE}`" aria-label="Preview text" spellcheck="false">
        <Dropdown class="sort" :options="SORTS[kind]" v-model="sorting[kind]" />
      </div>
      <div class="body">
        <aside v-if="google" class="filters">
          <div class="group">
            <span class="label">Category</span>
            <Checkbox v-for="category of categories" :key="category" :label="category" :model-value="filters.categories.includes(category)" @update:model-value="toggleCategory(category, $event)" />
          </div>
          <div class="group">
            <span class="label">Technology</span>
            <Checkbox label="Variable" v-model="filters.variable" />
          </div>
          <Button v-if="filtered" wide @click="clearFilters">Clear filters</Button>
        </aside>
        <div ref="list" class="list scroll">
          <Notice v-if="error">{{ error }}</Notice>
          <p v-else-if="google && !googleFonts.length" class="hint">Loading fonts...</p>
          <template v-else>
            <p class="hint count">{{ found.length === 1 ? "1 font" : `${found.length.toLocaleString()} fonts` }}</p>
            <button v-for="entry of shown" :key="entry.id" :ref="observe" type="button" class="font" :class="{ selected: entry.id === current }" :data-id="entry.id" @click="pick(entry)">
              <span class="meta">
                <span class="name">{{ entry.label }}</span>
                <span v-if="entry.author" class="hint ellipsis">{{ entry.author }}</span>
                <span v-if="google" class="hint tags">{{ entry.font.weights ? "Variable" : entry.font.styles.length === 1 ? "1 style" : `${entry.font.styles.length} styles` }}</span>
              </span>
              <span v-if="google" class="sample text" :class="{ shown: samples[sampleKey(entry.id)] }" :style="{ fontFamily: googlePreviewFamily(entry.id, text) }">{{ text }}</span>
              <span v-else-if="samples[sampleKey(entry.id)] === null" class="sample hint">This font has none of these characters</span>
              <span v-else class="sample picture"><img :src="samples[sampleKey(entry.id)] || fontThumbnail(entry.font)" alt=""></span>
            </button>
            <div v-if="shown.length < ordered.length" ref="more" class="more"></div>
          </template>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
  .browser {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 180px;
    gap: 10px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 22px;
    flex: none;
    width: 190px;
    padding: 18px 20px;
    overflow-y: auto;
    border-right: 1px solid var(--line);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .list {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 14px 20px 20px;
  }

  .count {
    margin: 0 0 6px;
  }

  .font {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 10px;
    padding: 16px 12px;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    user-select: none;
  }

  .font:hover {
    background: var(--field);
  }

  .font.selected {
    box-shadow: inset 3px 0 0 var(--accent);
    background: var(--field);
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }

  .name {
    flex: none;
    font-size: var(--font-md);
    font-weight: 600;
  }

  .tags {
    flex: none;
    margin-left: auto;
  }

  .sample {
    display: block;
    overflow: hidden;
    white-space: nowrap;
  }

  .sample.text {
    font-size: 44px;
    line-height: 1.25;
    opacity: 0;
    transition: opacity var(--duration);
  }

  .sample.text.shown {
    opacity: 1;
  }

  .sample.picture {
    height: 56px;
  }

  .sample img {
    height: 100%;
    max-width: none;
    image-rendering: pixelated;
  }

  .sample.hint {
    font-size: var(--font-md);
  }

  .more {
    flex: none;
    height: 1px;
  }

  @media (max-width: 800px) {
    .bar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .sort {
      grid-column: 1 / -1;
    }

    .body {
      flex-direction: column;
    }

    .filters {
      flex-direction: row;
      flex-wrap: wrap;
      width: auto;
      max-height: 160px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
  }
</style>
