import { checkControls } from "#lib/panels/controls.js"
import { fontInfoTitle } from "#lib/panels/fontInfo.js"
import { readImageFile } from "#lib/panels/imageUpload.js"
import { groupState, usePanelState } from "#lib/panels/panel.js"
import { usePickFloor } from "#lib/panels/pickFloor.js"
import { selectedElements } from "../host.js"
import { CAMERA, beginEdit, edit, finishEdit } from "../undo.js"
import { openFontBrowser } from "./fontBrowser.js"
import { openFontInfo } from "./fontInfo.js"
import { GradientControl } from "./gradient.js"
import { INPUTS, iconOf } from "./inputs.js"
import { DownloadProgress, VersionControl } from "./minecraft.js"
import { RenderOutput } from "./render.js"
import { LayerRows, PairControl, TILES, TitleTiles } from "./tiles.js"

const NAMES = { colour: "colour", gradient: "gradient" }
const BLOCKS = { renderOutput: RenderOutput }

function targetOf({ on }) {
  if (on === "camera") return CAMERA
  return on ? null : selectedElements()
}

function editing(panel, label, change) {
  const target = targetOf(panel)
  if (target) edit(target, label, change)
  else change()
}

const TitleSubgroup = {
  props: { panel: Object, state: Object, control: Object },
  setup({ state, control }) {
    return { own: Object.freeze({ ...groupState(state, control) }) }
  },
  template: `<title-controls :panel="panel" :state="own" :controls="control.controls" />`
}

