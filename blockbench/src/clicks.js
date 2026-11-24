const STILL = 4

let waiting = null

function at({ clientX, clientY, changedTouches }) {
  return changedTouches?.length ? [changedTouches[0].clientX, changedTouches[0].clientY] : [clientX, clientY]
}

function stopWaiting() {
  if (!waiting) return
  removeEventListener("pointerup", waiting, true)
  removeEventListener("pointercancel", stopWaiting, true)
  waiting = null
}

function selectOnRelease(element, from) {
  stopWaiting()
  waiting = event => {
    stopWaiting()
    const [x, y] = at(event)
    if (Math.hypot(x - from[0], y - from[1]) < STILL && Outliner.elements.includes(element)) element.clickSelect({})
  }
  addEventListener("pointerup", waiting, true)
  addEventListener("pointercancel", stopWaiting, true)
}

export function chooseClicked(data) {
  const { element, event } = data
  if (!element?.isWord || event.shiftKey || event.ctrlOrCmd || event.altKey) return
  const { line } = element
  const [only] = Outliner.selected.length === 1 ? Outliner.selected : []
  if (only === line || only === element) {
    data.element = only
    selectOnRelease(only === line ? element : line, at(event))
  } else if (!Outliner.selected.some(other => other.isWord)) data.element = line
}
