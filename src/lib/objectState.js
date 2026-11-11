import { computed, onBeforeUnmount, watch } from "vue"
import { framing } from "./framing.js"
import { placementOf } from "./placement.js"

export function usePlacement(object, title, { scale, wordScale, measures }) {
  const outlineGrow = computed(() => scale.value.map((value, axis) => (object.scaleOutline ? 1 : value) * (object.wordScaleOutline ? 1 : wordScale.value[axis])))
  const transform = computed(() => placementOf(object, title, { ...measures(), scale: scale.value, wordScale: wordScale.value, outlineGrow: outlineGrow.value }))

  function outlineScale() {
    const type = object.type === "bottom" ? transform.value.type : [1, 1, 1]
    return type.map((value, axis) => value * outlineGrow.value[axis])
  }

  function outlineOf(built, shell) {
    return computed(() => built.value && shell(built.value, outlineScale()))
  }

  function haloOf(built, shell) {
    return computed(() => {
      if (!built.value || !title.view.render || !framing.outline) return null
      const size = outlineScale()
      const { type } = transform.value
      return shell(built.value, size, size.map((value, axis) => framing.outlineWidth * value / (type[axis] * (scale.value[axis] * wordScale.value[axis]))))
    })
  }

  return { transform, outlineOf, haloOf }
}

export function setHeights(object, title, values) {
  title.heights[object.id] = { ...title.heights[object.id], ...values }
}

export function usePublished(object, title, { size, scaleY, entry }) {
  watch(entry, value => (title.runtime[object.id] = value), { immediate: true })
  watch(size, values => setHeights(object, title, values), { immediate: true })
  watch(scaleY, value => setHeights(object, title, { scaleY: value }), { immediate: true })

  onBeforeUnmount(() => {
    delete title.runtime[object.id]
    delete title.heights[object.id]
  })
}
