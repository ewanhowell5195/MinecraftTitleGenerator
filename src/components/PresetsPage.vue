<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue"
  import { account, accountPresets, communityPreset, countDownload, deleteShared, isDeleted, listCommunity, ownPresets, randomCommunityPreset, refreshAccount, refreshUsage, renameShared, signInProviders, voteOn } from "../lib/community.js"
  import { useWindowEvents } from "../lib/events.js"
  import { LIMITS } from "../lib/limits.js"
  import { notice } from "../lib/notices.js"
  import { addPreset, loadPreset, presets, presetsError, presetsLoading, removePreset, renamePreset, unmarkShared } from "../lib/presets.js"
  import { closePresetsPage, leavePresetsForEditor, presetsPage, showPreset } from "../lib/presetsPage.js"
  import { providerLabel } from "../lib/providers.js"
  import AccountMenu from "./AccountMenu.vue"
  import Dropdown from "./Dropdown.vue"
  import Icon from "./Icon.vue"
  import PresetDetail from "./PresetDetail.vue"
  import Segments from "./Segments.vue"
  import SharePresetDialog from "./SharePresetDialog.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"
  import TitlePicture from "./TitlePicture.vue"

  const TABS = [{ value: "community", label: "Community" }, { value: "mine", label: "My presets" }]
  const SORTS = [{ value: "week", label: "Popular this week" }, { value: "popular", label: "Popular all time" }, { value: "top", label: "Top rated" }, { value: "new", label: "Newest" }, { value: "needs", label: "Needs votes" }]
  const SEARCH_DELAY = 500
  const EDITOR_TITLE = "Minecraft Title Generator"

  const tab = ref(presetsPage.fromEditor && presetsPage.id === null && presets.value.length ? "mine" : "community")
  const sort = ref("week")
  const search = ref("")
  const results = ref([])
  const more = ref(false)
  const loading = ref(false)
  const error = ref("")
  const root = ref(null)
  const sentinel = ref(null)
  const sharing = ref(null)
  const selectedCommunity = ref(null)
  const selectedLocalCode = ref(null)

  const term = computed(() => search.value.trim())
  const tooShort = computed(() => tab.value === "community" && term.value.length > 0 && Array.from(term.value).length < LIMITS.searchMinimum)
  const saved = computed(() => new Set(presets.value.map(preset => preset.code)))
  const sharedByMe = computed(() => new Set(presets.value.map(preset => preset.shared)))
  const localShown = computed(() => presets.value.filter(preset => preset.name.toLowerCase().includes(term.value.toLowerCase())))
  const selectedLocal = computed(() => presets.value.find(preset => preset.code === selectedLocalCode.value) ?? null)
  const selected = computed(() => tab.value === "mine" ? selectedLocal.value : selectedCommunity.value)
  const emptyMessage = computed(() => {
    if (tab.value === "mine") return term.value ? "None of your presets match this search." : "You have no presets yet. Use File > Save preset to save the current title here."
    if (term.value) return "No presets match this search."
    return sort.value === "needs" ? "You have voted on everything that needs votes. Thank you!" : "Nobody has shared a preset yet. Be the first from My presets!"
  })
  let request = 0
  let next = 0
  let searching = null
  let observer = null

  function isMine(preset) {
    return ownPresets.value.includes(preset.id) || sharedByMe.value.has(preset.id)
  }

  async function load(offset) {
    const current = ++request
    loading.value = true
    error.value = ""
    try {
      const page = await listCommunity({ sort: sort.value, search: tooShort.value ? "" : search.value, offset })
      if (current !== request) return
      results.value = offset ? results.value.concat(page.presets) : page.presets
      more.value = page.more
      next = page.next
      if (selectedCommunity.value) selectedCommunity.value = results.value.find(preset => preset.id === selectedCommunity.value.id) ?? selectedCommunity.value
    } catch (err) {
      if (current === request) error.value = err.message
    } finally {
      if (current === request) loading.value = false
    }
  }

  function selectCommunity(preset) {
    error.value = ""
    selectedCommunity.value = preset
    showPreset(preset.id)
  }

  function clearSelection() {
    selectedCommunity.value = null
    selectedLocalCode.value = null
    if (presetsPage.id !== null) showPreset(null)
  }

  async function followAddress() {
    const { id } = presetsPage
    if (id === null) {
      selectedCommunity.value = null
      return
    }
    if (selectedCommunity.value?.id === id) return
    tab.value = "community"
    error.value = ""
    try {
      const found = results.value.find(preset => preset.id === id) ?? await communityPreset(id)
      if (presetsPage.id === id) selectedCommunity.value = found
    } catch (err) {
      if (err.status === 404) unmarkShared(id)
      error.value = err.message
      clearSelection()
    }
  }

  async function counted(preset) {
    try {
      Object.assign(preset, await countDownload(preset))
    } catch (err) {
      console.error(err)
    }
  }

  function open(preset) {
    if (!loadPreset(preset)) return
    if (tab.value === "community") counted(preset)
    leavePresetsForEditor()
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

  async function openRandom() {
    error.value = ""
    try {
      const current = selectedCommunity.value?.id ?? null
      const preset = await randomCommunityPreset(current)
      if (preset) selectCommunity(results.value.find(item => item.id === preset.id) ?? preset)
      else error.value = current === null ? "Nobody has shared a preset yet." : "There are no other presets to show yet."
    } catch (err) {
      error.value = err.message
    }
  }

  function remove(preset) {
    if (!confirm(`Delete the preset ${preset.name}?`)) return
    removePreset(preset)
    selectedLocalCode.value = null
  }

  async function renameCommunity(preset, name) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === preset.name) return
    error.value = ""
    try {
      preset.name = await renameShared(preset.id, trimmed)
    } catch (err) {
      error.value = err.message
    }
  }

  async function removeCommunity(preset) {
    if (!confirm(`Delete ${preset.name} from the community presets? This can't be undone.`)) return
    error.value = ""
    try {
      await deleteShared(preset.id)
      unmarkShared(preset.id)
      results.value = results.value.filter(item => item.id !== preset.id)
      clearSelection()
    } catch (err) {
      error.value = err.message
    }
  }

  function viewInCommunity(id) {
    selectedLocalCode.value = null
    tab.value = "community"
    showPreset(id)
  }

  function shared(preset) {
    sharing.value = null
    selectedLocalCode.value = null
    tab.value = "community"
    sort.value = "new"
    selectCommunity({ ...preset, vote: 0, own: true })
  }

  function key(event) {
    if (event.key !== "Escape" || event.defaultPrevented || sharing.value) return
    if (selected.value) clearSelection()
    else closePresetsPage()
  }

  useWindowEvents(() => true, { keydown: key })

  watch(tab, value => {
    search.value = ""
    selectedLocalCode.value = null
    if (value === "community") load(0)
    else {
      selectedCommunity.value = null
      if (presetsPage.id !== null) showPreset(null)
    }
  })
  watch(sort, () => load(0))
  watch(() => account.value?.id, () => {
    if (selectedCommunity.value && isDeleted(selectedCommunity.value.id)) clearSelection()
    if (tab.value === "community") load(0)
  })
  watch(search, () => {
    clearTimeout(searching)
    if (tab.value !== "community" || tooShort.value) return
    searching = setTimeout(() => load(0), SEARCH_DELAY)
  })
  watch(() => presetsPage.id, followAddress)
  watchEffect(() => {
    const name = tab.value === "community" ? selectedCommunity.value?.name : null
    document.title = `${name ?? "Presets"} | ${EDITOR_TITLE}`
  })
  watch(selected, async () => {
    await nextTick()
    root.value?.querySelector(".card.selected")?.scrollIntoView({ block: "nearest" })
  })

  onMounted(() => {
    refreshUsage()
    refreshAccount()
    if (tab.value === "community") load(0)
    followAddress()
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && tab.value === "community" && more.value && !loading.value) load(next)
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
    document.title = EDITOR_TITLE
    clearTimeout(searching)
    observer.disconnect()
  })
