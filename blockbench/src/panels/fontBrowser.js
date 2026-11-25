import { platform } from "#lib/core/platform.js"
import { DEFAULT_SAMPLE, fontBrowserTitle, useFontBrowser } from "#lib/panels/fontBrowser.js"
import { DropdownControl } from "./inputs.js"

let dialog = null

const FontBrowser = {
  components: { DropdownControl },
  props: { kind: String, current: { type: String, default: null }, search: Object },
  setup(props) {
    return { ...useFontBrowser(props), words: props.search, sample: DEFAULT_SAMPLE }
  },
  methods: {
    asset: path => platform.asset(path),
    watchRows() {
      for (const row of this.$el.querySelectorAll(".mtg-font")) this.observe(row)
    },
    placeholder() {
      this.$el.querySelector(".search_bar > input").placeholder = this.google ? "Search Google Fonts" : "Search fonts"
    }
  },
  mounted() {
    this.placeholder()
    this.watchRows()
  },
  updated() {
    this.watchRows()
  },
  template: `
    <div class="mtg-fonts">
      <div class="mtg-fonts-bar">
        <search-bar v-model="words" />
        <input type="text" class="dark_bordered mtg-text" v-model="typed" :placeholder="'Preview text: ' + sample" spellcheck="false">
        <dropdown-control :value="sort" :options="sorts" @change="sort = $event" />
      </div>
      <div class="mtg-fonts-body">
        <div v-if="google" class="mtg-filters">
          <h4>Category</h4>
          <label v-for="category of categories" :key="category" class="mtg-agree"><input type="checkbox" :checked="chosenCategories.includes(category)" @change="toggleCategory(category, $event.target.checked)"><span>{{ category }}</span></label>
          <h4>Technology</h4>
          <label class="mtg-agree"><input type="checkbox" v-model="variable"><span>Variable</span></label>
          <button v-if="filtered" class="mtg-button" @click="clearFilters">Clear filters</button>
        </div>
        <div ref="list" class="mtg-font-list">
          <p v-if="error" class="mtg-error">{{ error }}</p>
          <p v-else-if="loading" class="mtg-hint">Loading fonts...</p>
          <template v-else>
            <p class="mtg-hint">{{ count }}</p>
            <div v-for="entry of shown" :key="entry.id" class="mtg-font" :class="{ selected: entry.id === current }" :data-id="entry.id" @click="$emit('pick', entry.font)">
              <div class="mtg-font-name">
                <strong>{{ entry.label }}</strong>
                <span v-if="entry.author" class="mtg-hint mtg-cut">{{ entry.author }}</span>
                <span v-if="google" class="mtg-hint">{{ entry.styles }}</span>
              </div>
              <div v-if="google" class="mtg-font-text" :class="{ shown: sampleOf(entry) }" :style="{ fontFamily: previewFamily(entry) }">{{ text }}</div>
              <div v-else-if="sampleOf(entry) === null" class="mtg-hint">This font has none of these characters</div>
              <div v-else class="mtg-font-picture"><img :src="sampleOf(entry) || asset(thumbnail(entry))" alt=""></div>
            </div>
            <div v-if="hasMore" ref="more" class="mtg-more"></div>
          </template>
        </div>
      </div>
    </div>
  `
}

export function closeFontBrowser() {
  dialog?.hide()
  dialog?.delete()
  dialog = null
}

export function openFontBrowser({ kind, current, search, pick }) {
  closeFontBrowser()

  function picked(font) {
    closeFontBrowser()
    pick(font)
  }

  dialog = new Dialog("minecraft_title_fonts", {
    title: fontBrowserTitle(kind),
    width: 1000,
    buttons: [],
    component: { components: { FontBrowser }, data: () => ({ given: Object.freeze({ kind, current, search }) }), methods: { picked }, template: `<font-browser v-bind="given" @pick="picked" />` },
    onConfirm: () => false,
    onCancel: closeFontBrowser,
    onOpen() {
      if (!Blockbench.isTouch) this.object.querySelector("input").focus()
    }
  })
  dialog.show()
}
