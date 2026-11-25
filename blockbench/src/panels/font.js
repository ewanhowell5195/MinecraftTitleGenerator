import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue"
import { keyed } from "#lib/core/keyed.js"
import { fullName } from "#lib/font/catalog.js"
import { fontCredit } from "#lib/font/credits.js"
import { googleFontList, googlePreview, googlePreviewFamily, styleLabel, styleParts } from "#lib/font/googleFonts.js"
import { fontThumbnail } from "#lib/font/thumbnailUrls.js"
import { BUILDS, FONT_TABS, useFontSource } from "#lib/panels/fontSource.js"
import { openedFirst } from "#lib/panels/opened.js"
import { leastRows, usePickFloor, variantRows } from "#lib/panels/pickFloor.js"
import { byUsage } from "#lib/title/popularity.js"
import { googleStatId } from "#lib/title/statIds.js"
import { selectedElements } from "../host.js"
import { library } from "../library.js"
import { edit } from "../undo.js"
import { INPUTS } from "./inputs.js"
import { TILES } from "./tiles.js"

const PAGE = 60

const GoogleFonts = {
  components: { ...INPUTS, ...TILES },
  props: { search: String, current: { type: Object, default: null }, opened: { type: String, default: null }, loading: { type: String, default: null } },
  setup(props, { emit }) {
    const fonts = shallowRef([])
    const error = ref("")
    const limit = ref(PAGE)
    const weight = ref(400)
    const loaded = keyed()
    const found = computed(() => {
      const term = props.search.trim().toLowerCase()
      const ordered = openedFirst(byUsage(fonts.value, font => googleStatId(font.family)), font => font.family === props.opened)
      if (!term) return ordered
      return ordered.filter(font => [font.family, font.category].concat(font.designers).some(text => text.toLowerCase().includes(term)))
    })
    const shown = computed(() => found.value.slice(0, limit.value))
    const byFamily = computed(() => new Map(fonts.value.map(font => [font.family, font])))
    const entry = computed(() => byFamily.value.get(props.current?.google))
    const styles = computed(() => (entry.value?.styles ?? []).map(style => ({ value: style, label: styleLabel(style) })))
    const italic = computed(() => !!props.current && styleParts(props.current.style).italic)
    const bothSlants = computed(() => ["", "i"].every(end => entry.value?.styles.some(style => style.endsWith("i") === !!end)))

    const seen = new IntersectionObserver(entries => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue
        seen.unobserve(target)
        if (!target.dataset.family) {
          limit.value += PAGE
          continue
        }
        const font = byFamily.value.get(target.dataset.family)
        googlePreview(font).then(() => (loaded[font.family] = true), () => {})
      }
    })

    function restyle(nextWeight, nextItalic) {
      const style = `${nextWeight}${nextItalic ? "i" : ""}`
      if (style !== props.current.style) emit("pick", { family: props.current.google, style })
    }

    function pick(font) {
      if (!props.loading && font.family !== props.current?.google) emit("pick", { family: font.family, style: font.style })
    }

    watch(() => props.current?.style, style => {
      if (style) weight.value = styleParts(style).weight
    }, { immediate: true })

    watch(() => props.search, () => (limit.value = PAGE))

    googleFontList().then(list => (fonts.value = list), err => (error.value = `Couldn't load Google Fonts: ${err.message}`))
    onBeforeUnmount(() => seen.disconnect())

    return { bothSlants, entry, error, family: name => googlePreviewFamily(name), fonts, found, italic, loaded, pick, restyle, seen, shown, styles, weight }
  },
  methods: {
    observe() {
      for (const element of this.$el.querySelectorAll?.("[data-family], .mtg-more") ?? []) {
        if (!this.loaded[element.dataset.family]) this.seen.observe(element)
      }
    }
  },
  mounted() {
    this.observe()
  },
  updated() {
    this.observe()
  },
  template: `
    <div class="mtg-controls">
      <p v-if="error" class="mtg-error">{{ error }}</p>
      <p v-else-if="!fonts.length" class="mtg-hint">Loading fonts...</p>
      <p v-else-if="!found.length" class="mtg-hint">No fonts match</p>
      <div v-else class="mtg-grid mtg-scroll">
        <title-tile v-for="font of shown" :key="font.family" :label="font.family === loading ? 'Loading...' : font.family" :author="font.designers" :selected="!!current && font.family === current.google" @pick="pick(font)">
          <span class="mtg-sample" :data-family="font.family"><span v-show="loaded[font.family]" :style="{ fontFamily: family(font.family) }">ABC</span></span>
        </title-tile>
        <div v-if="shown.length < found.length" :key="'more-' + shown.length" class="mtg-more"></div>
      </div>
      <template v-if="entry && entry.weights">
        <slider-control label="Weight" :value="weight" :min="entry.weights[0]" :max="entry.weights[1]" @change="weight = $event" @done="restyle(weight, italic)" />
        <toggle-control v-if="bothSlants" label="Italic" :value="italic" @change="restyle(weight, $event)" />
      </template>
      <dropdown-control v-else-if="styles.length > 1" label="Style" :options="styles" :value="current.style" @change="$emit('pick', { family: current.google, style: $event })" />
    </div>
  `
}

