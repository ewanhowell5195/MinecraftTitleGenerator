import { nextTick, onBeforeUnmount, ref } from "vue"
import { dragPointer } from "./events.js"

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
