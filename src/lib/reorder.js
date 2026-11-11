import { nextTick, onBeforeUnmount, ref } from "vue"
import { dragPointer } from "./events.js"
import { clamp } from "./maths.js"

export function useReorderDrag({ prevent = false, begin, point, reorder, follow, release }) {
  const dragged = ref(null)
  let drag = null

  function press(event, ...target) {
    if (event.button !== 0) return
    if (prevent) event.preventDefault()
    drag = begin(event, ...target)
    drag.stop = dragPointer(event, { start, move, end })
  }

  function start() {
    dragged.value = drag.id
  }

  function move(event) {
    drag.point = point(event, drag)
    reorder(drag)
    dragged.value = drag.id
    nextTick(() => drag && follow(drag))
  }

  function end(active) {
    release(drag, active)
    drag = null
    dragged.value = null
  }

  onBeforeUnmount(() => drag?.stop())

  return { dragged, press }
}

export function clampedSpot(element, area, [left, top]) {
  const rect = element.getBoundingClientRect()
  const bounds = area.getBoundingClientRect()
  return [left === null ? rect.left : clamp(left, bounds.left, bounds.right - rect.width), top === null ? rect.top : clamp(top, bounds.top, bounds.bottom - rect.height)]
}

export function followPointer(element, area, spot) {
  element.style.transform = ""
  const rect = element.getBoundingClientRect()
  const [left, top] = clampedSpot(element, area, spot)
  element.style.transform = `translate(${left - rect.left}px, ${top - rect.top}px)`
}

export function useListReorder({ box, rows, ids, begin = () => ({}), move, release = () => {} }) {
  function clear() {
    for (const id of ids()) rows[id].style.transform = ""
  }

  function start(event, id) {
    return { ...begin(id), id, grab: event.clientY - rows[id].getBoundingClientRect().top }
  }

  function reorder(drag) {
    const order = ids()
    const to = order.filter(id => id !== drag.id && middle(rows[id]) < drag.point).length
    if (to !== order.indexOf(drag.id)) move(drag, to)
  }

  function follow(drag) {
    clear()
    followPointer(rows[drag.id], box.value, [null, drag.point - drag.grab])
  }

  function end(drag, active) {
    clear()
    release(drag, active)
  }

  return useReorderDrag({ prevent: true, begin: start, point: event => event.clientY, reorder, follow, release: end })
}

function middle(element) {
  const rect = element.getBoundingClientRect()
  return rect.top + rect.height / 2
}
