import { watch } from "vue"
import { useWindowEvents } from "./events.js"

const REOPEN_DELAY = 300
const MOVED = 1

export function usePopover(open, { popover, trigger = () => null, focus = trigger, close }) {
  let start = null

  function corner() {
    const rect = trigger()?.getBoundingClientRect()
    return rect ? [rect.left, rect.top] : null
  }

  function outside(event) {
    if (![popover(), trigger()].some(element => element?.contains(event.target))) close()
  }

  function scrolled(event) {
    if (!start || popover()?.contains(event.target)) return
    const now = corner()
    if (!now || Math.hypot(now[0] - start[0], now[1] - start[1]) >= MOVED) close()
  }

  function key(event) {
    if (event.key !== "Escape") return
    event.preventDefault()
    event.stopPropagation()
    close()
    focus()?.focus()
  }

  watch(open, on => (start = on ? corner() : null), { immediate: true })
  useWindowEvents(open, { resize: () => close() }, { pointerdown: outside, scroll: scrolled, keydown: key })

  return { outside }
}

export function reopenGuard() {
  let closed = null
  return {
    note: (key = null) => (closed = { key, time: performance.now() }),
    recent: (key = null) => closed?.key === key && performance.now() - closed.time < REOPEN_DELAY
  }
}
