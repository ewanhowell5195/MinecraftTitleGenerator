import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useCommunityBrowser } from "#lib/presets/communityBrowser.js"
import { MINE_SORTS, useMyPresets } from "#lib/presets/myPresets.js"
import { SORTS } from "#lib/presets/presetText.js"
import { addPreset, presetsError, presetsLoading } from "#lib/presets/savedPresets.js"
import { accountChanges } from "#lib/state/account.js"
import { communityPreset, managedPresets, ownPresets, refreshUsage } from "#lib/state/community.js"
import { showNotice } from "#lib/state/notices.js"
import { AccountButton } from "../account/index.js"
import { finishBrowsing } from "../browsing.js"
import { isBlank, openPreset, replaceWithPreset } from "../file.js"
import { FORMAT } from "../format.js"
import { hidePanels, putFirst, showPanels } from "../mode.js"
import { DropdownControl, SegmentsControl } from "../panels/inputs.js"
import { stashSelection } from "../selection.js"
import { inDevelopment } from "../stats.js"
import { registerAsking, unregisterAsking } from "./asking.js"
import { PresetDetail, PresetTile, SavedTile } from "./parts.js"
import { registerSaving, unregisterSaving } from "./saving.js"
import { ShareUsage, openSharing, published } from "./sharing.js"
import { STYLES } from "./styles.js"
import { registerTitleBar, unregisterTitleBar } from "./titleBar.js"

const ID = "minecraft_title_presets"
const LEAST_TOOLS = 800
const TABS = [{ value: "community", label: "Community" }, { value: "mine", label: "My presets" }]

const opened = ref(false)
const shown = ref(false)
const changes = ref(0)
const blank = computed(() => changes.value > 0 && inPresets() && isBlank())

let mode = null
let styles = null
let restoreSelection = null
let stopPublished = null

