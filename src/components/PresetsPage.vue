<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue"
  import { account, accountChanges, communityPreset, countDownload, listCommunity, managedPresets, ownPresets, presetStats, randomCommunityPreset, refreshAccount, refreshUsage, signInProviders, voteOn } from "../lib/community.js"
  import { useWindowEvents } from "../lib/events.js"
  import { LIMITS } from "../lib/limits.js"
  import { titleBody } from "../lib/linkformat.js"
  import { notice } from "../lib/notices.js"
  import { addPreset, deleteSharedPreset, loadPreset, presets, presetsError, presetsLoaded, presetsLoading, removePreset, renamePreset, renameSharedPreset, unmarkShared, unsharePreset } from "../lib/presets.js"
  import { parseSearch, searchWithUser } from "../lib/presetSearch.js"
  import { closePresetsPage, leavePresetsForEditor, openLinkInEditor, presetsPage, showOwnPreset, showPreset, takeLanding } from "../lib/presetsPage.js"
  import { providerLabel } from "../lib/providers.js"
  import { openSharedLink } from "../lib/share.js"
  import AccountMenu from "./AccountMenu.vue"
  import Button from "./Button.vue"
  import Notice from "./Notice.vue"
  import NotificationBell from "./NotificationBell.vue"
  import DeletePresetDialog from "./DeletePresetDialog.vue"
  import Dropdown from "./Dropdown.vue"
  import Icon from "./Icon.vue"
  import UserName from "./UserName.vue"
  import PresetDetail from "./PresetDetail.vue"
  import Segments from "./Segments.vue"
  import SharePresetDialog from "./SharePresetDialog.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"
  import TitlePicture from "./TitlePicture.vue"
  import { router } from "../router.js"

  const TABS = [{ value: "community", label: "Community" }, { value: "mine", label: "My presets" }]
  const SORTS = [{ value: "week", label: "Popular this week" }, { value: "popular", label: "Popular all time" }, { value: "top", label: "Top rated" }, { value: "new", label: "Newest" }, { value: "needs", label: "Needs votes" }]
  const SEARCH_DELAY = 500
  const EDITOR_TITLE = "Minecraft Title Generator"
  const TAB_STORAGE = "minecraft-title-presets-tab"

  const landed = takeLanding()
  const tab = ref(startingTab())
  const sort = ref("week")
  const search = ref("")
  const results = ref([])
  const more = ref(false)
  const loading = ref(false)
  const error = ref("")
  const root = ref(null)
  const sentinel = ref(null)
  const sharing = ref(null)
  const removing = ref(null)
  const stats = ref({})
  const selectedCommunity = ref(null)
  const selectedLocalCode = ref(null)

  const term = computed(() => search.value.trim())
  const searchText = computed(() => parseSearch(term.value).text)
  const tooShort = computed(() => tab.value === "community" && searchText.value.length > 0 && Array.from(searchText.value).length < LIMITS.searchMinimum)
  const saved = computed(() => new Set(presets.value.map(preset => titleBody(preset.code))))
  const localShown = computed(() => presets.value.filter(preset => preset.name.toLowerCase().includes(term.value.toLowerCase())))
  const localGroups = computed(() => [{ label: "Shared", presets: localShown.value.filter(preset => preset.shared) }, { label: "Local", presets: localShown.value.filter(preset => !preset.shared) }].filter(group => group.presets.length))
  const sharedIds = computed(() => presets.value.filter(preset => preset.shared).map(preset => preset.shared).join(","))
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

  function storedTab(storage) {
    return storage.getItem(TAB_STORAGE) === "mine" ? "mine" : "community"
  }

  function startingTab() {
    if (presetsPage.code !== null) return "mine"
    if (!landed) return presetsPage.id === null ? storedTab(localStorage) : "community"
    return performance.getEntriesByType("navigation")[0]?.type === "reload" ? storedTab(sessionStorage) : "community"
  }

  function rememberTab(value) {
    localStorage.setItem(TAB_STORAGE, value)
    sessionStorage.setItem(TAB_STORAGE, value)
  }

  async function followOwnShared(id) {
    await refreshAccount()
    await presetsLoaded()
    const own = presets.value.find(preset => preset.shared === id)
    if (presetsPage.id !== id) return
    if (own) selectedLocalCode.value = own.code
    else followAddress()
  }

  function isMine(preset) {
    return ownPresets.value.includes(preset.id)
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
    if (selectedCommunity.value?.id === preset.id) return clearSelection()
    error.value = ""
    selectedCommunity.value = preset
    showPreset(preset.id)
  }

  function clearSelection() {
    selectedCommunity.value = null
    selectedLocalCode.value = null
    if (presetsPage.id !== null || presetsPage.code !== null) showPreset(null)
  }

  async function followOwnLink(code) {
    await refreshAccount()
    await presetsLoaded()
    if (presetsPage.code !== code) return
    const own = presets.value.find(preset => titleBody(preset.code) === titleBody(code))
    if (!own) {
      openLinkInEditor(code)
      openSharedLink()
      return
    }
    tab.value = "mine"
    await nextTick()
    selectedLocalCode.value = own.code
  }

  async function followAddress() {
    const { id, code } = presetsPage
    if (code !== null) {
      if (selectedLocal.value?.code !== code) await followOwnLink(code)
      return
    }
    if (id === null) {
      selectedCommunity.value = null
      selectedLocalCode.value = null
      return
    }
    if (selectedLocal.value?.shared === id || selectedCommunity.value?.id === id) return
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

  async function filterByUser(name, provider) {
    tab.value = "community"
    await nextTick()
    search.value = searchWithUser(search.value, name, provider)
    await nextTick()
    clearTimeout(searching)
    load(0)
  }

  async function loadStats() {
    if (tab.value !== "mine" || !sharedIds.value) return
    try {
      stats.value = await presetStats(sharedIds.value.split(","))
    } catch (err) {
      console.error(err)
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
    if (preset.shared) {
      removing.value = preset
      return
    }
    if (!confirm(`Delete the preset ${preset.name}?`)) return
    removePreset(preset)
    selectedLocalCode.value = null
  }

  async function confirmRemove(choice) {
    const preset = removing.value
    removing.value = null
    error.value = ""
    try {
      if (choice === "local") removePreset(preset)
      else if (choice === "unshare") await unsharePreset(preset.shared)
      else await deleteSharedPreset(preset.shared)
      results.value = results.value.filter(item => item.id !== preset.shared)
      if (tab.value === "community") clearSelection()
      else if (choice !== "unshare") selectedLocalCode.value = null
    } catch (err) {
      error.value = err.message
    }
  }

  async function renameCommunity(preset, name) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === preset.name) return
    error.value = ""
    try {
      preset.name = await renameSharedPreset(preset.id, trimmed)
    } catch (err) {
      error.value = err.message
    }
  }

  function removeCommunity(preset) {
    removing.value = { name: preset.name, shared: preset.id }
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
    if (event.key !== "Escape" || event.defaultPrevented || sharing.value || removing.value) return
    if (selected.value) clearSelection()
    else closePresetsPage()
  }

  useWindowEvents(() => true, { keydown: key })

  watch(tab, value => {
    rememberTab(value)
    search.value = ""
    selectedLocalCode.value = null
    if (value === "community") {
      load(0)
      if (presetsPage.code !== null) showPreset(null)
      else if (presetsPage.id !== null && !selectedCommunity.value) followAddress()
    } else {
      selectedCommunity.value = null
      if (presetsPage.id !== null) showPreset(null)
    }
  })
  watch(selectedLocal, (preset, before) => {
    if (tab.value !== "mine") return
    if (preset?.shared) showPreset(preset.shared)
    else if (preset) showOwnPreset(preset.code)
    else if (before && (presetsPage.id !== null || presetsPage.code !== null)) showPreset(null)
  })
  watch(sort, () => load(0))
  watch([tab, sharedIds], loadStats, { immediate: true })
  watch(accountChanges, () => {
    if (tab.value === "community") load(0)
  })
  watch(search, () => {
    clearTimeout(searching)
    if (tab.value !== "community" || tooShort.value) return
    searching = setTimeout(() => load(0), SEARCH_DELAY)
  })
  watch(() => [presetsPage.id, presetsPage.code], followAddress)
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
    rememberTab(tab.value)
    if (landed && tab.value === "mine" && presetsPage.id !== null) followOwnShared(presetsPage.id)
    else followAddress()
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
    if (router.currentRoute.value.meta.name === "app") document.title = EDITOR_TITLE
    clearTimeout(searching)
    observer.disconnect()
  })