export const TitleControls = {
  name: "title-controls",
  components: { ...INPUTS, ...TILES, DownloadProgress, GradientControl, LayerRows, PairControl, TitleSubgroup, TitleTiles, VersionControl },
  props: { panel: Object, state: Object, controls: [Array, Function], picker: { type: Object, default: null }, label: { type: String, default: null } },
  setup({ picker, state }) {
    const { resolved } = state
    const { picker: box, floor } = usePickFloor(() => picker && resolved(picker.watch ?? []), "mtg-scroll")
    return { box, floor, icon: iconOf }
  },
  computed: {
    drawn() {
      return this.inlined(this.controls)
    },
    pickClasses() {
      if (!this.picker) return null
      const { resolved } = this.state
      const { boxed, peek, pick } = this.picker
      return { "mtg-pick": resolved(boxed ?? pick), "mtg-peek": resolved(boxed ?? peek) }
    },
    pickStyle() {
      return this.picker && this.state.resolved(this.picker.floor ?? true) ? { minHeight: `${this.floor}px` } : null
    }
  },
  methods: {
    inlined(list) {
      const controls = this.state.resolved(list)
      checkControls(this.panel.id, controls, BLOCKS)
      return controls.flatMap(control => {
        if (!(control.type === "group" && !control.setup || control.grid && control.type === "stack")) return [control]
        return this.state.isShown(control) ? this.inlined(control.controls) : []
      })
    },
    block: name => BLOCKS[name],
    name(control) {
      return this.state.resolved(control.label) ?? NAMES[control.type] ?? this.panel.subject ?? (this.state.title?.value || this.panel.id)
    },
    key(control) {
      return `${this.panel.id}-${control.id ?? control.key ?? control.label}`
    },
    editLabel(control) {
      return `Change title ${this.name(control).toLowerCase()}`
    },
    press(control) {
      const target = targetOf(this.panel)
      if (target) beginEdit(target, this.key(control))
    },
    slide(control, action) {
      if (!control.local) this.press(control)
      action()
    },
    change(control, value) {
      this.slide(control, () => this.state.change(control, value))
    },
    done(control) {
      if (control.done) return this.act(control, () => control.done(this.state.context))
      if (targetOf(this.panel)) finishEdit(this.editLabel(control))
    },
    act(control, action) {
      if (control.local && !control.done) action()
      else editing(this.panel, this.editLabel(control), action)
    },
    pick(control, value) {
      this.act(control, () => this.state.change(control, value))
    },
    run(control) {
      const label = control.icon ? this.editLabel(control) : control.label
      if (control.local) control.press(this.state.context)
      else editing(this.panel, label, () => control.press(this.state.context))
    },
    async upload(control, files) {
      const { context } = this.state
      if (control.files) return this.act(control, () => control.files(files, context))
      try {
        await readImageFile(files[0], data => this.act(control, () => control.pick(data, context)))
      } catch (err) {
        Blockbench.showQuickMessage(err.message, 3000)
      }
    },
    browse(control) {
      const { browsed, search, shownFont, tab } = this.state.context.state
      openFontBrowser({ kind: tab.value, current: shownFont.value, search, pick: font => this.act(control, () => browsed(font)) })
    },
    search(value) {
      this.state.context.state.search.value = value
    }
  },
  template: `
    <div ref="box" :class="[label === null ? 'mtg-controls' : 'mtg-field', pickClasses]" :style="pickStyle">
      <label v-if="label !== null">{{ label }}</label>
      <template v-for="(control, index) of drawn">
        <template v-if="state.isShown(control)">
          <p v-if="control.type === 'hint'" :key="index" :class="state.resolved(control.bad) ? 'mtg-error' : 'mtg-hint'">{{ state.resolved(control.text) }}</p>
          <p v-else-if="control.type === 'notice'" :key="index" class="mtg-error">{{ state.resolved(control.text) }}</p>
          <div v-else-if="control.type === 'heading' && control.reset" :key="index" class="mtg-row">
            <h4 class="mtg-fill">{{ state.resolved(control.text) }}</h4>
            <div v-if="state.resolved(control.modified)" class="tool" title="Reset" @click="act(control, () => control.reset(state.context))"><i class="material-icons">replay</i></div>
          </div>
          <h4 v-else-if="control.type === 'heading'" :key="index">{{ state.resolved(control.text) }}</h4>
          <slider-control v-else-if="control.type === 'slider'" :key="control.id || index" :label="control.label" :value="state.valueOf(control)" :min="state.resolved(control.min)" :max="state.resolved(control.max)" :typed-min="state.resolved(control.typedMin)" :typed-max="state.resolved(control.typedMax)" :step="control.step" :steps="control.steps" :log="control.log" :hint="state.resolved(control.hint)" @change="change(control, $event)" @done="done(control)" />
          <toggle-control v-else-if="control.type === 'toggle'" :key="control.id || index" :label="control.label" :hint="state.resolved(control.hint)" :value="!!state.valueOf(control)" @change="pick(control, $event)" />
          <radio-control v-else-if="control.radio" :key="index" :label="control.label" :options="state.resolved(control.options)" :value="state.valueOf(control)" @change="pick(control, $event)" />
          <segments-control v-else-if="control.type === 'segments'" :key="index" :label="control.label" :hint="state.resolved(control.hint)" :options="state.resolved(control.options)" :value="state.valueOf(control)" @change="pick(control, $event)" />
          <dropdown-control v-else-if="control.type === 'dropdown'" :key="control.id || index" :label="control.label" :options="state.resolved(control.options)" :value="state.valueOf(control)" :title="control.tooltip" @change="pick(control, $event)" />
          <div v-else-if="control.type === 'colour' && control.label" :key="control.id || index" class="mtg-field">
            <label>{{ control.label }}</label>
            <colour-control :value="state.valueOf(control)" @change="change(control, $event)" @done="done(control)" />
          </div>
          <colour-control v-else-if="control.type === 'colour'" :key="index" :value="state.valueOf(control)" @change="change(control, $event)" @done="done(control)" />
          <div v-else-if="control.type === 'colours'" :key="index" class="mtg-colours">
            <colour-control v-for="(colour, at) of state.resolved(control.items)" :key="at" :value="colour.value" @change="slide(control, () => colour.write($event))" @done="done(control)" />
          </div>
          <gradient-control v-else-if="control.type === 'gradient'" :key="index + '-' + (control.perObject ? state.context.object.id : '')" :value="state.valueOf(control)" :smooth="state.resolved(control.smooth)" :mix="state.resolved(control.mix)" :angle="state.resolved(control.angle)" :min="control.min" @press="press(control)" @done="done(control)" />
          <button v-else-if="control.type === 'button'" :key="index" class="mtg-button" :class="{ primary: control.primary, big: control.big }" :title="control.tooltip || control.hint" :disabled="state.resolved(control.disabled)" @click="run(control)"><template v-if="control.icon"><i class="material-icons">{{ icon(control.icon) }}</i><span>{{ control.label }}</span></template><template v-else>{{ control.label }}</template></button>
          <number-control v-else-if="control.type === 'number'" :key="control.id" :label="control.label" :value="state.valueOf(control)" :min="control.min" :disabled="state.resolved(control.disabled)" @change="pick(control, $event)" />
          <pair-control v-else-if="control.type === 'pair'" :key="index" :control="control" />
          <div v-else-if="control.type === 'search' && control.browse" :key="index" class="mtg-row">
            <search-bar v-if="!state.resolved(control.hidden)" class="mtg-fill" :value="state.context.state.search.value" @input="search($event)" />
            <div v-else class="mtg-fill"></div>
            <div class="tool" :title="control.browse.title" @click="browse(control)"><i class="material-icons">view_list</i></div>
          </div>
          <search-bar v-else-if="control.type === 'search' && !state.resolved(control.hidden)" :key="index" :value="state.context.state.search.value" @input="search($event)" />
          <title-tiles v-else-if="control.type === 'tiles'" :key="index" :control="control" :state="state" @pick="tile => act(control, () => tile.pick(state.context))" />
          <layer-rows v-else-if="control.type === 'layerRows'" :key="index" :control="control" :state="state" @act="action => act(control, action)" @move="(from, to) => slide(control, () => control.move(from, to, state.context))" @done="done(control)" />
          <upload-control v-else-if="control.type === 'upload'" :key="index" v-bind="state.resolved(control.view)" :accept="control.accept" :multiple="control.multiple" @files="upload(control, $event)" @clear="act(control, () => control.clear(state.context))" />
          <reuse-tiles v-else-if="control.type === 'reuse'" :key="index" :items="state.resolved(control.items)" @pick="value => act(control, () => control.pick(value, state.context))" />
          <version-control v-else-if="control.type === 'version'" :key="index" :version="state.valueOf(control)" @pick="pick(control, $event)" />
          <download-progress v-else-if="control.type === 'download'" :key="index" />
          <title-controls v-else-if="control.type === 'picker'" :key="index" :panel="panel" :state="state" :controls="control.controls" :picker="control" />
          <title-subgroup v-else-if="control.type === 'group'" :key="index" :panel="panel" :state="state" :control="control" />
          <title-controls v-else-if="control.type === 'field'" :key="index" :panel="panel" :state="state" :controls="control.controls" :label="state.resolved(control.label)" />
          <component v-else-if="control.type === 'block'" :key="index" :is="block(control.name)" :panel="panel" :context="state.context" />
          <title-controls v-else-if="control.type === 'row' || control.type === 'stack'" :key="index" :class="'mtg-' + control.type" :panel="panel" :state="state" :controls="control.controls" />
        </template>
      </template>
    </div>
  `
}

