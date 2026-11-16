<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue"
  import { account, accountChanges, countDownload, managedPresets, ownPresets, presetStats, randomCommunityPreset, refreshAccount, refreshUsage, signInProviders, voteOn } from "../../lib/state/community.js"
  import { isPlainClick, useWindowEvents } from "../../components/composables/events.js"
  import { titleBody } from "../../lib/link/linkformat.js"
  import { notice, showNotice } from "../../lib/state/notices.js"
  import { addPreset, deleteSharedPreset, loadPreset, presets, presetsError, presetsLoading, removePreset, renamePreset, renameSharedPreset, unsharePreset } from "../../lib/state/presets.js"
  import { askConfirm } from "../../lib/state/confirm.js"
  import { searchWithUser, searchesUser, toggleUserSearch } from "../../lib/link/presetSearch.js"
  import { closePresetsPage, leavePresetsForEditor, presetsPage, setPresetSearch, setPresetSort, showPresetFilters, showPreset, takeLanding } from "../../lib/state/presetsPage.js"
  import { rememberTab, startingTab, usePresetAddress } from "./presetAddress.js"
  import { usePresetPaging } from "./presetPaging.js"
  import AuthorLink from "./AuthorLink.vue"
  import Badge from "../../components/Badge.vue"
  import Button from "../../components/Button.vue"
  import Notice from "../../components/Notice.vue"
  import DeletePresetDialog from "./DeletePresetDialog.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import GoldStar from "./GoldStar.vue"
  import Icon from "../../components/Icon.vue"
  import PresetDetail from "./PresetDetail.vue"
  import PresetTile from "./PresetTile.vue"
  import Segments from "../../components/Segments.vue"
  import SharePresetDialog from "./SharePresetDialog.vue"
  import ShareUsage from "./ShareUsage.vue"
  import TopBar from "../../site/TopBar.vue"
  import { router } from "../../router.js"

  const TABS = [{ value: "community", label: "Community" }, { value: "mine", label: "My presets" }]
  const SORTS = [{ value: "week", label: "Popular this week" }, { value: "popular", label: "Popular all time" }, { value: "top", label: "Top rated" }, { value: "new", label: "Newest" }, { value: "needs", label: "Needs votes" }]
  const EDITOR_TITLE = "Minecraft Title Generator"

  const landed = takeLanding()
  const tab = ref(startingTab(landed))
  const sort = computed({ get: () => presetsPage.sort, set: setPresetSort })
  const mineSearch = ref("")
  const search = computed({ get: () => tab.value === "community" ? presetsPage.search : mineSearch.value, set: value => tab.value === "community" ? setPresetSearch(value) : mineSearch.value = value })
  const { results, loading, error, sentinel, load, searchNow } = usePresetPaging({ sort, search, active: () => tab.value === "community", loaded: refreshSelection })
  const root = ref(null)
  const sharing = ref(null)
  const removing = ref(null)
  const stats = ref({})
  const selectedCommunity = ref(null)
  const selectedLocalCode = ref(null)

  const term = computed(() => search.value.trim())
  const saved = computed(() => new Set(presets.value.map(preset => titleBody(preset.code))))
  const localShown = computed(() => presets.value.filter(preset => preset.name.toLowerCase().includes(term.value.toLowerCase())))
  const localGroups = computed(() => [{ label: "Shared", presets: localShown.value.filter(preset => preset.shared) }, { label: "Local", presets: localShown.value.filter(preset => !preset.shared) }].filter(group => group.presets.length))
  const sharedIds = computed(() => presets.value.filter(preset => preset.shared).map(preset => preset.shared).join(","))
  const selectedLocal = computed(() => presets.value.find(preset => preset.code === selectedLocalCode.value) ?? null)
  const selected = computed(() => tab.value === "mine" ? selectedLocal.value : selectedCommunity.value)
  const authorSearched = computed(() => tab.value === "community" && !!selected.value?.author && searchesUser(presetsPage.search, selected.value.author, selected.value.authorProvider))
  const emptyMessage = computed(() => {
    if (tab.value === "mine") return term.value ? "None of your presets match this search." : "You have no presets yet. Use File > Save preset to save the current title here."
    if (term.value) return "No presets match this search."
    return sort.value === "needs" ? "You have voted on everything that needs votes. Thank you!" : "Nobody has shared a preset yet. Be the first from My presets!"
  })
  const { followAddress, followOwnShared } = usePresetAddress({ tab, results, error, selectedCommunity, selectedLocalCode, selectedLocal, clearSelection })

  function isMine(preset) {
    return ownPresets.value.includes(preset.id)
  }

  function refreshSelection() {
    if (selectedCommunity.value) selectedCommunity.value = results.value.find(preset => preset.id === selectedCommunity.value.id) ?? selectedCommunity.value
  }

  function selectCommunity(preset) {
    if (selectedCommunity.value?.id === preset.id) return clearSelection()
    error.value = ""
    selectedCommunity.value = preset
    showPreset(preset.id)
  }

  function followed(event) {
    if (!isPlainClick(event)) event.stopPropagation()
    else event.preventDefault()
  }

  function clearSelection() {
    selectedCommunity.value = null
    selectedLocalCode.value = null
    if (presetsPage.id !== null || presetsPage.code !== null) showPreset(null)
  }

  function selectLocal(preset) {
    if (selectedLocalCode.value === preset.code) return clearSelection()
    selectedLocalCode.value = preset.code
  }

  async function filterByUser(name, provider) {
    const toggling = tab.value === "community"
    tab.value = "community"
    await nextTick()
    search.value = toggling ? toggleUserSearch(search.value, name, provider) : searchWithUser(search.value, name, provider)
    await nextTick()
    searchNow()
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

  async function open(preset) {
    if (!await loadPreset(preset)) return
    if (tab.value === "community") counted(preset)
    leavePresetsForEditor()
  }

  function save(preset) {
    addPreset(preset.name, preset.code)
    counted(preset)
  }

  async function vote(preset, value) {
    if (preset.vote === value) return
    try {
      Object.assign(preset, await voteOn(preset.id, value))
      if (sort.value === "needs") results.value = results.value.filter(item => item.id !== preset.id)
    } catch (err) {
      showNotice(err.message)
    }
  }

  async function openRandom() {
    try {
      const current = selectedCommunity.value?.id ?? null
      const preset = await randomCommunityPreset(current)
      if (preset) selectCommunity(results.value.find(item => item.id === preset.id) ?? preset)
      else showNotice(current === null ? "Nobody has shared a preset yet." : "There are no other presets to show yet.")
    } catch (err) {
      showNotice(err.message)
    }
  }

  async function remove(preset) {
    if (preset.shared) {
      removing.value = preset
      return
    }
    if (!await askConfirm({ title: "Delete preset", message: `Delete the preset ${preset.name}?`, action: "Delete", danger: true })) return
    removePreset(preset)
    selectedLocalCode.value = null
  }

  async function confirmRemove(choice) {
    const preset = removing.value
    removing.value = null
    try {
      if (choice === "local") removePreset(preset)
      else if (choice === "unshare") await unsharePreset(preset.shared)
      else await deleteSharedPreset(preset.shared)
      results.value = results.value.filter(item => item.id !== preset.shared)
      if (tab.value === "community") clearSelection()
      else if (choice !== "unshare") selectedLocalCode.value = null
    } catch (err) {
      showNotice(err.message)
    }
  }

  async function renameCommunity(preset, name) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === preset.name) return
    try {
      preset.name = await renameSharedPreset(preset.id, trimmed)
    } catch (err) {
      showNotice(err.message)
    }
  }

  function renameLocal(preset, name) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === preset.name) return
    renamePreset(preset, trimmed)
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
    else if (presetsPage.fromEditor) closePresetsPage()
  }

  useWindowEvents(() => true, { keydown: key })

  watch(tab, value => {
    rememberTab(value)
    mineSearch.value = ""
    showPresetFilters(value === "community")
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
  watch(sort, () => load(0))
  watch([tab, sharedIds], loadStats, { immediate: true })
  watch(accountChanges, () => {
    if (tab.value === "community") load(0)
  })
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
    showPresetFilters(tab.value === "community")
    if (tab.value === "community") load(0)
    rememberTab(tab.value)
    if (landed && tab.value === "mine" && presetsPage.id !== null) followOwnShared(presetsPage.id)
    else followAddress()
  })

  onBeforeUnmount(() => {
    if (router.currentRoute.value.meta.name === "app") document.title = EDITOR_TITLE
  })
