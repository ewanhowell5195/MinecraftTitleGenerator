import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useCommunityBrowser } from "#lib/presets/communityBrowser.js"
import { SORTS } from "#lib/presets/presetText.js"
import { notice } from "#lib/state/notices.js"
import { AccountButton } from "../account/index.js"
import { isBlank, openPreset, replaceWithPreset } from "../file.js"
import { FORMAT } from "../format.js"
import { hidePanels, putFirst, showPanels } from "../mode.js"
import { DropdownControl } from "../panels/inputs.js"
import { stashSelection } from "../selection.js"
import { inDevelopment } from "../stats.js"
import { PresetDetail, PresetTile } from "./parts.js"
import { STYLES } from "./styles.js"

const ID = "minecraft_title_presets"

const opened = ref(false)
const shown = ref(false)
const changes = ref(0)
const blank = computed(() => changes.value > 0 && inPresets() && isBlank())

let mode = null
let styles = null
let stopNotices = null
let restoreSelection = null

const PresetBrowser = {
  components: { AccountButton, DropdownControl, PresetDetail, PresetTile },
  setup() {
    const sort = ref(SORTS[0].value)
    const search = ref("")
    const browser = useCommunityBrowser({ sort, search })
    const list = ref(null)

    function use(open) {
      const preset = browser.selected.value
      try {
        open(preset)
      } catch (err) {
        console.error(err)
        Blockbench.showMessageBox({ title: `Couldn't open ${preset.name}`, message: err.message })
        return
      }
      if (!inDevelopment()) browser.counted(preset)
    }

    async function showSelected() {
      await nextTick()
      list.value?.querySelector(".selected")?.scrollIntoView({ block: "nearest" })
    }

    function key({ key }) {
      if (key === "Escape" && inPresets() && !Dialog.open && browser.selected.value) browser.clear()
    }

    let scrolled = 0
    async function keepScroll(value) {
      if (!value) scrolled = list.value.scrollTop
      else {
        await nextTick()
        list.value.scrollTop = scrolled
      }
    }

    watch(shown, keepScroll, { flush: "sync" })
    watch(browser.selected, showSelected)
    onMounted(() => {
      browser.load(0)
      addEventListener("keydown", key)
    })
    onBeforeUnmount(() => removeEventListener("keydown", key))
    return { ...browser, list, sort, search, sorts: SORTS, blank, open: () => use(openPreset), loadInto: () => use(replaceWithPreset) }
  },
  template: `
    <div class="mtg-presets" :class="{ open: selected }">
      <div class="mtg-browse">
        <div class="mtg-row">
          <search-bar class="mtg-fill" v-model="search" />
          <div class="mtg-sort"><dropdown-control :value="sort" :options="sorts" @change="sort = $event" /></div>
          <button class="mtg-button mtg-random" @click="pickRandom"><i class="material-icons">casino</i><span>Random</span></button>
          <account-button />
        </div>
        <div ref="list" class="mtg-list">
          <p v-if="error" class="mtg-error">{{ error }}</p>
          <p v-else-if="!results.length && !loading" class="mtg-hint">{{ emptyMessage }}</p>
          <div class="mtg-preset-grid">
            <preset-tile v-for="preset of results" :key="preset.id" :preset="preset" :selected="!!selected && selected.id === preset.id" :searched="searched(preset)" @pick="pick(preset)" @user="searchUser" />
          </div>
          <p v-if="loading" class="mtg-hint">Loading presets</p>
          <div ref="sentinel" class="mtg-more"></div>
        </div>
      </div>
      <preset-detail v-if="selected" :preset="selected" :searched="searched(selected)" :blank="blank" @user="searchUser" @open="open" @load="loadInto" @close="clear" />
    </div>
  `
}

function inPresets() {
  return !!mode && Mode.selected === mode
}

function enter() {
  opened.value = true
  shown.value = true
  changes.value++
  restoreSelection = stashSelection()
  hidePanels()
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
  stopNotices = watch(notice, text => text && Blockbench.showQuickMessage(text, 3000))
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
}

export function unregisterPresets() {
  if (inPresets()) Modes.options.edit.select()
  for (const project of ModelProject.all) {
    if (project.mode === ID) project.mode = "edit"
  }
  Vue.delete(Modes.options, ID)
  const screen = mode.vue.$el.parentNode
  mode.vue.$destroy()
  screen.remove()
  mode = null
  opened.value = false
  stopNotices()
  styles.delete()
}