TitleSubgroup.components = { TitleControls }

export const TitleGroup = {
  components: { TitleControls },
  props: { panel: Object, word: { type: Boolean, default: false } },
  setup(props) {
    const state = usePanelState(props.panel, props.word)
    const { enabled, modified, shown, title } = state
    return { state: Object.freeze({ ...state }), enabled, modified, shown, title }
  },
  methods: {
    reset() {
      editing(this.panel, `Reset title ${this.title.toLowerCase()}`, () => this.state.reset())
    },
    enable(event) {
      editing(this.panel, `Change title ${this.title.toLowerCase()}`, () => this.state.enable(event.target.checked))
    },
    fontInfo() {
      const fonts = this.state.context.state
      if (fonts.font.value) openFontInfo(fontInfoTitle(fonts), fonts.font.value)
    }
  },
  template: `
    <section v-if="shown" class="mtg-group">
      <div v-if="title" class="mtg-head">
        <h3>{{ title }}</h3>
        <div v-if="modified" class="tool" title="Reset" @click="reset"><i class="material-icons">replay</i></div>
        <div v-if="panel.id === 'font'" class="tool" :class="{ disabled: !state.context.state.font.value }" title="Font info and characters" @click="fontInfo"><i class="material-icons">info</i></div>
        <input v-if="enabled !== null" type="checkbox" :checked="enabled" @change="enable">
      </div>
      <title-controls v-if="enabled !== false" :panel="panel" :state="state" :controls="panel.controls" />
    </section>
  `
}