</script>

<template>
  <div ref="root" class="page">
    <TopBar class="top" title="Presets">
      <template v-if="presetsPage.fromEditor" #start><Button class="back" @click="closePresetsPage()"><template #icon><Icon name="back" :size="18" /></template><span>Back to editor</span></Button></template>
      <ShareUsage v-if="tab === 'mine'" class="usage divided" />
      <template #end><Segments class="tabs" :options="TABS" v-model="tab" /></template>
    </TopBar>
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
          <Notice v-if="error" class="spaced">{{ error }}</Notice>
          <Notice v-else-if="tab === 'mine' && presetsError" class="spaced">{{ presetsError }}</Notice>
          <p v-else-if="tab === 'mine' && presetsLoading" class="message empty-state">Loading your presets</p>
          <p v-else-if="tab === 'community' ? !results.length && !loading : !localShown.length" class="message empty-state">{{ emptyMessage }}</p>
          <p v-if="tab === 'mine' && !account && signInProviders.length" class="message empty-state">Sign in to keep your presets under your account. The presets saved in this browser, and anything shared from it, move to your account when you do.</p>
          <div v-if="tab === 'community'" class="grid">
            <PresetTile v-for="preset of results" :key="preset.id" :code="preset.code" :fingerprint="preset.fingerprint" :selected="selected?.id === preset.id" @pick="selectCommunity(preset)">
              <a class="name ellipsis" :href="`/app/presets/${preset.id}`" @click="followed">{{ preset.name }}</a>
              <span v-if="preset.rating !== null" class="stats">
                <span v-tooltip="`From ${preset.votes} votes`"><GoldStar :size="13" />{{ preset.rating.toFixed(1) }}</span>
              </span>
              <Badge v-if="isMine(preset) && !preset.author" tone="accent">Shared by you</Badge>
              <AuthorLink v-else-if="preset.author" class="author" :class="{ yours: isMine(preset) }" :name="preset.author" :provider="preset.authorProvider" :size="13" :searched="searchesUser(presetsPage.search, preset.author, preset.authorProvider)" @click.stop="filterByUser(preset.author, preset.authorProvider)" />
            </PresetTile>
          </div>
          <template v-else>
            <section v-for="group of localGroups" :key="group.label" class="group">
              <h2>{{ group.label }}</h2>
              <div class="grid">
                <PresetTile v-for="preset of group.presets" :key="preset.code" :code="preset.code" :selected="selectedLocalCode === preset.code" @pick="selectLocal(preset)">
                  <strong class="ellipsis">{{ preset.name }}</strong>
                  <Badge v-if="preset.inBrowser" v-tooltip="'Your account is full, so this is only saved in this browser'">This browser only</Badge>
                  <span v-if="stats[preset.shared]" class="stats">
                    <span v-tooltip="'Uses'"><Icon name="download" :size="13" />{{ stats[preset.shared].downloads }}</span>
                    <span v-if="stats[preset.shared].rating !== null"><GoldStar :size="13" />{{ stats[preset.shared].rating.toFixed(1) }}</span>
                  </span>
                </PresetTile>
              </div>
            </section>
          </template>
          <p v-if="tab === 'community' && loading" class="message loading empty-state">Loading presets</p>
          <div ref="sentinel" class="sentinel"></div>
        </div>
      </main>
      <PresetDetail v-if="selected && tab === 'community'" class="side" :preset="selected" :searched="authorSearched" :mine="isMine(selected)" :owned="managedPresets.includes(selected.id)" :saved="saved.has(titleBody(selected.code))" @close="clearSelection" @user="filterByUser" @open="open(selected)" @save="save(selected)" @vote="vote(selected, $event)" @rename="renameCommunity(selected, $event)" @remove="removeCommunity(selected)" />
      <PresetDetail v-else-if="selected" class="side" :preset="selected" :stats="stats[selected.shared]" local @close="clearSelection" @user="filterByUser" @open="open(selected)" @rename="renameLocal(selected, $event)" @remove="remove(selected)" @share="sharing = selected" @view="viewInCommunity(selected.shared)" />
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
  }

  .back {
    flex: none;
  }

  .tabs {
    width: 280px;
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
  }

  .usage {
    flex: none;
    padding-left: var(--bar-item-padding);
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

  .name {
    flex: 1;
    font-weight: 700;
    color: inherit;
    text-decoration: none;
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
      row-gap: 8px;
      padding-top: 8px;
      padding-bottom: 8px;
    }

    .usage {
      order: 1;
      flex-basis: 100%;
      margin-left: 0;
      padding-left: 0;
    }

    .usage::before,
    .back span {
      display: none;
    }

    .tabs {
      flex: 1;
      width: auto;
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
