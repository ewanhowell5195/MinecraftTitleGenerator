import { usePanelState } from "../../../src/lib/panels/panel.js"
import { host } from "../../../src/lib/panels/host.js"
import { TYPES } from "../../../src/lib/settings/defaults.js"
import { platform } from "../../../src/lib/core/platform.js"
import { selectedElements } from "../host.js"
import { beginEdit, edit, finishEdit } from "../undo.js"
import { GradientControl } from "./gradient.js"
import { INPUTS } from "./inputs.js"
import { OverlaysBlock } from "./overlays.js"
import { CustomTextureBlock, TextureSourceBlock } from "./texture.js"

const PlacementBlock = {
  props: { context: Object },
  data: () => ({ TYPES, LAYERS: { top: ["top"], bottom: ["bottom", "top"], small: ["top", "small"] } }),
  methods: {
    asset: path => platform.asset(path),
    pick(type) {
      edit(selectedElements(), "Change title placement", () => host.placeLine(type))
    }
  },
  template: `
    <div class="mtg-tiles">
      <div v-for="(data, id) in TYPES" :key="id" class="mtg-tile" :class="{ selected: context.get('type') === id }" @click="pick(id)">
        <span class="mtg-placement">
          <img v-for="layer of LAYERS[id]" :key="layer" :src="asset('placement/' + id + '-' + layer + '.png')" :class="{ dim: layer !== id }" alt="">
        </span>
        <span>{{ data.name }}</span>
      </div>
    </div>
  `
}

const NAMES = { colour: "colour", gradient: "gradient" }
const BLOCKS = { customTexture: CustomTextureBlock, overlays: OverlaysBlock, placement: PlacementBlock, textureSource: TextureSourceBlock }

export const TitleControls = {
  name: "title-controls",
  components: { ...INPUTS, GradientControl },
  props: { panel: Object, state: Object, controls: Array },
  methods: {
    block: name => BLOCKS[name],
    key(control) {
      return `${this.panel.id}-${control.key ?? control.label}`
    },
    label(control) {
      return `Change title ${(control.label ?? NAMES[control.type] ?? (this.state.title.value || this.panel.id)).toLowerCase()}`
    },
    press(control) {
      beginEdit(selectedElements(), this.key(control))
    },
    change(control, value) {
      this.press(control)
      this.state.change(control, value)
    },
    done(control) {
      finishEdit(this.label(control))
    },
    pick(control, value) {
      edit(selectedElements(), this.label(control), () => this.state.change(control, value))
    },
    run(control) {
      edit(selectedElements(), control.label, () => control.press(this.state.context))
    }
  },
  template: `
    <div class="mtg-controls">
      <template v-for="(control, index) of controls">
        <template v-if="state.isShown(control)">
          <p v-if="control.type === 'hint'" :key="index" class="mtg-hint">{{ state.resolved(control.text) }}</p>
          <h4 v-else-if="control.type === 'heading'" :key="index">{{ state.resolved(control.text) }}</h4>
          <slider-control v-else-if="control.type === 'slider'" :key="index" :label="control.label" :value="state.valueOf(control)" :min="state.resolved(control.min)" :max="state.resolved(control.max)" :typed-min="state.resolved(control.typedMin)" :typed-max="state.resolved(control.typedMax)" :step="control.step" :steps="control.steps" :hint="state.resolved(control.hint)" @change="change(control, $event)" @done="done(control)" />
          <toggle-control v-else-if="control.type === 'toggle'" :key="index" :label="control.label" :hint="state.resolved(control.hint)" :value="!!state.valueOf(control)" @change="pick(control, $event)" />
          <segments-control v-else-if="control.type === 'segments'" :key="index" :label="control.label" :options="state.resolved(control.options)" :value="state.valueOf(control)" @change="pick(control, $event)" />
          <dropdown-control v-else-if="control.type === 'dropdown'" :key="index" :label="control.label" :options="state.resolved(control.options)" :value="state.valueOf(control)" :title="control.tooltip" @change="pick(control, $event)" />
          <colour-control v-else-if="control.type === 'colour'" :key="index" :value="state.valueOf(control)" @change="change(control, $event)" @done="done(control)" />
          <gradient-control v-else-if="control.type === 'gradient'" :key="index + '-' + (control.perObject ? state.context.object.id : '')" :value="state.valueOf(control)" :smooth="state.resolved(control.smooth)" :mix="state.resolved(control.mix)" :angle="state.resolved(control.angle)" :min="control.min" @press="press(control)" @done="done(control)" />
          <button v-else-if="control.type === 'button'" :key="index" class="mtg-button" :title="control.tooltip" @click="run(control)">{{ control.label }}</button>
          <component v-else-if="control.type === 'block'" :key="index" :is="block(control.name)" :panel="panel" :context="state.context" />
          <title-controls v-else-if="control.controls" :key="index" :class="'mtg-' + control.type" :panel="panel" :state="state" :controls="control.controls" />
        </template>
      </template>
    </div>
  `
}

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
      edit(selectedElements(), `Reset title ${this.title.toLowerCase()}`, () => this.state.reset())
    },
    enable(event) {
      edit(selectedElements(), `Change title ${this.title.toLowerCase()}`, () => this.state.enable(event.target.checked))
    }
  },
  template: `
    <section v-if="shown" class="mtg-group">
      <div v-if="title" class="mtg-head">
        <h3>{{ title }}</h3>
        <div v-if="modified" class="tool" title="Reset" @click="reset"><i class="material-icons">replay</i></div>
        <input v-if="enabled !== null" type="checkbox" :checked="enabled" @change="enable">
      </div>
      <title-controls v-if="enabled !== false" :panel="panel" :state="state" :controls="panel.controls" />
    </section>
  `
}
