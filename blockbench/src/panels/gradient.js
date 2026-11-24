import { clamp } from "../../../src/lib/core/maths.js"
import { DEFAULT_MIX, cssGradient, movedStopPositions, stopColour } from "../../../src/lib/texture/colourStops.js"
import { followDrag, sortRows } from "./drag.js"
import { ColourControl } from "./inputs.js"

const REMOVE_DISTANCE = 28
const ENDS = { 0: ["Top", "Bottom"], 90: ["Right", "Left"], 180: ["Bottom", "Top"], 270: ["Left", "Right"], 360: ["Top", "Bottom"] }

export const GradientControl = {
  components: { ColourControl },
  props: { value: Array, smooth: { type: Boolean, default: true }, mix: { type: String, default: DEFAULT_MIX }, angle: { type: Number, default: 0 }, min: { type: Number, default: 2 } },
  data: () => ({ selected: 0, removing: false, sorting: null }),
  computed: {
    ends() {
      return ENDS[this.angle] ?? ["Start", "End"]
    },
    background() {
      return cssGradient(this.value, this.smooth, "to right", this.mix)
    },
    removable() {
      return this.value.length > this.min
    },
    order() {
      return this.sorting ?? this.sorted()
    }
  },
  watch: {
    "value.length"(length) {
      if (this.selected >= length) this.selected = length - 1
    }
  },
  methods: {
    sorted() {
      return Array.from(this.value.keys()).sort((a, b) => this.value[a].position - this.value[b].position)
    },
    change(action) {
      this.$emit("press")
      action()
    },
    positionAt(x) {
      const { left, width } = this.$refs.track.getBoundingClientRect()
      return Math.round(clamp((x - left) / width, 0, 1) * 100)
    },
    begin(index, event) {
      if (event.button !== 0) return
      event.preventDefault()
      this.selected = index
      this.removing = false
      const { bottom } = this.$refs.track.getBoundingClientRect()
      followDrag(({ clientX, clientY }) => {
        this.change(() => (this.value[index].position = this.positionAt(clientX)))
        this.removing = this.removable && clientY - bottom > REMOVE_DISTANCE
      }, () => {
        if (this.removing) this.change(() => this.value.splice(index, 1))
        this.removing = false
        this.$emit("done")
      })
    },
    add(event) {
      if (event.button !== 0) return
      const position = this.positionAt(event.clientX)
      const stops = this.value.map(stop => ({ ...stop })).sort((a, b) => a.position - b.position)
      this.change(() => this.value.push({ colour: stopColour(stops, position, this.mix), position }))
      this.begin(this.value.length - 1, event)
    },
    remove(index) {
      this.change(() => this.value.splice(index, 1))
      this.$emit("done")
    },
    recolour(index, colour) {
      this.change(() => (this.value[index].colour = colour))
    },
    locate(index, event) {
      const number = event.target.valueAsNumber
      if (!Number.isNaN(number)) this.change(() => (this.value[index].position = Math.round(clamp(number, 0, 100))))
      event.target.value = this.value[index].position
      this.$emit("done")
    },
    sort(event, from) {
      const order = this.sorted()
      const positions = order.map(index => this.value[index].position)
      this.selected = order[from]
      let next = order
      sortRows(event, this.$refs.rows, from, {
        move: (at, to) => this.change(() => {
          next = order.slice()
          next.splice(to, 0, next.splice(from, 1)[0])
          this.sorting = next
          movedStopPositions(positions, from, to).forEach((position, slot) => (this.value[next[slot]].position = position))
        }),
        end: () => {
          this.sorting = null
          if (next === order) return
          this.change(() => this.value.splice(0, this.value.length, ...next.map(index => this.value[index])))
          this.selected = next.indexOf(this.selected)
          this.$emit("done")
        }
      })
    }
  },
  template: `
    <div class="mtg-gradient">
      <div class="mtg-gradient-bar" :style="{ background }"></div>
      <div ref="track" class="mtg-gradient-track" title="Click to add a colour, drag a colour down to remove it" @pointerdown.self="add">
        <div v-for="(stop, index) of value" :key="index" class="mtg-stop" :class="{ selected: index === selected, removing: removing && index === selected }" :style="{ left: stop.position + '%' }" @pointerdown="begin(index, $event)"><span :style="{ background: stop.colour }"></span></div>
      </div>
      <div class="mtg-ends"><span>{{ ends[0] }}</span><span>{{ ends[1] }}</span></div>
      <div ref="rows" class="mtg-rows">
        <div v-for="(index, slot) of order" :key="index" class="mtg-row">
          <i v-if="value.length > 1" class="material-icons mtg-grip" @pointerdown="sort($event, slot)">drag_handle</i>
          <colour-control class="mtg-fill" :value="value[index].colour" @change="recolour(index, $event)" @done="$emit('done')" />
          <input type="number" class="dark_bordered mtg-number" title="Location" min="0" max="100" step="1" :value="value[index].position" @change="locate(index, $event)">
          <div class="tool" :class="{ disabled: !removable }" title="Remove colour" @click="removable && remove(index)"><i class="material-icons">delete</i></div>
        </div>
      </div>
    </div>
  `
}
