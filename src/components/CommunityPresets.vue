<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { countDownload, listCommunity, randomCommunityPreset, shuffleCommunity, voteOn } from "../lib/community.js"
  import { LIMITS } from "../lib/limits.js"
  import { addPreset, loadPreset, presets } from "../lib/presets.js"
  import Icon from "./Icon.vue"
  import PresetRating from "./PresetRating.vue"
  import Segments from "./Segments.vue"
  import TitlePicture from "./TitlePicture.vue"

  const SORTS = [{ value: "popular", label: "Popular" }, { value: "top", label: "Top rated" }, { value: "new", label: "Newest" }, { value: "needs", label: "Needs votes" }, { value: "random", label: "Random" }]
  const PERIODS = [{ value: "week", label: "Last 7 days" }, { value: "popular", label: "All time" }]
  const SEARCH_DELAY = 500

  const emit = defineEmits(["close"])

  const sort = ref("popular")
  const period = ref("week")
  const listing = computed(() => sort.value === "popular" ? period.value : sort.value)
  const search = ref("")
  const results = ref([])
  const more = ref(false)
  const loading = ref(false)
  const error = ref("")
  const sentinel = ref(null)
  const saved = computed(() => new Set(presets.value.map(preset => preset.code)))
  const tooShort = computed(() => search.value.trim().length > 0 && Array.from(search.value.trim()).length < LIMITS.searchMinimum)
  const emptyMessage = computed(() => {
    if (search.value.trim()) return "No presets match this search."
    if (listing.value === "week") return "Nothing has been used in the last 7 days."
    return sort.value === "needs" ? "You have voted on everything that needs votes. Thank you!" : "Nobody has shared a preset yet. Be the first from My presets!"
  })
  let request = 0
  let next = 0
  let landing = true
  let searching = null
  let observer = null

  async function load(offset) {
    const current = ++request
    loading.value = true
    error.value = ""
    try {
      const page = await listCommunity({ sort: listing.value, search: tooShort.value ? "" : search.value, offset })
      if (current !== request) return
      const emptyLanding = landing && listing.value === "week" && !page.presets.length && !search.value.trim()
      landing = false
      if (emptyLanding) {
        period.value = "popular"
        return
      }
      results.value = offset ? results.value.concat(page.presets) : page.presets
      more.value = page.more
      next = page.next
    } catch (err) {
      if (current === request) error.value = err.message
    } finally {
      if (current === request) loading.value = false
    }
  }

  async function shuffle() {
    error.value = ""
    try {
      results.value = (await shuffleCommunity()).presets
    } catch (err) {
      error.value = err.message
    }
  }

  function counted(preset) {
    countDownload(preset.id).catch(console.error)
  }

  function open(preset) {
    if (!loadPreset(preset)) return
    counted(preset)
    emit("close")
  }

  async function openRandom() {
    error.value = ""
    try {
      const preset = await randomCommunityPreset()
      if (preset) open(preset)
      else error.value = "Nobody has shared a preset yet."
    } catch (err) {
      error.value = err.message
    }
  }

  function save(preset) {
    addPreset(preset.name, preset.code)
    counted(preset)
  }

  async function vote(preset, value) {
    if (preset.vote === value) return
    error.value = ""
    try {
      Object.assign(preset, await voteOn(preset.id, value))
    } catch (err) {
      error.value = err.message
    }
  }

  watch(listing, () => load(0))
  watch(search, () => {
    clearTimeout(searching)
    if (tooShort.value) return
    searching = setTimeout(() => load(0), SEARCH_DELAY)
  })

  onMounted(() => {
    load(0)
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && more.value && !loading.value) load(next)
    }, { rootMargin: "300px" })
    observer.observe(sentinel.value)
  })

  watch(more, value => {
    if (value && sentinel.value) {
      observer.unobserve(sentinel.value)
      observer.observe(sentinel.value)
    }
  })

  onBeforeUnmount(() => {
    clearTimeout(searching)
    observer.disconnect()
  })
</script>

<template>
  <div class="tools">
    <Segments :options="SORTS" v-model="sort" />
    <Segments v-if="sort === 'popular'" :options="PERIODS" v-model="period" />
    <div class="row">
      <input type="text" v-model="search" placeholder="Search names and text" spellcheck="false">
      <button v-if="sort === 'random'" class="small" @click="shuffle"><Icon name="reset" :size="14" /><span>Shuffle</span></button>
      <button class="small" title="Open a random community preset" @click="openRandom"><Icon name="dice" :size="14" /><span>Random preset</span></button>
    </div>
  </div>
  <div class="list">
    <p v-if="tooShort" class="message">Keep typing to search.</p>
    <p v-else-if="error" class="message error">{{ error }}</p>
    <p v-else-if="!results.length && !loading" class="message">{{ emptyMessage }}</p>
    <div class="presets">
      <div v-for="preset of results" :key="preset.id" class="preset">
        <TitlePicture :code="preset.code" :title="`Open ${preset.name}`" @open="open(preset)" />
        <div class="details">
          <strong :title="preset.name">{{ preset.name }}</strong>
        </div>
        <div class="actions">
          <PresetRating :rating="preset.rating" :votes="preset.votes" :mine="preset.vote" @vote="vote(preset, $event)" />
          <span class="downloads" :title="preset.week ? `Used by ${preset.week} in the last 7 days` : `Used by ${preset.downloads}`"><Icon name="download" :size="14" />{{ preset.week ?? preset.downloads }}</span>
          <button class="icon-button small" :disabled="saved.has(preset.code)" :title="saved.has(preset.code) ? 'Already in My presets' : 'Save to My presets'" @click="save(preset)"><Icon name="bookmark" :size="16" /></button>
        </div>
      </div>
    </div>
    <p v-if="loading" class="message">Loading presets</p>
    <div ref="sentinel" class="sentinel"></div>
  </div>
</template>

<style scoped>
  .tools {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px 0;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .row input {
    flex: 1;
    min-width: 0;
  }

  .row button {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .list {
    flex: 1;
    min-height: 0;
    padding: 16px 20px 20px;
    overflow-y: auto;
  }

  .message {
    margin: 0 0 12px;
    font-size: var(--font-md);
    color: var(--muted);
  }

  .message.error {
    color: var(--danger);
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .preset {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 8px;
    background: var(--card);
  }

  .preset:hover {
    background: var(--card-hover);
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: var(--font-sm);
  }

  .details strong {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .actions {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-sm);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .downloads {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    margin-right: 4px;
  }

  .sentinel {
    height: 1px;
  }

  @media (max-width: 600px) {
    .tools :deep(.segments li) {
      padding-inline: 2px;
      font-size: var(--font-xs);
    }

    .row {
      flex-wrap: wrap;
    }

    .row input[type="text"] {
      flex-basis: 100%;
    }
  }
</style>
