import { computed, ref, watch } from "vue"
import { clamp } from "../core/maths.js"
import { cssGradient, movedStopPositions, stopColour } from "../texture/colourStops.js"

const REMOVE_DISTANCE = 28
const ENDS = { 0: ["Top", "Bottom"], 90: ["Right", "Left"], 180: ["Bottom", "Top"], 270: ["Left", "Right"], 360: ["Top", "Bottom"] }

export function useGradientStops({ stops, props, change = action => action() }) {
  const selected = ref(0)
  const removing = ref(false)
  const sorting = ref(false)
  const typing = ref(false)
  const order = ref(sortedStops())

  const ends = computed(() => ENDS[props.angle] ?? ["Start", "End"])
  const background = computed(() => cssGradient(stops(), props.smooth, "to right", props.mix))
  const removable = computed(() => stops().length > props.min)

  function sortedStops() {
    return Array.from(stops().keys()).sort((a, b) => stops()[a].position - stops()[b].position)
  }

  function positionAt(track, x) {
    const { left, width } = track.getBoundingClientRect()
    return Math.round(clamp((x - left) / width, 0, 1) * 100)
  }

  function colourAt(position) {
    return stopColour(stops().map(stop => ({ colour: stop.colour, position: clamp(stop.position, 0, 100) })).sort((a, b) => a.position - b.position), position, props.mix)
  }

  function add(track, { clientX }) {
    const position = positionAt(track, clientX)
    const colour = colourAt(position)
    change(() => stops().push({ colour, position }))
    return stops().length - 1
  }

  function hold(index) {
    selected.value = index
    removing.value = false
  }

  function drag(index, track, { clientX, clientY }) {
    change(() => (stops()[index].position = positionAt(track, clientX)))
    removing.value = removable.value && clientY - track.getBoundingClientRect().bottom > REMOVE_DISTANCE
  }

  function remove(index) {
    if (removable.value) change(() => stops().splice(index, 1))
  }

  function drop(index) {
    if (removing.value) remove(index)
    removing.value = false
  }

  function beginSort(index) {
    selected.value = index
    sorting.value = true
    const sorted = sortedStops()
    return { sorted, from: sorted.indexOf(index), positions: sorted.map(item => stops()[item].position) }
  }

  function sortTo(sort, to) {
    const next = sort.sorted.slice()
    next.splice(to, 0, next.splice(sort.from, 1)[0])
    order.value = next
    change(() => movedStopPositions(sort.positions, sort.from, to).forEach((position, slot) => (stops()[next[slot]].position = position)))
  }

  function endSort(moved) {
    sorting.value = false
    if (!moved) return
    const next = order.value
    selected.value = next.indexOf(selected.value)
    change(() => stops().splice(0, stops().length, ...next.map(index => stops()[index])))
    order.value = sortedStops()
  }

  function type(on) {
    typing.value = on
    if (!on) order.value = sortedStops()
  }

  watch(() => stops().length, length => {
    if (selected.value >= length) selected.value = length - 1
    order.value = sortedStops()
  })

  watch(() => stops().map(stop => stop.position).join(), () => {
    if (!sorting.value && !typing.value) order.value = sortedStops()
  })

  return { add, background, beginSort, drag, drop, endSort, ends, hold, order, removable, remove, removing, selected, sortTo, type }
}