</script>

<template>
  <div ref="root" class="page">
    <header class="top">
      <Button class="back" @click="closePresetsPage()"><template #icon><Icon name="back" :size="18" /></template><span>Back to editor</span></Button>
      <h1>Presets</h1>
      <SubmissionUsage v-if="tab === 'mine'" class="usage" />
      <Segments class="tabs" :options="TABS" v-model="tab" />
      <AccountMenu />
      <NotificationBell />
    </header>
    <div class="body" :class="{ open: selected }">
      <main class="browse">
        <div class="tools input-row">
          <input class="search" type="text" v-model="search" :placeholder="tab === 'community' ? 'Search names, text or user:name' : 'Search your presets'" aria-label="Search presets" spellcheck="false">
          <template v-if="tab === 'community'">
            <Dropdown class="sort" :options="SORTS" v-model="sort" />
            <Button class="random" @click="openRandom"><template #icon><Icon name="dice" :size="16" /></template><span>Random</span></Button>
          </template>
        </div>
        <div class="list">
          <p v-if="tooShort" class="message empty-state">Keep typing to search.</p>
          <Notice v-else-if="error" class="spaced">{{ error }}</Notice>
          <Notice v-else-if="tab === 'mine' && presetsError" class="spaced">{{ presetsError }}</Notice>
          <p v-else-if="tab === 'mine' && presetsLoading" class="message empty-state">Loading your presets</p>
          <p v-else-if="tab === 'community' ? !results.length && !loading : !localShown.length" class="message empty-state">{{ emptyMessage }}</p>
          <p v-if="tab === 'mine' && !account && signInProviders.length" class="message empty-state">Sign in to keep your presets under your account. The presets saved in this browser, and anything shared from it, move to your account when you do.</p>
          <div v-if="tab === 'community'" class="grid">
            <div v-for="preset of results" :key="preset.id" class="card" :class="{ selected: selected?.id === preset.id }" @click="selectCommunity(preset)">
              <TitlePicture :code="preset.code" :fingerprint="preset.fingerprint" @open="selectCommunity(preset)" />
              <div class="details">
                <strong class="ellipsis" v-tooltip="preset.name">{{ preset.name }}</strong>
                <span v-if="isMine(preset) && !preset.author" class="yours">Shared by you</span>
                <button v-else-if="preset.author" type="button" class="author link-button" :class="{ yours: isMine(preset) }" v-tooltip="{ text: `Show presets by ${preset.author} on ${providerLabel(preset.authorProvider)}`, tooltipClass: 'slow' }" @click.stop="filterByUser(preset.author, preset.authorProvider)"><UserName :name="preset.author" :provider="preset.authorProvider" :size="13" /></button>
              </div>
            </div>
          </div>
          <template v-else>
            <section v-for="group of localGroups" :key="group.label" class="group">
              <h2>{{ group.label }}</h2>
              <div class="grid">
                <div v-for="preset of group.presets" :key="preset.code" class="card" :class="{ selected: selectedLocalCode === preset.code }" @click="selectedLocalCode === preset.code ? clearSelection() : selectedLocalCode = preset.code">
                  <TitlePicture :code="preset.code" @open="selectedLocalCode = preset.code" />
                  <div class="details">
                    <strong class="ellipsis" v-tooltip="preset.name">{{ preset.name }}</strong>
                    <span v-if="preset.inBrowser" class="browser" v-tooltip="'Your account is full, so this is only saved in this browser'">This browser only</span>
                    <span v-if="stats[preset.shared]" class="stats">
                      <span v-tooltip="'Uses'"><Icon name="download" :size="13" />{{ stats[preset.shared].downloads }}</span>
                      <span v-if="stats[preset.shared].rating !== null"><Icon name="star" :size="13" />{{ stats[preset.shared].rating.toFixed(1) }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </template>
          <p v-if="tab === 'community' && loading" class="message loading empty-state">Loading presets</p>
          <div ref="sentinel" class="sentinel"></div>
        </div>
      </main>
      <PresetDetail v-if="selected && tab === 'community'" class="side" :preset="selected" :mine="isMine(selected)" :owned="managedPresets.includes(selected.id)" :saved="saved.has(titleBody(selected.code))" @close="clearSelection" @user="filterByUser" @open="open(selected)" @save="save(selected)" @vote="vote(selected, $event)" @rename="renameCommunity(selected, $event)" @remove="removeCommunity(selected)" />
      <PresetDetail v-else-if="selected" class="side" :preset="selected" :stats="stats[selected.shared]" local @close="clearSelection" @user="filterByUser" @open="open(selected)" @rename="renamePreset(selected, $event)" @remove="remove(selected)" @share="sharing = selected" @view="viewInCommunity(selected.shared)" />
    </div>
    <SharePresetDialog v-if="sharing" :preset="sharing" @close="sharing = null" @shared="shared" />
    <DeletePresetDialog v-if="removing" :preset="removing" :can-delete-shared="managedPresets.includes(removing.shared)" @close="removing = null" @delete="confirmRemove" />
    <p v-if="notice" class="toast" role="status">{{ notice }}</p>
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
    flex: none;
    gap: 6px;
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
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .body.open {
    grid-template-columns: minmax(0, 1fr) min(50%, 1024px);
  }

  .browse {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .tools {
    flex: none;
    padding: 16px 20px;
  }

  .sort {
    flex: none;
    width: 200px;
  }

  .sort :deep(.trigger) {
    height: 100%;
  }

  .random {
    flex: none;
    gap: 6px;
  }

  .usage {
    flex: none;
    padding-left: 16px;
    border-left: 1px solid var(--line);
  }

  .list {
    flex: 1;
    min-height: 0;
    padding: 0 20px 24px;
    overflow-y: auto;
    container-type: inline-size;
  }

  .message {
    margin: 0 0 12px;
  }

  .spaced {
    margin-bottom: 12px;
  }

  .message.loading {
    margin: 12px 0 0;
  }

  .group + .group {
    margin-top: 24px;
  }

  h2 {
    margin: 0 0 10px;
    font-size: var(--font-lg);
    font-weight: 600;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, clamp(320px, 30cqi, 420px)), 1fr));
    gap: 12px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 8px;
    font-size: var(--font-sm);
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

  .browser {
    flex: none;
    color: var(--muted);
  }

  .stats {
    display: flex;
    flex: none;
    gap: 10px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .stats span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .author {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 50%;
    color: var(--muted);
  }

  .author:hover {
    color: var(--text);
  }

  .author.yours {
    color: var(--accent);
  }

  .sentinel {
    height: 1px;
  }

  .toast {
    top: 68px;
  }

  @media (max-width: 1420px) {
    .body.open {
      grid-template-columns: 720px minmax(0, 1fr);
    }
  }

  @media (max-width: 1200px) {
    .body.open {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }

  @media (max-width: 1100px) {
    .tools {
      flex-wrap: wrap;
    }

    .tools .search {
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
      padding: 12px 12px 0;
    }

    .list {
      padding: 12px 12px 20px;
    }

    .body.open {
      grid-template-columns: minmax(0, 1fr);
    }

    .side {
      position: absolute;
      inset: 0;
      z-index: 3;
    }
  }
</style>