</script>

<template>
  <div ref="root" class="page">
    <header class="top">
      <button class="back" @click="closePresetsPage()"><Icon name="back" :size="18" /><span>Back to editor</span></button>
      <h1>Presets</h1>
      <SubmissionUsage v-if="tab === 'mine'" class="usage" />
      <Segments class="tabs" :options="TABS" v-model="tab" />
      <AccountMenu />
    </header>
    <div class="body">
      <main class="browse">
        <div class="tools">
          <input class="search" type="text" v-model="search" :placeholder="tab === 'community' ? 'Search names and text' : 'Search your presets'" aria-label="Search presets" spellcheck="false">
          <template v-if="tab === 'community'">
            <Dropdown class="sort" :options="SORTS" v-model="sort" />
            <button class="random" title="Show a random community preset" @click="openRandom"><Icon name="dice" :size="16" /><span>Random</span></button>
          </template>
        </div>
        <div class="list">
          <p v-if="tooShort" class="message">Keep typing to search.</p>
          <p v-else-if="error" class="message error">{{ error }}</p>
          <p v-else-if="tab === 'mine' && presetsError" class="message error">{{ presetsError }}</p>
          <p v-else-if="tab === 'mine' && presetsLoading" class="message">Loading your presets</p>
          <p v-else-if="tab === 'community' ? !results.length && !loading : !localShown.length" class="message">{{ emptyMessage }}</p>
          <p v-if="tab === 'mine' && !account && signInProviders.length" class="message">Sign in to keep your presets on your account. The presets saved in this browser move to it when you do.</p>
          <div v-if="tab === 'community'" class="grid">
            <div v-for="preset of results" :key="preset.id" class="card" :class="{ selected: selected?.id === preset.id }" @click="selectCommunity(preset)">
              <TitlePicture :code="preset.code" :title="preset.name" @open="selectCommunity(preset)" />
              <div class="details">
                <strong :title="preset.name">{{ preset.name }}</strong>
                <span v-if="isMine(preset)" class="yours">Shared by you</span>
                <span v-else-if="preset.author" class="author" :title="providerLabel(preset.authorProvider)"><Icon :name="preset.authorProvider" :size="13" /><span>{{ preset.author }}</span></span>
              </div>
            </div>
          </div>
          <div v-else class="grid">
            <div v-for="preset of localShown" :key="preset.code" class="card" :class="{ selected: selectedLocalCode === preset.code }" @click="selectedLocalCode = preset.code">
              <TitlePicture :code="preset.code" :title="preset.name" @open="selectedLocalCode = preset.code" />
              <strong :title="preset.name">{{ preset.name }}</strong>
            </div>
          </div>
          <p v-if="tab === 'community' && loading" class="message loading">Loading presets</p>
          <div ref="sentinel" class="sentinel"></div>
        </div>
      </main>
      <PresetDetail v-if="selected && tab === 'community'" class="side" :preset="selected" :mine="isMine(selected)" :owned="accountPresets.includes(selected.id)" :saved="saved.has(selected.code)" @close="clearSelection" @open="open(selected)" @save="save(selected)" @vote="vote(selected, $event)" @rename="renameCommunity(selected, $event)" @remove="removeCommunity(selected)" />
      <PresetDetail v-else-if="selected" class="side" :preset="selected" local @close="clearSelection" @open="open(selected)" @rename="renamePreset(selected, $event)" @remove="remove(selected)" @share="sharing = selected" @view="viewInCommunity(selected.shared)" />
      <aside v-else class="placeholder"><p v-if="tab === 'community' ? results.length : localShown.length">Select a preset to see it here</p></aside>
    </div>
    <SharePresetDialog v-if="sharing" :preset="sharing" @close="sharing = null" @shared="shared" />
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
  .page {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .top {
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 60px;
    padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  .back {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  h1 {
    margin: 0;
    font-size: var(--font-xl);
    font-weight: 600;
  }

  .tabs {
    width: 280px;
    margin-left: auto;
  }

  .body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) min(50%, 1024px);
    min-height: 0;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    font-size: var(--font-base);
    color: var(--faint);
    text-align: center;
    background: var(--surface);
    border-left: 1px solid var(--line);
  }

  .placeholder p {
    margin: 0;
  }

  .browse {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px 0;
  }

  .search,
  .sort,
  .random {
    height: 40px;
  }

  .search {
    flex: 1;
    min-width: 0;
  }

  .sort {
    flex: none;
    width: 200px;
  }

  .sort :deep(.trigger) {
    height: 100%;
  }

  .random {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .usage {
    flex: none;
    padding-left: 16px;
    border-left: 1px solid var(--line);
  }

  .list {
    flex: 1;
    min-height: 0;
    padding: 16px 20px 24px;
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

  .message.loading {
    margin: 12px 0 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, clamp(320px, 21vw, 420px)), 1fr));
    gap: 12px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 8px;
    font-size: var(--font-sm);
    background: var(--card);
    cursor: pointer;
    user-select: none;
  }

  .card:hover {
    background: var(--card-hover);
  }

  .card.selected {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--card-hover);
  }

  .details {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .yours {
    flex: none;
    color: var(--accent);
  }

  .author {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 50%;
    color: var(--muted);
  }

  .author span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .card strong {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .sentinel {
    height: 1px;
  }

  .notice {
    position: absolute;
    top: 68px;
    right: 16px;
    z-index: 4;
    max-width: calc(100% - 32px);
    margin: 0;
    padding: 6px 10px;
    font-size: var(--font-md);
    background: var(--card);
    border: 1px solid var(--line);
    pointer-events: none;
  }

  @media (max-width: 1100px) {
    .tools {
      flex-wrap: wrap;
    }

    .search {
      flex-basis: 100%;
    }

    .sort {
      flex: 1;
      width: auto;
    }
  }

  @media (max-width: 800px) {
    .top {
      flex-wrap: wrap;
      gap: 8px;
      height: auto;
      min-height: 60px;
      padding: 8px;
    }

    .usage {
      order: 1;
      flex-basis: 100%;
      padding-left: 0;
      border-left: none;
    }

    .back span,
    h1 {
      display: none;
    }

    .tabs {
      flex: 1;
      width: auto;
      margin-left: 0;
    }

    .tools {
      flex-wrap: wrap;
      padding: 12px 12px 0;
    }

    .search {
      flex-basis: 100%;
    }

    .sort {
      flex: 1;
      width: auto;
    }

    .list {
      padding: 12px 12px 20px;
    }

    .body {
      grid-template-columns: minmax(0, 1fr);
    }

    .placeholder {
      display: none;
    }

    .side {
      position: absolute;
      inset: 0;
      z-index: 3;
    }
  }
</style>