export const FontGroup = {
  components: { ...INPUTS, ...TILES, GoogleFonts },
  setup() {
    const state = useFontSource()

    function change(action) {
      edit(selectedElements(), "Change title font", action)
    }

    const { picker, floor } = usePickFloor(() => [state.tab.value, state.variants.value.length, state.search.value], "mtg-scroll")

    return { ...state, picker, floor, leastRows, variantRows, BUILDS, FONT_TABS, change, credit: data => fontCredit(data, library.fonts), fontThumbnail, named: data => fullName(data, library.fonts), base: id => library.fonts.find(item => item.id === id) ?? { id } }
  },
  template: `
    <section class="mtg-group">
      <div class="mtg-head">
        <h3>Font</h3>
        <div v-if="modified" class="tool" title="Reset" @click="change(reset)"><i class="material-icons">replay</i></div>
      </div>
      <div ref="picker" class="mtg-controls" :class="{ 'mtg-pick mtg-peek': tab !== 'custom' }" :style="tab === 'published' ? { minHeight: floor + 'px' } : null">
        <segments-control :options="FONT_TABS" :value="tab" @change="change(() => chooseTab($event))" />

        <template v-if="tab === 'custom'">
          <upload-control multiple accept=".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2" :label="loading ? 'Loading...' : uploaded ? 'Replace font' : 'Choose a font file'" empty="No font uploaded" :disabled="loading" :clearable="uploaded" @files="change(() => upload($event))" @clear="change(clearCustom)">
            <template v-if="uploaded">
              <img v-if="customImage" :src="customImage" alt="" :style="customUnit ? { height: customUnit + 'px' } : null">
              <span>{{ customName || object.customFont.fileName }}</span>
            </template>
          </upload-control>
          <p v-if="customError" class="mtg-error">{{ customError }}</p>
          <p v-else class="mtg-hint">A JSON from the font editor, a Minecraft ascii.png, a resource pack font JSON chosen together with its PNGs, or a .ttf, .otf, .woff or .woff2 font.</p>
          <p v-if="!customError && customNote && customNote.text && object.customFont && customNote.data === object.customFont.data" class="mtg-hint">{{ customNote.text }}</p>
          <template v-if="imported && usingCustom">
            <segments-control v-if="object.customFont.kind === 'outline'" label="Build from" :options="BUILDS" :value="!!object.customFont.mesh" :hint="object.customFont.mesh ? 'Smooth edges that follow the font\\'s own curves.' : 'Pixel cubes, like the other fonts.'" @change="change(() => changeImport('mesh', $event))" />
            <div class="mtg-row">
              <number-control label="Height in pixels" :value="object.customFont.height" :disabled="loading" @change="change(() => changeImport('height', $event))" />
              <number-control v-if="squares" label="Square size" :value="object.customFont.density || 1" :disabled="loading" @change="change(() => changeImport('density', $event))" />
            </div>
            <p v-if="squares" class="mtg-hint">Square size is how many pixels each square is. 4 gives chunky squares like Minecraft Ten. Fonts drawn on a pixel grid keep their own.</p>
          </template>
          <reuse-tiles :items="reusable" @pick="change(() => applyCustom($event))" />
        </template>

        <template v-if="tab === 'google'">
          <search-bar v-model="search" />
          <p v-if="customError" class="mtg-error">{{ customError }}</p>
          <google-fonts :search="search" :current="usingCustom && object.customFont.google ? object.customFont : null" :opened="opened.google" :loading="googleLoading" @pick="change(() => pickGoogle($event))" />
        </template>

        <template v-if="tab === 'published'">
          <search-bar v-if="searchable" v-model="search" />
          <div v-if="searching" class="mtg-grid mtg-scroll">
            <title-tile v-for="data of foundFonts" :key="data.id" :label="named(data)" :image="fontThumbnail(data)" :author="credit(data)" :selected="object.font === data.id" @pick="change(() => (object.font = data.id))" />
          </div>
          <div v-else class="mtg-grid mtg-scroll" :class="{ 'mtg-kept': variants.length }" :style="{ '--least': leastRows(baseFonts) }">
            <title-tile v-for="data of baseFonts" :key="data.id" :label="data.name" :image="fontThumbnail(data)" :author="credit(data)" :badge="variantBadges[data.id]" :selected="baseId === data.id" @pick="change(() => (object.font = data.id))" />
          </div>
          <template v-if="variants.length && !searching">
            <h4>Variants</h4>
            <div class="mtg-grid mtg-scroll mtg-variants" :style="{ '--rows': variantRows(variants) }">
              <title-tile label="Default" :image="fontThumbnail(base(baseId))" :selected="object.font === baseId" @pick="change(() => (object.font = baseId))" />
              <title-tile v-for="data of variants" :key="data.id" :label="data.name" :image="fontThumbnail(data)" :author="credit(data)" :selected="object.font === data.id" @pick="change(() => (object.font = data.id))" />
            </div>
          </template>
        </template>
      </div>
    </section>
  `
}