const PresetBrowser = {
  components: { AccountButton, DropdownControl, PresetDetail, PresetTile, SavedTile, SegmentsControl, ShareUsage },
  setup() {
    const sort = ref(SORTS[0].value)
    const tab = ref("community")
    const searches = ref({ community: "", mine: "" })
    const search = computed({ get: () => searches.value[tab.value], set: value => (searches.value[tab.value] = value) })
    const inCommunity = () => tab.value === "community"
    const { selected: communitySelected, rename: renameCommunity, vote, ...browser } = useCommunityBrowser({ sort, search, active: inCommunity })
    const mine = useMyPresets({ search, active: () => tab.value === "mine", forgotten })
    const selected = computed(() => inCommunity() ? communitySelected.value : mine.selected.value)
    const list = ref(null)
    const tools = ref(null)
    const space = ref(0)
    const raised = computed(() => !Blockbench.isMobile && space.value >= LEAST_TOOLS)
    const observer = new ResizeObserver(measureSpace)

    function namePlaceholder() {
      tools.value.querySelector(".search_bar > input").placeholder = inCommunity() ? "Search names, text or user:name" : "Search your presets"
    }

    let watched = null
    function measureSpace() {
      const modes = document.getElementById("mode_selector")
      if (modes !== watched) {
        if (watched) observer.unobserve(watched)
        if (modes) observer.observe(modes)
        watched = modes
      }
      const centre = Interface.center_screen.getBoundingClientRect()
      if (shown.value) space.value = (modes ? modes.getBoundingClientRect().left : centre.right) - centre.left
    }

    function forgotten(id) {
      browser.forget(id)
      if (inCommunity()) browser.clear()
    }

    function clear() {
      if (inCommunity()) browser.clear()
      else mine.selectedCode.value = null
    }

    function pickMine({ code }) {
      mine.selectedCode.value = mine.selectedCode.value === code ? null : code
    }

    function rename(name) {
      if (inCommunity()) renameCommunity(selected.value, name)
      else mine.rename(selected.value, name)
    }

    function remove() {
      const { id, name } = selected.value
      if (inCommunity()) mine.removing.value = { name, shared: id }
      else mine.remove(selected.value)
    }

    function keep() {
      const preset = selected.value
      addPreset(preset.name, preset.code)
      if (!inDevelopment()) browser.counted(preset)
    }

    async function show(preset) {
      tab.value = "community"
      await nextTick()
      if (communitySelected.value?.id !== preset.id) browser.pick(preset)
    }

    async function view() {
      try {
        await show(await communityPreset(selected.value.shared))
      } catch (err) {
        showNotice(err.message)
      }
    }

    function showPublished(preset) {
      if (!preset) return
      published.value = null
      if (!inPresets()) mode.select()
      sort.value = "new"
      show({ vote: 0, ...preset, own: true })
    }

    async function byUser(name, provider) {
      const toggling = inCommunity()
      tab.value = "community"
      await nextTick()
      browser.searchUser(name, provider, toggling)
    }

    function askRemoving(preset) {
      if (!preset) return
      const choices = managedPresets.value.includes(preset.shared) ? ["unshare", "full"] : ["local"]
      const buttons = { unshare: "Delete from Community", full: "Fully delete", local: "Delete my preset only" }
      const message = choices.length > 1 ? "is shared publicly. Deleting it from Community moves it back to your presets, and it keeps its votes and uses if you share it again. Fully deleting it removes it for good." : "is also shared publicly. Blockbench can't manage it, so it will stay in Community."
      Blockbench.showMessageBox({ title: "Delete preset", message: `${preset.name} ${message}`, buttons: choices.map(choice => buttons[choice]).concat("dialog.cancel"), confirmIndex: 0, cancelIndex: choices.length, width: 560 }, button => {
        if (choices[button]) mine.removeShared(choices[button])
        else mine.removing.value = null
      })
    }

    function use(open) {
      const preset = selected.value
      const counts = inCommunity()
      try {
        open(preset)
      } catch (err) {
        console.error(err)
        Blockbench.showMessageBox({ title: `Couldn't open ${preset.name}`, message: err.message })
        return
      }
      if (counts && !inDevelopment()) browser.counted(preset)
    }

    async function showSelected() {
      await nextTick()
      list.value?.querySelector(".selected")?.scrollIntoView({ block: "nearest" })
    }

    function key({ key }) {
      if (key === "Escape" && inPresets() && !Dialog.open && selected.value) clear()
    }

    let scrolled = 0
    async function keepScroll(value) {
      if (!value) scrolled = list.value.scrollTop
      else {
        await nextTick()
        list.value.scrollTop = scrolled
      }
    }

    watch(published, showPublished)
    watch(shown, keepScroll, { flush: "sync" })
    watch(shown, () => nextTick(measureSpace))
    watch(selected, showSelected)
    watch(mine.removing, askRemoving)
    watch(tab, value => {
      namePlaceholder()
      list.value.scrollTop = 0
      mine.selectedCode.value = null
      if (value === "community") browser.load(0)
      else browser.clear()
    })
    watch(accountChanges, () => inCommunity() && browser.load(0))
    onMounted(() => {
      namePlaceholder()
      showPublished(published.value)
      refreshUsage()
      browser.load(0)
      measureSpace()
      observer.observe(Interface.center_screen)
      addEventListener("keydown", key)
    })
    onBeforeUnmount(() => {
      observer.disconnect()
      removeEventListener("keydown", key)
    })
    return {
      ...browser,
      blank,
      byUser,
      clear,
      groups: mine.groups,
      isMine: preset => ownPresets.value.includes(preset.id),
      isOwned: preset => managedPresets.value.includes(preset.id),
      isSaved: mine.isSaved,
      keep,
      list,
      mineSort: mine.sort,
      mineSorts: MINE_SORTS,
      loadInto: () => use(preset => {
        replaceWithPreset(preset)
        finishBrowsing()
      }),
      open: () => use(openPreset),
      pickMine,
      presetsError,
      presetsLoading,
      raised,
      remove,
      rename,
      share: () => openSharing({ preset: selected.value, code: selected.value.code, suggested: selected.value.name }),
      search,
      selected,
      selectedCode: mine.selectedCode,
      shown: mine.shown,
      sort,
      sorts: SORTS,
      space,
      stats: mine.stats,
      tab,
      tabs: TABS,
      tools,
      view,
      vote
    }
  },
  template: `
    <div class="mtg-presets" :class="{ open: selected, raised }">
      <div class="mtg-browse">
        <div ref="tools" class="mtg-row mtg-tools" :style="raised ? { width: space + 'px' } : null">
          <div class="mtg-which"><segments-control :value="tab" :options="tabs" @change="tab = $event" /></div>
          <search-bar class="mtg-fill" v-model="search" />
          <template v-if="tab === 'community'">
            <div class="mtg-sort"><dropdown-control :value="sort" :options="sorts" @change="sort = $event" /></div>
            <button class="mtg-button mtg-random" @click="pickRandom"><i class="material-icons">casino</i><span>Random</span></button>
          </template>
          <template v-else>
            <div class="mtg-sort mtg-short-sort"><dropdown-control :value="mineSort" :options="mineSorts" @change="mineSort = $event" /></div>
            <share-usage />
          </template>
          <account-button />
        </div>
        <div ref="list" class="mtg-list">
          <template v-if="tab === 'community'">
            <p v-if="error" class="mtg-error">{{ error }}</p>
            <p v-else-if="!results.length && !loading" class="mtg-empty">{{ emptyMessage }}</p>
            <div class="mtg-preset-grid">
              <preset-tile v-for="preset of results" :key="preset.id" :preset="preset" :selected="!!selected && selected.id === preset.id" :searched="searched(preset)" :mine="isMine(preset)" @vote="vote(preset, $event)" @pick="pick(preset)" @user="byUser" />
            </div>
            <p v-if="loading" :class="results.length ? 'mtg-hint' : 'mtg-empty'">Loading presets</p>
          </template>
          <template v-else>
            <p v-if="presetsError" class="mtg-error">{{ presetsError }}</p>
            <p v-else-if="presetsLoading" class="mtg-empty">Loading your presets</p>
            <p v-else-if="!shown.length && search.trim()" class="mtg-empty">None of your presets match this search.</p>
            <div v-else-if="!shown.length" class="mtg-empty">
              <i class="material-icons">bookmark</i>
              <strong>No presets yet</strong>
              <span>Use Save preset in the title bar to save the current title here.</span>
            </div>
            <section v-for="group of groups" :key="group.label" class="mtg-saved">
              <h3>{{ group.label }}</h3>
              <div class="mtg-preset-grid">
                <saved-tile v-for="preset of group.presets" :key="preset.code" :preset="preset" :selected="selectedCode === preset.code" :stats="stats[preset.shared]" @pick="pickMine(preset)" />
              </div>
            </section>
          </template>
          <div ref="sentinel" class="mtg-more"></div>
        </div>
      </div>
      <preset-detail v-if="selected && tab === 'community'" key="community" :preset="selected" :searched="searched(selected)" :mine="isMine(selected)" :owned="isOwned(selected)" :saved="isSaved(selected)" :blank="blank" @vote="vote(selected, $event)" @user="byUser" @open="open" @load="loadInto" @save="keep" @rename="rename" @remove="remove" @close="clear" />
      <preset-detail v-else-if="selected" key="mine" local :preset="selected" :stats="stats[selected.shared]" :blank="blank" @user="byUser" @open="open" @load="loadInto" @share="share" @view="view" @rename="rename" @remove="remove" @close="clear" />
    </div>
  `
}

