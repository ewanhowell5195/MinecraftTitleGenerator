import { onBeforeUnmount, watch } from "vue"

const DRAG_DISTANCE = 6
const LONG_PRESS = 500

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

const handlers = new WeakMap()

export const vLongPress = {
  mounted(element) {
    let timer = null
    let start = null
    let fired = false

    function cancel() {
      clearTimeout(timer)
      timer = null
    }

    function down(event) {
      fired = false
      cancel()
      if (event.pointerType !== "touch") return
      start = event
      timer = setTimeout(() => {
        timer = null
        fired = true
        element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: start.clientX, clientY: start.clientY }))
      }, LONG_PRESS)
    }

    function move(event) {
      if (timer && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= DRAG_DISTANCE) cancel()
    }

    function menu(event) {
      if (!event.isTrusted) return
      cancel()
      if (fired) event.stopImmediatePropagation()
    }

    function click(event) {
      if (!fired) return
      fired = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const listeners = { pointerdown: down, pointermove: move, pointerup: cancel, pointercancel: cancel, contextmenu: menu, click }
    for (const [type, listener] of Object.entries(listeners)) element.addEventListener(type, listener, true)
    element.style.webkitTouchCallout = "none"
    handlers.set(element, { listeners, cancel })
  },
  unmounted(element) {
    const { listeners, cancel } = handlers.get(element)
    cancel()
    for (const [type, listener] of Object.entries(listeners)) element.removeEventListener(type, listener, true)
    handlers.delete(element)
  }
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
