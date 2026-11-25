<script setup>
  import { computed, onBeforeUnmount, ref } from "vue"
  import { trackPointer } from "../components/composables/events.js"
  import { DEFAULT_MIX } from "../lib/texture/colourStops.js"
  import { useGradientStops } from "../lib/panels/gradientStops.js"
  import { clamp } from "../lib/core/maths.js"
  import { useListReorder } from "../components/composables/reorder.js"
  import Button from "../components/Button.vue"
  import ColourPicker from "../components/ColourPicker.vue"
  import Icon from "../components/Icon.vue"
  import NumberInput from "../components/NumberInput.vue"

  const props = defineProps({
    smooth: { type: Boolean, default: true },
    mix: { type: String, default: DEFAULT_MIX },
    angle: { type: Number, default: 0 },
    min: { type: Number, default: 2 }
  })

  const stops = defineModel({ type: Array, required: true })
  const track = ref(null)
  let stopDrag = null

  const { add, background, beginSort, drag, drop, endSort, ends, hold, order, removable, remove, removing, selected, sortTo, type } = useGradientStops({ stops: () => stops.value, props })
  const stop = computed(() => stops.value[selected.value] ?? null)

  function begin(index, event) {
    if (event.button !== 0) return
    hold(index)
    stopDrag = trackPointer(moved => drag(index, track.value, moved), () => {
      drop(index)
      stopDrag = null
    })
    event.preventDefault()
  }

  function insert(event) {
    if (event.button === 0) begin(add(track.value, event), event)
  }

  function nudge(event, by) {
    stop.value.position = clamp(stop.value.position + by * (event.shiftKey ? 10 : 1), 0, 100)
  }

  function locate(index, next) {
    if (typeof next === "number") stops.value[index].position = next
  }

  const box = ref(null)
  const rows = []
  const { dragged, press } = useListReorder({ box, rows, ids: () => order.value, begin: beginSort, move: sortTo, release: (sort, active) => endSort(active) })

  onBeforeUnmount(() => stopDrag?.())
</script>

<template>
  <div class="gradient-editor">
    <div class="bar" :style="{ background }"></div>
    <div class="track" ref="track" @pointerdown.self="insert" v-tooltip="{ text: 'Click to add a colour, drag a colour down to remove it', anchor: 'cursor-x' }">
      <button v-for="(item, index) of stops" :key="index" class="stop" :class="{ selected: index === selected, removing: removing && index === selected }" :style="{ left: `${item.position}%` }" @pointerdown="begin(index, $event)" @keydown.left.prevent="nudge($event, -1)" @keydown.right.prevent="nudge($event, 1)" @keydown.delete.prevent="remove(index)" @focus="selected = index" :aria-label="`Colour at ${item.position}%`">
        <span :style="{ background: item.colour }"></span>
      </button>
    </div>
    <div class="ends">
      <span>{{ ends[0] }}</span>
      <span>{{ ends[1] }}</span>
    </div>
    <div ref="box" class="stop-rows">
      <div v-for="index of order" :key="index" :ref="el => (rows[index] = el)" class="stop-row input-row" :class="{ dragged: dragged === index }" @focusin="selected = index">
        <span v-if="stops.length > 1" class="grip" @pointerdown="press($event, index)"><Icon name="grip" :size="14" /></span>
        <ColourPicker class="grow" v-model="stops[index].colour" />
        <label class="location" v-tooltip="'Location'">
          <NumberInput :model-value="stops[index].position" @update:model-value="locate(index, $event)" aria-label="Location" min="0" max="100" step="1" @focus="type(true)" @blur="type(false)" />
          <span>%</span>
        </label>
        <Button ghost icon="trash" title="Remove colour" :disabled="!removable" @click="remove(index)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
  .gradient-editor {
    display: flex;
    flex-direction: column;
  }

  .bar {
    height: 32px;
    margin: 0 7px;
    box-shadow: inset 0 0 0 1px var(--swatch-line);
  }

  .track {
    position: relative;
    height: 26px;
    margin: 0 7px;
    cursor: copy;
    touch-action: none;
  }

  .stop {
    position: absolute;
    top: 0;
    width: 14px;
    height: 22px;
    margin-left: -7px;
    padding: 0;
    background: none;
    border: none;
    cursor: ew-resize;
    touch-action: none;
  }

  .stop::before {
    content: "";
    position: absolute;
    top: 0;
    left: 2px;
    border: 5px solid transparent;
    border-top: none;
    border-bottom: 6px solid var(--muted);
  }

  .stop span {
    position: absolute;
    top: 6px;
    left: 0;
    width: 14px;
    height: 14px;
    border: 2px solid var(--muted);
  }

  .stop:hover,
  .stop:active:not(:disabled) {
    background: none;
    transform: none;
  }

  .stop.selected::before {
    border-bottom-color: var(--accent);
  }

  .stop.selected span {
    border-color: var(--accent);
  }

  .stop.removing {
    opacity: 0.3;
  }

  .stop:focus-visible {
    outline: none;
  }

  .stop:focus-visible span {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .ends {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-sm);
    color: var(--faint);
    user-select: none;
  }

  .stop-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .stop-row {
    gap: 6px;
  }

  .stop-row.dragged {
    position: relative;
    z-index: 1;
    background: var(--surface);
    box-shadow: var(--drag-shadow);
  }

  .stop-row.dragged,
  .stop-row.dragged .grip {
    cursor: grabbing;
  }

  .location {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-md);
    color: var(--faint);
    user-select: none;
  }

  .location .number-input {
    align-self: stretch;
    width: 64px;
  }
</style>