function inPresets() {
  return !!mode && Mode.selected === mode
}

function followPublished(preset) {
  if (preset && !opened.value) mode.select()
}

function enter() {
  opened.value = true
  shown.value = true
  changes.value++
  restoreSelection = stashSelection()
  hidePanels()
}

export function openPresets() {
  mode.select()
}

export function presetsChanged() {
  if (!inPresets()) return
  shown.value = true
  changes.value++
}

export function hidePresets() {
  shown.value = false
}

function leave() {
  hidePresets()
  showPanels()
  restoreSelection()
}

export function registerPresets() {
  styles = Blockbench.addCSS(STYLES)
  registerAsking()
  registerSaving()
  registerTitleBar()
  mode = new Mode(ID, {
    name: "Presets",
    icon: "auto_awesome_mosaic",
    category: "navigate",
    condition: { formats: [FORMAT] },
    selectElements: false,
    hide_toolbars: true,
    hide_sidebars: true,
    hide_status_bar: true,
    component: { components: { PresetBrowser }, setup: () => ({ opened, shown }), template: "<div class='mtg-screen' :class='{ shown }'><preset-browser v-if='opened' /></div>" },
    onSelect: enter,
    onUnselect: leave
  })
  putFirst(ID)
  stopPublished = watch(published, followPublished)
}

export function unregisterPresets() {
  if (inPresets()) Modes.options.edit.select()
  for (const project of ModelProject.all) {
    if (project.mode === ID) project.mode = "edit"
  }
  stopPublished()
  Vue.delete(Modes.options, ID)
  const screen = mode.vue.$el.parentNode
  mode.vue.$destroy()
  screen.remove()
  mode = null
  opened.value = false
  unregisterTitleBar()
  unregisterSaving()
  unregisterAsking()
  styles.delete()
}
