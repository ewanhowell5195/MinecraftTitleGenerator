const SPAN = 1000

let pickers = 0

export const SliderControl = {
  props: { label: String, value: Number, min: Number, max: Number, typedMin: { default: undefined }, typedMax: { default: undefined }, step: { type: Number, default: 1 }, steps: { type: Array, default: null }, log: { type: Boolean, default: false }, hint: { type: String, default: "" } },
  computed: {
    range() {
      if (this.log) return { min: 0, max: SPAN, step: 1 }
      return this.steps ? { min: 0, max: this.steps.length - 1, step: 1 } : { min: this.min, max: this.max, step: this.step }
    },
    lowest() {
      return this.typedMin === undefined ? this.min : this.typedMin
    },
    highest() {
      return this.typedMax === undefined ? this.max : this.typedMax
    },
    position() {
      if (this.log) return Math.clamp(Math.round(Math.log(this.value / this.min) / Math.log(this.max / this.min) * SPAN), 0, SPAN)
      return this.steps ? this.nearest(this.value) : this.value
    },
    shown() {
      return +this.value.toFixed(2)
    },
    fill() {
      const { min: low, max: high } = this.range
      const share = value => Math.clamp((value - low) / (high - low) * 100, 0, 100)
      const [from, to] = [share(Math.clamp(0, low, high)), share(this.position)].sort((a, b) => a - b)
      return { "--from": `${from}%`, "--to": `${to}%` }
    }
  },
  methods: {
    nearest(number) {
      return this.steps.reduce((best, step, index) => Math.abs(step - number) < Math.abs(this.steps[best] - number) ? index : best, 0)
    },
    slide(event) {
      const at = event.target.valueAsNumber
      if (this.log) this.$emit("change", Math.round(this.min * (this.max / this.min) ** (at / SPAN) / this.step) * this.step)
      else this.$emit("change", this.steps ? this.steps[at] : at)
    },
    stepped(number) {
      const base = this.lowest ?? 0
      const decimals = String(this.step).split(".")[1]?.length ?? 0
      return Number((base + Math.round((number - base) / this.step) * this.step).toFixed(decimals))
    },
    typed(event) {
      const number = event.target.valueAsNumber
      if (!Number.isNaN(number)) this.$emit("change", this.steps ? this.steps[this.nearest(number)] : Math.clamp(this.stepped(number), this.lowest ?? -Infinity, this.highest ?? Infinity))
      this.$nextTick(() => event.target.value = this.shown)
      this.$emit("done")
    }
  },
  template: `
    <div class="mtg-slider" :title="hint">
      <label>{{ label }}</label>
      <input type="number" class="dark_bordered" :value="shown" :min="steps ? min : lowest" :max="steps ? max : highest" :step="steps ? 'any' : step" @change="typed">
      <input type="range" class="tool" :value="position" :min="range.min" :max="range.max" :step="range.step" :style="fill" @input="slide" @change="$emit('done')">
    </div>
  `
}

export const DropdownControl = {
  props: { value: {}, options: Array, label: { type: String, default: "" } },
  computed: {
    named() {
      return Object.fromEntries(this.options.map((option, index) => [`option-${index}`, { name: option.label }]))
    },
    chosen() {
      return `option-${this.options.findIndex(option => option.value === this.value)}`
    }
  },
  methods: {
    pick(key) {
      this.$emit("change", this.options[Number(key.slice(7))].value)
    }
  },
  template: `
    <div class="mtg-field mtg-fill">
      <label v-if="label">{{ label }}</label>
      <select-input :value="chosen" :options="named" @input="pick" />
    </div>
  `
}

export const SegmentsControl = {
  props: { value: {}, options: Array, label: { type: String, default: "" }, hint: { type: String, default: "" } },
  template: `
    <div class="mtg-field" :title="hint">
      <label v-if="label">{{ label }}</label>
      <ul class="form_inline_select">
        <li v-for="option of options" :key="String(option.value)" :class="{ selected: option.value === value }" :title="option.title" @click="$emit('change', option.value)">{{ option.label }}</li>
      </ul>
    </div>
  `
}

export const RadioControl = {
  props: { value: {}, options: Array, label: { type: String, default: "" } },
  template: `
    <div class="mtg-field">
      <label v-if="label">{{ label }}</label>
      <div class="mtg-radios">
        <label v-for="option of options" :key="String(option.value)" class="mtg-radio" :class="{ selected: option.value === value }" :title="option.title"><input type="radio" :checked="option.value === value" @change="$emit('change', option.value)"><span>{{ option.label }}</span></label>
      </div>
    </div>
  `
}

export const ToggleControl = {
  props: { value: Boolean, label: String, hint: { type: String, default: "" } },
  template: `
    <label class="mtg-toggle" :title="hint">
      <span>{{ label }}</span>
      <input type="checkbox" :checked="value" @change="$emit('change', $event.target.checked)">
    </label>
  `
}

export const NumberControl = {
  props: { value: Number, label: String, min: { type: Number, default: 1 }, disabled: Boolean },
  methods: {
    typed(event) {
      const number = event.target.valueAsNumber
      if (Number.isInteger(number) && number >= this.min) this.$emit("change", number)
      else event.target.value = this.value
    }
  },
  template: `
    <div class="mtg-field mtg-fill">
      <label>{{ label }}</label>
      <input type="number" class="dark_bordered" :min="min" :value="value" :disabled="disabled" @change="typed">
    </div>
  `
}

export const ColourControl = {
  props: { value: String },
  watch: {
    value(next) {
      if (this.picker.get().toHexString() !== next.toLowerCase()) this.picker.set(next)
    }
  },
  mounted() {
    this.picker = new ColorPicker({ id: `mtg_colour_${++pickers}`, name: "Color", label: false, private: true, value: this.value })
    this.picker.jq.spectrum("option", "showAlpha", false)
    this.picker.onChange = colour => {
      this.$emit("change", colour.toHexString())
      this.$emit("done")
    }
    this.picker.on("modify_color", ({ color }) => this.$emit("change", color.toHexString()))
    this.$refs.holder.append(this.picker.getNode())
  },
  beforeDestroy() {
    this.picker.jq.spectrum("destroy")
  },
  template: `<div ref="holder" class="mtg-colour"></div>`
}

export const INPUTS = { SliderControl, DropdownControl, SegmentsControl, RadioControl, ToggleControl, NumberControl, ColourControl }
