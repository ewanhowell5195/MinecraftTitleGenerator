import { computed, watch } from "vue"
import { PIXEL_HEIGHT_LIMIT } from "../lib/font/fontEditor.js"

function most(other) {
  return Number.isInteger(other) && other >= 1 ? Math.max(1, Math.floor(PIXEL_HEIGHT_LIMIT / other)) : PIXEL_HEIGHT_LIMIT
}

export function limitSize(height, square) {
  watch([height, square], ([rows, size], [oldRows]) => {
    if (!Number.isInteger(rows) || !Number.isInteger(size) || rows * size <= PIXEL_HEIGHT_LIMIT) return
    if (rows !== oldRows) height.value = most(size)
    else square.value = most(rows)
  })
  return { mostRows: computed(() => most(square.value)), mostSquare: computed(() => most(height.value)) }
}

export function resettable(fields, defaults, [rows, square]) {
  return {
    changed: key => fields[key].value !== defaults[key],
    reset(key) {
      fields[key].value = defaults[key]
      if (fields[rows].value * fields[square].value <= PIXEL_HEIGHT_LIMIT) return
      fields[rows].value = defaults[rows]
      fields[square].value = defaults[square]
    }
  }
}
