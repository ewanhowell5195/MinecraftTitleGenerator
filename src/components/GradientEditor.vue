<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import { trackPointer } from "../lib/events.js"
  import { blend, cssGradient, movedStopPositions } from "../lib/material.js"
  import { clamp } from "../lib/maths.js"
  import { useReorderDrag } from "../lib/reorder.js"
  import Button from "./Button.vue"
  import ColourPicker from "./ColourPicker.vue"
  import Icon from "./Icon.vue"
  import NumberInput from "./NumberInput.vue"

  const REMOVE_DISTANCE = 28
  const ENDS = { 0: ["Top", "Bottom"], 90: ["Right", "Left"], 180: ["Bottom", "Top"], 270: ["Left", "Right"], 360: ["Top", "Bottom"] }

  const props = defineProps({
    smooth: { type: Boolean, default: true },
    angle: { type: Number, default: 0 },
    min: { type: Number, default: 2 }
  })

  const stops = defineModel({ type: Array, required: true })
  const track = ref(null)
  const selected = ref(0)
  const removing = ref(false)
  const typing = ref(false)
  const order = ref(sortedStops())
  let drag = null

  const ends = computed(() => ENDS[props.angle] ?? ["Start", "End"])
  const background = computed(() => cssGradient(stops.value, props.smooth, "to right"))

  const stop = computed(() => stops.value[selected.value] ?? null)
  const removable = computed(() => stops.value.length > props.min)

  function colourAt(position) {
    const list = stops.value.map(stop => ({ colour: stop.colour, position: clamp(stop.position, 0, 100) })).sort((a, b) => a.position - b.position)
    const after = list.findIndex(item => item.position >= position)
    if (after === -1) return list[list.length - 1].colour
    if (after === 0) return list[0].colour
    const from = list[after - 1]
    const to = list[after]
    return blend(from.colour, to.colour, (position - from.position) / (to.position - from.position))
  }

  function positionAt(x) {
    const rect = track.value.getBoundingClientRect()
    return Math.round(clamp((x - rect.left) / rect.width, 0, 1) * 100)
  }

  function begin(index, event) {
    selected.value = index
    drag = { index, top: track.value.getBoundingClientRect().bottom, stop: trackPointer(move, end) }
    removing.value = false
    event.preventDefault()
  }

  function add(event) {
    const position = positionAt(event.clientX)
    stops.value.push({ colour: colourAt(position), position })
    begin(stops.value.length - 1, event)
  }

  function move(event) {
    stops.value[drag.index].position = positionAt(event.clientX)
    removing.value = removable.value && event.clientY - drag.top > REMOVE_DISTANCE
  }

  function remove(index) {
    if (!removable.value) return
    stops.value.splice(index, 1)
  }

  function end() {
    if (removing.value) remove(drag.index)
    removing.value = false
    drag = null
  }

  function nudge(event, by) {
    stop.value.position = clamp(stop.value.position + by * (event.shiftKey ? 10 : 1), 0, 100)
  }

  function sortedStops() {
    return Array.from(stops.value.keys()).sort((a, b) => stops.value[a].position - stops.value[b].position)
  }

  function finishTyping() {
    typing.value = false
    order.value = sortedStops()
  }

  const box = ref(null)
  const rows = []
  const { dragged, press } = useReorderDrag({ prevent: true, begin: beginSort, point: event => event.clientY, reorder, follow, release })

  function beginSort(event, index) {
    selected.value = index
    const sorted = sortedStops()
    return { id: index, grab: event.clientY - rows[index].getBoundingClientRect().top, sorted, from: sorted.indexOf(index), positions: sorted.map(item => stops.value[item].position) }
  }

  function reorder(sort) {
    const to = order.value.filter(index => {
      if (index === sort.id) return false
      const rect = rows[index].getBoundingClientRect()
      return rect.top + rect.height / 2 < sort.point
    }).length
    if (to === order.value.indexOf(sort.id)) return
    const next = sort.sorted.slice()
    next.splice(to, 0, next.splice(sort.from, 1)[0])
    order.value = next
    movedStopPositions(sort.positions, sort.from, to).forEach((position, slot) => stops.value[next[slot]].position = position)
  }

  function follow(sort) {
    for (const index of order.value) rows[index].style.transform = ""
    const row = rows[sort.id]
    const rect = row.getBoundingClientRect()
    const area = box.value.getBoundingClientRect()
    row.style.transform = `translateY(${clamp(sort.point - sort.grab, area.top, area.bottom - rect.height) - rect.top}px)`
  }

  function release(sort, active) {
    if (!active) return
    for (const index of order.value) rows[index].style.transform = ""
    selected.value = order.value.indexOf(sort.id)
    stops.value.splice(0, stops.value.length, ...order.value.map(index => stops.value[index]))
    order.value = sortedStops()
  }

  watch(() => stops.value.length, length => {
    if (selected.value >= length) selected.value = length - 1
    order.value = sortedStops()
  })

  watch(() => stops.value.map(stop => stop.position).join(), () => {
    if (!typing.value && dragged.value === null) order.value = sortedStops()
  })

  onBeforeUnmount(() => drag?.stop())
</script>

<template>
  <div class="gradient-editor">
    <div class="bar" :style="{ background }"></div>
    <div class="track" ref="track" @pointerdown.self="add" title="Click to add a colour, drag a colour down to remove it">
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
        <span v-if="stops.length > 1" class="grip" @pointerdown="press($event, index)" title="Drag to reorder"><Icon name="grip" :size="14" /></span>
        <ColourPicker class="grow" v-model="stops[index].colour" />
        <label class="location" title="Location">
          <NumberInput v-model.number="stops[index].position" min="0" max="100" step="1" @focus="typing = true" @blur="finishTyping" />
          <span>%</span>
        </label>
        <Button tiny ghost :disabled="!removable" @click="remove(index)" title="Remove colour"><template #icon><Icon name="trash" :size="14" /></template></Button>
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
    box-shadow: inset 0 0 0 1px #ffffff1a;
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
    min-height: 0;
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
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
