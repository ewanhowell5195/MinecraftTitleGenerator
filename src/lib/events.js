import { onBeforeUnmount, watch } from "vue"

const DRAG_DISTANCE = 6

export function trackPointer(move, end) {
  function stop(event) {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", stop)
    window.removeEventListener("pointercancel", stop)
    end?.(event)
  }
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", stop)
  window.addEventListener("pointercancel", stop)
  return stop
}

export function dragPointer(event, { start, move, end }) {
  let active = false
  return trackPointer(moveEvent => {
    if (!active) {
      if (Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) < DRAG_DISTANCE) return
      active = true
      start()
    }
    move(moveEvent)
  }, () => end(active))
}

export function useWindowEvents(active, handlers, capturing = {}) {
  function listen(on) {
    const method = on ? "addEventListener" : "removeEventListener"
    for (const [type, handler] of Object.entries(handlers)) window[method](type, handler)
    for (const [type, handler] of Object.entries(capturing)) window[method](type, handler, true)
  }
  watch(active, listen, { immediate: true })
  onBeforeUnmount(() => listen(false))
}
