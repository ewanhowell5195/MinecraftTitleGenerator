import { nextTick, ref, watch } from "vue"

export function variantRows(variants) {
  return Math.ceil((variants.length + 1) / 3)
}

export function leastRows(entries) {
  return Math.min(2, Math.ceil(entries.length / 3))
}

function outerHeight(child) {
  const style = getComputedStyle(child)
  const own = child.classList.contains("scroll") ? parseFloat(style.minHeight) || 0 : child.getBoundingClientRect().height
  return own + parseFloat(style.marginTop) + parseFloat(style.marginBottom)
}

export function usePickFloor(changes) {
  const picker = ref(null)
  const floor = ref(0)

  function measure() {
    const box = picker.value
    if (!box) return
    const children = Array.from(box.children)
    floor.value = children.reduce((total, child) => total + outerHeight(child), 0) + parseFloat(getComputedStyle(box).rowGap) * Math.max(0, children.length - 1)
  }

  watch(picker, (box, _, onCleanup) => {
    if (!box) return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    onCleanup(() => observer.disconnect())
  })

  watch(changes, () => nextTick(measure))

  return { picker, floor }
}
