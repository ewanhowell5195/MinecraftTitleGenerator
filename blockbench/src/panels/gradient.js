import { ref } from "vue"
import { clamp } from "#lib/core/maths.js"
import { useGradientStops } from "#lib/panels/gradientStops.js"
import { DEFAULT_MIX } from "#lib/texture/colourStops.js"
import { followDrag, sortRows } from "./drag.js"
import { ColourControl } from "./inputs.js"

export const GradientControl = {
  components: { ColourControl },
  props: { value: Array, smooth: { type: Boolean, default: true }, mix: { type: String, default: DEFAULT_MIX }, angle: { type: Number, default: 0 }, min: { type: Number, default: 2 } },
  setup(props, { emit }) {
    const track = ref(null)
    const rows = ref(null)

    function change(action) {
      emit("press")
      action()
    }

    const gradient = useGradientStops({ stops: () => props.value, props, change })

    function begin(index, event) {
      if (event.button !== 0) return
      event.preventDefault()
      gradient.hold(index)
      followDrag(moved => gradient.drag(index, track.value, moved), () => {
        gradient.drop(index)
        emit("done")
      })
    }

    function add(event) {
      if (event.button === 0) begin(gradient.add(track.value, event), event)
    }

    function remove(index) {
      gradient.remove(index)
      emit("done")
    }

    function recolour(index, colour) {
      change(() => (props.value[index].colour = colour))
    }

    function locate(index, event) {
      const number = event.target.valueAsNumber
      if (!Number.isNaN(number)) change(() => (props.value[index].position = Math.round(clamp(number, 0, 100))))
      event.target.value = props.value[index].position
      emit("done")
    }

    function sort(event, from) {
      if (event.button !== 0) return
      const held = gradient.beginSort(gradient.order.value[from])
      let moved = false
      sortRows(event, rows.value, from, {
        move(at, to) {
          moved = true
          gradient.sortTo(held, to)
        },
        end() {
          gradient.endSort(moved)
          if (moved) emit("done")
        }
      })
    }

    return { ...gradient, add, begin, locate, recolour, remove, rows, sort, track }
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
